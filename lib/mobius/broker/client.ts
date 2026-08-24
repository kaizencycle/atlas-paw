import { canonicalJson, signOaaEnvelope } from "@/lib/mobius/hmac/signer";

export const DEFAULT_BROKER_URL = "https://oaa.onrender.com";
export const DEFAULT_OAA_AGENT_ID = "mobius-atlas-claude";
export const DEFAULT_RUNTIME_ID = "atlas-paw";
export const DEFAULT_LEASE_SECONDS = 7200;

export type BrokerLease = {
  job_id: string;
  claim_id: string;
  request_id: string;
  cycle: string;
  agent_id: string;
  runtime_id: string;
  evidence_hash: string;
  repositories: string[];
  scope_paths: string[];
  branch: string;
  state: "active" | "review" | "blocked" | "released" | "complete" | "expired";
  claimed_at: string;
  lease_expires_at: string;
  last_heartbeat_at: string;
  version: number;
  execution_authorized: boolean;
};

export type BrokerClaimRequest = {
  request_id: string;
  job_id: string;
  cycle: string;
  runtime_id: string;
  evidence_hash: string;
  repositories: string[];
  scope_paths: string[];
  branch: string;
  lease_seconds: number;
};

export type BrokerClaimSuccess = {
  kind: "claimed";
  lease: BrokerLease;
  authority: "assignment_only";
};

export type BrokerConflict = {
  kind: "conflict";
  code: "ACTIVE_CLAIM_CONFLICT" | "REQUEST_ID_REUSE" | "LEASE_NOT_ACTIVE";
  incumbent?: BrokerLease;
};

export type BrokerUnavailable = {
  kind: "unavailable";
  reason: string;
  httpStatus?: number;
};

export type BrokerClaimResult = BrokerClaimSuccess | BrokerConflict | BrokerUnavailable;

export type BrokerActiveResult =
  | { kind: "ok"; jobs: BrokerLease[] }
  | BrokerUnavailable;

function brokerBaseUrl(): string {
  return (
    process.env.MOBIUS_OAA_BROKER_URL?.trim() ||
    process.env.OAA_BROKER_URL?.trim() ||
    DEFAULT_BROKER_URL
  ).replace(/\/+$/, "");
}

function hmacSecret(): string {
  return process.env.MOBIUS_ATLAS_CLAUDE_HMAC_KEY?.trim() ?? "";
}

function agentId(): string {
  return process.env.MOBIUS_OAA_AGENT_ID?.trim() || DEFAULT_OAA_AGENT_ID;
}

function isJsonContentType(value: string | null): boolean {
  return (value ?? "").toLowerCase().includes("application/json");
}

async function signedFetch(params: {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}): Promise<{ status: number; json: unknown; text: string; contentType: string | null }> {
  const secret = hmacSecret();
  if (!secret) {
    throw new Error("MOBIUS_ATLAS_CLAUDE_HMAC_KEY is not configured");
  }

  const bodyText = params.body === undefined ? "" : canonicalJson(params.body);
  const { headers } = signOaaEnvelope({
    bodyText,
    secret,
    agentId: agentId(),
  });

  const response = await fetch(`${brokerBaseUrl()}${params.path}`, {
    method: params.method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: params.method === "GET" ? undefined : bodyText,
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type");
  let json: unknown = null;
  if (text && isJsonContentType(contentType)) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = null;
    }
  }
  return { status: response.status, json, text, contentType };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asLease(value: unknown): BrokerLease | null {
  const record = asRecord(value);
  if (!record) return null;
  if (typeof record.job_id !== "string" || typeof record.claim_id !== "string") {
    return null;
  }
  return record as unknown as BrokerLease;
}

function conflictFromBody(status: number, json: unknown): BrokerConflict | null {
  const root = asRecord(json);
  const detail = asRecord(root?.detail) ?? root;
  const code = detail?.code;
  if (status !== 409 || typeof code !== "string") return null;

  if (code === "ACTIVE_CLAIM_CONFLICT") {
    return {
      kind: "conflict",
      code,
      incumbent: asLease(detail?.incumbent) ?? undefined,
    };
  }
  if (code === "REQUEST_ID_REUSE" || code === "LEASE_NOT_ACTIVE") {
    return { kind: "conflict", code };
  }
  return { kind: "conflict", code: "ACTIVE_CLAIM_CONFLICT" };
}

function unavailable(
  reason: string,
  httpStatus?: number
): BrokerUnavailable {
  return { kind: "unavailable", reason, httpStatus };
}

export async function claimJob(request: BrokerClaimRequest): Promise<BrokerClaimResult> {
  let response: { status: number; json: unknown; text: string; contentType: string | null };
  try {
    response = await signedFetch({
      method: "POST",
      path: "/v1/jobs/claim",
      body: request,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return unavailable(`OAA broker request failed: ${message}`);
  }

  if (response.status === 200) {
    const root = asRecord(response.json);
    const lease = asLease(root?.lease);
    if (!lease) {
      return unavailable("OAA broker returned 200 without a lease");
    }
    return {
      kind: "claimed",
      lease,
      authority: "assignment_only",
    };
  }

  const conflict = conflictFromBody(response.status, response.json);
  if (conflict) return conflict;

  if (response.status === 401 || response.status === 403) {
    return unavailable("OAA broker rejected HMAC identity", response.status);
  }
  if (response.status === 503) {
    return unavailable("atomic job store is unavailable", 503);
  }
  if (!isJsonContentType(response.contentType) || response.status === 404) {
    return unavailable("OAA broker unavailable (Phase 2 not deployed?)", response.status);
  }
  return unavailable(`OAA broker HTTP ${response.status}`, response.status);
}

export async function listActiveJobs(jobId?: string): Promise<BrokerActiveResult> {
  const suffix = jobId ? `?job_id=${encodeURIComponent(jobId)}` : "";
  let response: { status: number; json: unknown; text: string; contentType: string | null };
  try {
    response = await signedFetch({
      method: "GET",
      path: `/v1/jobs/active${suffix}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return unavailable(`OAA broker request failed: ${message}`);
  }

  if (response.status === 200) {
    const root = asRecord(response.json);
    const jobs = Array.isArray(root?.jobs)
      ? root.jobs.map(asLease).filter((lease): lease is BrokerLease => lease !== null)
      : [];
    return { kind: "ok", jobs };
  }
  if (response.status === 401 || response.status === 403) {
    return unavailable("OAA broker rejected HMAC identity", response.status);
  }
  if (response.status === 503) {
    return unavailable("atomic job store is unavailable", 503);
  }
  return unavailable("OAA broker unavailable (Phase 2 not deployed?)", response.status);
}

export function brokerPublicUrl(): string {
  return `${brokerBaseUrl()}/v1/jobs`;
}
