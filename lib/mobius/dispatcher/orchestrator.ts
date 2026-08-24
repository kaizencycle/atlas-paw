import { createHash, randomUUID } from "crypto";
import {
  brokerPublicUrl,
  claimJob,
  listActiveJobs,
  DEFAULT_LEASE_SECONDS,
  DEFAULT_RUNTIME_ID,
  type BrokerClaimRequest,
  type BrokerLease,
} from "@/lib/mobius/broker/client";
import { reconcileCycle } from "@/lib/mobius/cycle/reconciler";
import {
  checkGitHubOverlap,
  type OverlapHit,
} from "@/lib/mobius/github/overlap-checker";
import { findHomeroomJob, persistLeaseProjection } from "@/lib/mobius/notion/client";
import {
  parseJobNumber,
  brokerJobIdFromNumber,
  type HomeroomJob,
} from "@/lib/mobius/notion/schema";

export type DispatchRequest = {
  jobId: string;
  cycle: string;
  repositories: string[];
  scopePaths: string[];
  branch: string;
  leaseSeconds?: number;
};

export type DispatchStatus =
  | "DISABLED"
  | "CONFIG_INCOMPLETE"
  | "JOB_NOT_FOUND"
  | "JOB_NOT_AVAILABLE"
  | "CYCLE_MISMATCH"
  | "CYCLE_UNAVAILABLE"
  | "OVERLAP"
  | "COLLISION"
  | "BROKER_UNAVAILABLE"
  | "CLAIMED";

export type DispatchResult = {
  ok: boolean;
  status: DispatchStatus;
  claimId: string | null;
  message: string | null;
  httpStatus: number;
  overlapHits?: OverlapHit[];
  projectionStatus?: "SYNCED" | "ERROR" | "SKIPPED";
};

export type DispatchDeps = {
  findJob?: (jobId: string) => Promise<HomeroomJob | null>;
  persistLease?: typeof persistLeaseProjection;
  reconcile?: typeof reconcileCycle;
  checkOverlap?: typeof checkGitHubOverlap;
  listActive?: typeof listActiveJobs;
  claim?: typeof claimJob;
  randomId?: () => string;
};

const CYCLE_PATTERN = /^C-\d+$/;

function httpStatusFor(status: DispatchStatus): number {
  switch (status) {
    case "CLAIMED":
      return 200;
    case "DISABLED":
    case "CONFIG_INCOMPLETE":
    case "CYCLE_UNAVAILABLE":
    case "BROKER_UNAVAILABLE":
      return 503;
    case "JOB_NOT_FOUND":
      return 400;
    case "JOB_NOT_AVAILABLE":
    case "CYCLE_MISMATCH":
    case "OVERLAP":
    case "COLLISION":
      return 409;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

function result(
  status: DispatchStatus,
  message: string | null,
  extra?: Partial<DispatchResult>
): DispatchResult {
  return {
    ok: status === "CLAIMED",
    status,
    claimId: extra?.claimId ?? null,
    message,
    httpStatus: httpStatusFor(status),
    overlapHits: extra?.overlapHits,
    projectionStatus: extra?.projectionStatus,
  };
}

export function isDispatcherEnabled(): boolean {
  return process.env.MOBIUS_DISPATCH_ENABLED === "true";
}

export function validateDispatchRequest(input: unknown): DispatchRequest | string {
  if (!input || typeof input !== "object") return "body must be an object";
  const raw = input as Record<string, unknown>;

  if (typeof raw.jobId !== "string" || raw.jobId.trim().length < 3) {
    return "jobId must be a string of at least 3 characters";
  }
  if (typeof raw.cycle !== "string" || !CYCLE_PATTERN.test(raw.cycle.trim())) {
    return "cycle must match C-<number>";
  }
  if (!Array.isArray(raw.repositories) || raw.repositories.length === 0) {
    return "repositories must be a non-empty array";
  }
  if (raw.repositories.some((value) => typeof value !== "string" || !value.trim())) {
    return "repositories must contain non-empty strings";
  }
  if (!Array.isArray(raw.scopePaths) || raw.scopePaths.length === 0) {
    return "scopePaths must be a non-empty array";
  }
  if (raw.scopePaths.some((value) => typeof value !== "string" || !value.trim())) {
    return "scopePaths must contain non-empty strings";
  }
  if (typeof raw.branch !== "string" || !raw.branch.trim()) {
    return "branch is required";
  }

  const uniqueRepos = [...new Set(raw.repositories.map((value) => value.trim()))];
  const uniquePaths = [...new Set(raw.scopePaths.map((value) => value.trim()))];
  if (uniqueRepos.length !== raw.repositories.length) return "duplicate repositories are not allowed";
  if (uniquePaths.length !== raw.scopePaths.length) return "duplicate scopePaths are not allowed";

  let leaseSeconds = DEFAULT_LEASE_SECONDS;
  if (raw.leaseSeconds !== undefined) {
    if (typeof raw.leaseSeconds !== "number" || !Number.isInteger(raw.leaseSeconds)) {
      return "leaseSeconds must be an integer";
    }
    if (raw.leaseSeconds < 300 || raw.leaseSeconds > 7200) {
      return "leaseSeconds must be between 300 and 7200";
    }
    leaseSeconds = raw.leaseSeconds;
  }

  return {
    jobId: raw.jobId.trim(),
    cycle: raw.cycle.trim(),
    repositories: uniqueRepos,
    scopePaths: uniquePaths,
    branch: raw.branch.trim(),
    leaseSeconds,
  };
}

function requiredConfigErrors(): string[] {
  const missing: string[] = [];
  if (!process.env.MOBIUS_ATLAS_CLAUDE_HMAC_KEY?.trim()) {
    missing.push("MOBIUS_ATLAS_CLAUDE_HMAC_KEY");
  }
  if (!process.env.NOTION_API_KEY?.trim()) missing.push("NOTION_API_KEY");
  if (!process.env.NOTION_HOMEROOM_DATABASE_ID?.trim()) {
    missing.push("NOTION_HOMEROOM_DATABASE_ID");
  }
  if (!process.env.GITHUB_TOKEN?.trim()) missing.push("GITHUB_TOKEN");
  return missing;
}

function evidenceHash(request: DispatchRequest, brokerJobId: string): string {
  const canonical = JSON.stringify({
    job_id: brokerJobId,
    cycle: request.cycle,
    repositories: request.repositories,
    scope_paths: request.scopePaths,
    branch: request.branch,
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function log(message: string, extra?: Record<string, unknown>): void {
  if (process.env.DEBUG?.includes("mobius:dispatcher")) {
    console.info("[mobius:dispatcher]", message, extra ?? {});
  }
}

function dispatchStatusFromHomeroom(status: HomeroomJob["status"]): boolean {
  return status === "AVAILABLE";
}

/**
 * ATLAS job dispatcher — 15-step fail-closed clock-in.
 *
 *  1. Refuse unless MOBIUS_DISPATCH_ENABLED=true
 *  2. Require HMAC, Notion, and GitHub configuration
 *  3. Load Homeroom job (TODO #1)
 *  4. Reject missing jobs
 *  5. Reject jobs that are not AVAILABLE
 *  6. Reconcile cycle from GitHub cycle.json (TODO #2)
 *  7. Require request / Homeroom / canonical cycle agreement
 *  8. Required GitHub overlap detection (TODO #3)
 *  9. Broker pre-flight GET /v1/jobs/active
 * 10. HMAC-sign and POST /v1/jobs/claim
 * 11. Map 409 ACTIVE_CLAIM_CONFLICT to COLLISION
 * 12. Map broker outage to BROKER_UNAVAILABLE
 * 13. Persist 10-field lease projection to Notion (TODO #5)
 * 14. Projection failure does not void the broker lease
 * 15. Return CLAIMED; execution_authorized remains false
 */
export async function dispatchJob(
  request: DispatchRequest,
  deps: DispatchDeps = {}
): Promise<DispatchResult> {
  if (!isDispatcherEnabled()) {
    return result(
      "DISABLED",
      "Dispatcher is disabled (MOBIUS_DISPATCH_ENABLED != true). Leave disabled until OAA Phase 2 broker is live and the 200/409 canary has passed."
    );
  }

  const missing = requiredConfigErrors();
  if (missing.length > 0) {
    return result(
      "CONFIG_INCOMPLETE",
      `Dispatcher fail-closed: missing ${missing.join(", ")}`
    );
  }

  const findJob = deps.findJob ?? findHomeroomJob;
  let job: HomeroomJob | null;
  try {
    job = await findJob(request.jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return result("CONFIG_INCOMPLETE", `Homeroom lookup failed: ${message}`);
  }

  if (!job) {
    return result("JOB_NOT_FOUND", `Homeroom job '${request.jobId}' was not found`);
  }

  if (!dispatchStatusFromHomeroom(job.status)) {
    return result(
      "JOB_NOT_AVAILABLE",
      `Homeroom job ${job.jobId} status is ${job.status ?? "unknown"}, expected AVAILABLE`
    );
  }

  const reconcile = deps.reconcile ?? reconcileCycle;
  const cycle = await reconcile({ requestedCycle: request.cycle });
  if (!cycle.ok) {
    if (cycle.code === "mismatch" || cycle.code === "invalid") {
      return result("CYCLE_MISMATCH", cycle.reason);
    }
    return result("CYCLE_UNAVAILABLE", cycle.reason);
  }
  if (job.cycle && job.cycle !== request.cycle) {
    return result(
      "CYCLE_MISMATCH",
      `request cycle ${request.cycle} does not match Homeroom cycle ${job.cycle}`
    );
  }

  const checkOverlap = deps.checkOverlap ?? checkGitHubOverlap;
  const overlap = await checkOverlap({
    repositories: request.repositories,
    scopePaths: request.scopePaths,
    branch: request.branch,
  });
  if (!overlap.ok) {
    return result("CONFIG_INCOMPLETE", overlap.reason);
  }
  if (overlap.overlap) {
    return result(
      "OVERLAP",
      "GitHub overlap detected; set COLLISION_REVIEW_REQUIRED and do not claim",
      { overlapHits: overlap.hits }
    );
  }

  const jobNumber = job.jobNumber ?? parseJobNumber(request.jobId);
  const brokerJobId =
    jobNumber !== null ? brokerJobIdFromNumber(jobNumber) : job.jobId || request.jobId;

  const listActive = deps.listActive ?? listActiveJobs;
  const active = await listActive(brokerJobId);
  if (active.kind === "unavailable") {
    return result(
      "BROKER_UNAVAILABLE",
      "OAA broker unavailable (Phase 2 not deployed?)"
    );
  }
  const incumbent = active.jobs.find(
    (lease) => lease.job_id === brokerJobId && lease.state === "active"
  );
  if (incumbent) {
    return result(
      "COLLISION",
      `Active broker lease already exists for ${brokerJobId}`,
      { claimId: incumbent.claim_id }
    );
  }

  const claimBody: BrokerClaimRequest = {
    request_id: (deps.randomId ?? randomUUID)(),
    job_id: brokerJobId,
    cycle: request.cycle,
    runtime_id: process.env.MOBIUS_DISPATCH_RUNTIME_ID?.trim() || DEFAULT_RUNTIME_ID,
    evidence_hash: evidenceHash(request, brokerJobId),
    repositories: request.repositories,
    scope_paths: request.scopePaths,
    branch: request.branch,
    lease_seconds: request.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
  };

  log("claiming", { jobId: brokerJobId, cycle: request.cycle, branch: request.branch });

  const claim = deps.claim ?? claimJob;
  const claimed = await claim(claimBody);
  if (claimed.kind === "unavailable") {
    return result(
      "BROKER_UNAVAILABLE",
      "OAA broker unavailable (Phase 2 not deployed?)"
    );
  }
  if (claimed.kind === "conflict") {
    return result("COLLISION", `Broker rejected claim with ${claimed.code}`, {
      claimId: claimed.incumbent?.claim_id ?? null,
    });
  }

  const lease: BrokerLease = claimed.lease;
  const persist = deps.persistLease ?? persistLeaseProjection;
  try {
    await persist(job.pageId, {
      status: "ACTIVE",
      brokerClaimId: lease.claim_id,
      leaseExpiresAt: lease.lease_expires_at,
      projectionStatus: "SYNCED",
      claimedAt: lease.claimed_at,
      lastHeartbeatAt: lease.last_heartbeat_at,
      leaseVersion: lease.version,
      brokerApiUrl: brokerPublicUrl(),
      runtime: "Claude",
      executionAuthorized: false,
      steward: "ATLAS",
      branch: lease.branch,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("projection failed", { jobId: brokerJobId, error: message });
    return {
      ok: true,
      status: "CLAIMED",
      claimId: lease.claim_id,
      message: `Lease acquired but Homeroom projection failed: ${message}`,
      httpStatus: 200,
      projectionStatus: "ERROR",
    };
  }

  return {
    ok: true,
    status: "CLAIMED",
    claimId: lease.claim_id,
    message: null,
    httpStatus: 200,
    projectionStatus: "SYNCED",
  };
}
