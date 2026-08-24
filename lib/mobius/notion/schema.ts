export const HOMEROOM_DATA_SOURCE_HINT =
  "Agent Jobs — Homeroom (NOTION_HOMEROOM_DATABASE_ID)";

export type HomeroomStatus =
  | "AVAILABLE"
  | "CLAIMED"
  | "ACTIVE"
  | "BLOCKED"
  | "COLLISION_REVIEW_REQUIRED"
  | "REVIEW"
  | "COMPLETE"
  | "EXPIRED";

export type HomeroomProjectionStatus =
  | "PENDING"
  | "SYNCED"
  | "ERROR"
  | "NOT_APPLICABLE";

export type HomeroomSteward =
  | "UNASSIGNED"
  | "ATLAS"
  | "AUREA"
  | "ZEUS"
  | "EVE"
  | "JADE"
  | "HERMES"
  | "ECHO"
  | "DAEDALUS"
  | "ZENITH"
  | "URIEL";

export type HomeroomRuntime =
  | "UNASSIGNED"
  | "Cursor"
  | "Claude"
  | "Codex"
  | "Cron"
  | "Human";

export type HomeroomRepository =
  | "Mobius-Substrate"
  | "mobius-civic-ai-terminal"
  | "Civic-Protocol-Core"
  | "mobius-browser-shell"
  | "OAA-API-Library"
  | "mobius-hive";

export type HomeroomJob = {
  pageId: string;
  jobTitle: string;
  jobNumber: number | null;
  jobId: string;
  status: HomeroomStatus | null;
  cycle: string | null;
  steward: HomeroomSteward | null;
  runtime: HomeroomRuntime | null;
  repositories: string[];
  scopePathsText: string | null;
  branch: string | null;
  brokerClaimId: string | null;
  projectionStatus: HomeroomProjectionStatus | null;
  executionAuthorized: boolean;
  humanApproval: boolean;
};

/**
 * Ten Homeroom fields written after a successful broker lease.
 * Notion remains a projection; the broker is assignment authority.
 */
export const LEASE_PROJECTION_FIELDS = [
  "Status",
  "Broker Claim ID",
  "Lease Expires",
  "Projection Status",
  "Claimed At",
  "Last Heartbeat",
  "Lease Version",
  "Broker API",
  "Runtime",
  "Execution Authorized",
] as const;

export type LeaseProjectionField = (typeof LEASE_PROJECTION_FIELDS)[number];

export type LeaseProjection = {
  status: Extract<HomeroomStatus, "ACTIVE" | "COLLISION_REVIEW_REQUIRED">;
  brokerClaimId: string;
  leaseExpiresAt: string;
  projectionStatus: HomeroomProjectionStatus;
  claimedAt: string;
  lastHeartbeatAt: string;
  leaseVersion: number;
  brokerApiUrl: string;
  runtime: HomeroomRuntime;
  executionAuthorized: false;
  steward?: HomeroomSteward;
  branch?: string;
  blocker?: string;
};

export function brokerJobIdFromNumber(jobNumber: number): string {
  return `JOB-${jobNumber}`;
}

export function parseJobNumber(jobId: string): number | null {
  const trimmed = jobId.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const prefixed = /^JOB-(\d+)$/i.exec(trimmed);
  if (prefixed) return Number(prefixed[1]);
  return null;
}

const SCOPE_PATH_TOKEN = /^(\.?[\w.-]+(?:\/[\w.-]+)*\/?)/;

/**
 * Extract path-like tokens from Homeroom's free-text Scope Paths field.
 * Splits on semicolons, commas, and newlines; ignores prose fragments.
 */
export function parseHomeroomScopePaths(text: string | null | undefined): string[] {
  if (!text?.trim()) return [];
  const chunks = text
    .split(/[;\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const found: string[] = [];
  for (const chunk of chunks) {
    const match = chunk.match(SCOPE_PATH_TOKEN);
    if (!match) continue;
    const token = match[1];
    const looksLikePath = token.includes("/") || /\.[A-Za-z0-9]{1,10}$/.test(token);
    if (looksLikePath) found.push(token);
  }
  return [...new Set(found)];
}
