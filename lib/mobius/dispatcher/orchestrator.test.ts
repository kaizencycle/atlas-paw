import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { BrokerClaimResult, BrokerLease } from "../broker/client";
import { extractCanonicalCycle } from "../cycle/reconciler";
import {
  dispatchJob,
  validateDispatchRequest,
  type DispatchRequest,
} from "./orchestrator";
import { parseHomeroomScopePaths, type HomeroomJob } from "../notion/schema";

const ENV_KEYS = [
  "MOBIUS_DISPATCH_ENABLED",
  "MOBIUS_ATLAS_CLAUDE_HMAC_KEY",
  "NOTION_API_KEY",
  "NOTION_HOMEROOM_DATABASE_ID",
  "GITHUB_TOKEN",
] as const;

const previous = new Map<string, string | undefined>();

function setEnv(values: Record<string, string>): void {
  for (const key of ENV_KEYS) {
    if (!previous.has(key)) previous.set(key, process.env[key]);
  }
  for (const [key, value] of Object.entries(values)) {
    process.env[key] = value;
  }
}

function restoreEnv(): void {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  previous.clear();
}

const request: DispatchRequest = {
  jobId: "JOB-1",
  cycle: "C-412",
  repositories: ["Mobius-Substrate"],
  scopePaths: ["lib/"],
  branch: "claude/dispatch-test",
};

function availableJob(): HomeroomJob {
  return {
    pageId: "page-1",
    jobTitle: "Test dispatch",
    jobNumber: 1,
    jobId: "JOB-1",
    status: "AVAILABLE",
    cycle: "C-412",
    steward: "ATLAS",
    runtime: "UNASSIGNED",
    repositories: ["Mobius-Substrate"],
    scopePathsText: "lib/",
    branch: null,
    brokerClaimId: null,
    projectionStatus: "PENDING",
    executionAuthorized: false,
    humanApproval: false,
  };
}

function lease(): BrokerLease {
  return {
    job_id: "JOB-1",
    claim_id: "12345678-1234-1234-1234-123456789abc",
    request_id: "request-1",
    cycle: "C-412",
    agent_id: "mobius-atlas-claude",
    runtime_id: "atlas-paw",
    evidence_hash: `sha256:${"a".repeat(64)}`,
    repositories: ["Mobius-Substrate"],
    scope_paths: ["lib/"],
    branch: "claude/dispatch-test",
    state: "active",
    claimed_at: "2026-08-24T00:00:00.000Z",
    lease_expires_at: "2026-08-24T02:00:00.000Z",
    last_heartbeat_at: "2026-08-24T00:00:00.000Z",
    version: 1,
    execution_authorized: false,
  };
}

describe("dispatcher orchestrator", () => {
  afterEach(() => restoreEnv());

  it("validates dispatch payloads", () => {
    const ok = validateDispatchRequest(request);
    assert.equal(typeof ok === "object", true);
    assert.equal(
      validateDispatchRequest({ ...request, cycle: "410" }),
      "cycle must match C-<number>"
    );
  });

  it("reads current_cycle, current, or cycle from cycle.json", () => {
    assert.equal(extractCanonicalCycle({ current_cycle: "C-412" }), "C-412");
    assert.equal(extractCanonicalCycle({ current: "C-411" }), "C-411");
    assert.equal(extractCanonicalCycle({ cycle: "C-410" }), "C-410");
    assert.equal(extractCanonicalCycle({}), null);
  });

  it("parses path tokens from Homeroom scope text", () => {
    assert.deepEqual(parseHomeroomScopePaths("lib/"), ["lib/"]);
    assert.deepEqual(
      parseHomeroomScopePaths(
        ".github/workflows/mobius-sync-unified.yml; kaizen_manifest.yaml; labs/lab7-proof/workrepo and extra prose"
      ),
      [
        ".github/workflows/mobius-sync-unified.yml",
        "kaizen_manifest.yaml",
        "labs/lab7-proof/workrepo",
      ]
    );
    assert.deepEqual(parseHomeroomScopePaths("Top-level path ... only; no other cleanup"), []);
  });

  it("returns DISABLED when the feature flag is not true", async () => {
    setEnv({ MOBIUS_DISPATCH_ENABLED: "false" });
    const dispatched = await dispatchJob(request);
    assert.equal(dispatched.status, "DISABLED");
    assert.equal(dispatched.ok, false);
    assert.equal(dispatched.httpStatus, 503);
    assert.match(dispatched.message ?? "", /MOBIUS_DISPATCH_ENABLED != true/);
  });

  it("fails closed when required secrets are missing", async () => {
    setEnv({ MOBIUS_DISPATCH_ENABLED: "true" });
    delete process.env.MOBIUS_ATLAS_CLAUDE_HMAC_KEY;
    delete process.env.NOTION_API_KEY;
    delete process.env.NOTION_HOMEROOM_DATABASE_ID;
    delete process.env.GITHUB_TOKEN;
    const dispatched = await dispatchJob(request);
    assert.equal(dispatched.status, "CONFIG_INCOMPLETE");
    assert.equal(dispatched.httpStatus, 503);
  });

  it("maps broker outage to BROKER_UNAVAILABLE", async () => {
    setEnv({
      MOBIUS_DISPATCH_ENABLED: "true",
      MOBIUS_ATLAS_CLAUDE_HMAC_KEY: "test-key",
      NOTION_API_KEY: "test-notion",
      NOTION_HOMEROOM_DATABASE_ID: "test-db",
      GITHUB_TOKEN: "test-github",
    });

    const dispatched = await dispatchJob(request, {
      findJob: async () => availableJob(),
      reconcile: async () => ({ ok: true, cycle: "C-412", source: "test" }),
      checkOverlap: async () => ({ ok: true, overlap: false }),
      listActive: async () => ({
        kind: "unavailable",
        reason: "down",
      }),
    });
    assert.equal(dispatched.status, "BROKER_UNAVAILABLE");
    assert.equal(dispatched.httpStatus, 503);
    assert.equal(dispatched.message, "OAA broker unavailable (Phase 2 not deployed?)");
  });

  it("rejects Homeroom jobs without a cycle", async () => {
    setEnv({
      MOBIUS_DISPATCH_ENABLED: "true",
      MOBIUS_ATLAS_CLAUDE_HMAC_KEY: "test-key",
      NOTION_API_KEY: "test-notion",
      NOTION_HOMEROOM_DATABASE_ID: "test-db",
      GITHUB_TOKEN: "test-github",
    });
    const dispatched = await dispatchJob(request, {
      findJob: async () => ({ ...availableJob(), cycle: null }),
      reconcile: async () => ({ ok: true, cycle: "C-412", source: "test" }),
    });
    assert.equal(dispatched.status, "CYCLE_MISMATCH");
    assert.match(dispatched.message ?? "", /no cycle/);
  });

  it("rejects a request whose scope is not the Homeroom assignment", async () => {
    setEnv({
      MOBIUS_DISPATCH_ENABLED: "true",
      MOBIUS_ATLAS_CLAUDE_HMAC_KEY: "test-key",
      NOTION_API_KEY: "test-notion",
      NOTION_HOMEROOM_DATABASE_ID: "test-db",
      GITHUB_TOKEN: "test-github",
    });
    const dispatched = await dispatchJob(
      { ...request, scopePaths: ["docs/"] },
      {
        findJob: async () => availableJob(),
        reconcile: async () => ({ ok: true, cycle: "C-412", source: "test" }),
      }
    );
    assert.equal(dispatched.status, "SCOPE_MISMATCH");
    assert.match(dispatched.message ?? "", /not within Homeroom scope/);
  });

  it("runs overlap and claim against Homeroom scope, not a narrower request", async () => {
    setEnv({
      MOBIUS_DISPATCH_ENABLED: "true",
      MOBIUS_ATLAS_CLAUDE_HMAC_KEY: "test-key",
      NOTION_API_KEY: "test-notion",
      NOTION_HOMEROOM_DATABASE_ID: "test-db",
      GITHUB_TOKEN: "test-github",
    });
    let overlapArgs: { repositories: string[]; scopePaths: string[]; branch: string } | null =
      null;
    let claimArgs: { repositories: string[]; scope_paths: string[]; branch: string } | null =
      null;
    const dispatched = await dispatchJob(
      { ...request, scopePaths: ["lib/mobius/"] },
      {
        findJob: async () => ({
          ...availableJob(),
          scopePathsText: "lib/; docs/handbook.md",
        }),
        reconcile: async () => ({ ok: true, cycle: "C-412", source: "test" }),
        checkOverlap: async (args) => {
          overlapArgs = {
            repositories: args.repositories,
            scopePaths: args.scopePaths,
            branch: args.branch,
          };
          return { ok: true, overlap: false };
        },
        listActive: async () => ({ kind: "ok", jobs: [] }),
        claim: async (body) => {
          claimArgs = {
            repositories: body.repositories,
            scope_paths: body.scope_paths,
            branch: body.branch,
          };
          return { kind: "claimed", lease: lease(), authority: "assignment_only" };
        },
        persistLease: async () => undefined,
      }
    );
    assert.equal(dispatched.status, "CLAIMED");
    assert.deepEqual(overlapArgs?.scopePaths, ["lib/", "docs/handbook.md"]);
    assert.deepEqual(claimArgs?.scope_paths, ["lib/", "docs/handbook.md"]);
  });

  it("persists a 10-field lease after a successful claim", async () => {
    setEnv({
      MOBIUS_DISPATCH_ENABLED: "true",
      MOBIUS_ATLAS_CLAUDE_HMAC_KEY: "test-key",
      NOTION_API_KEY: "test-notion",
      NOTION_HOMEROOM_DATABASE_ID: "test-db",
      GITHUB_TOKEN: "test-github",
    });

    let persisted: unknown = null;
    const claimed: BrokerClaimResult = { kind: "claimed", lease: lease(), authority: "assignment_only" };

    const dispatched = await dispatchJob(request, {
      findJob: async () => availableJob(),
      reconcile: async () => ({ ok: true, cycle: "C-412", source: "test" }),
      checkOverlap: async () => ({ ok: true, overlap: false }),
      listActive: async () => ({ kind: "ok", jobs: [] }),
      claim: async () => claimed,
      persistLease: async (_pageId, projection) => {
        persisted = projection;
      },
      randomId: () => "request-fixed-0001",
    });

    assert.equal(dispatched.status, "CLAIMED");
    assert.equal(dispatched.ok, true);
    assert.equal(dispatched.claimId, lease().claim_id);
    assert.equal(dispatched.projectionStatus, "SYNCED");
    assert.deepEqual(persisted, {
      status: "ACTIVE",
      brokerClaimId: lease().claim_id,
      leaseExpiresAt: lease().lease_expires_at,
      projectionStatus: "SYNCED",
      claimedAt: lease().claimed_at,
      lastHeartbeatAt: lease().last_heartbeat_at,
      leaseVersion: 1,
      brokerApiUrl: "https://oaa.onrender.com/v1/jobs",
      runtime: "Claude",
      executionAuthorized: false,
      steward: "ATLAS",
      branch: "claude/dispatch-test",
    });
  });
});
