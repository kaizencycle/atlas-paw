export type GitHubAllowlistIdentity = {
  userId?: string | number | null;
  providerAccountId?: string | number | null;
  profileId?: string | number | null;
  login?: string | null;
};

export type GitHubSignInDecision =
  | { ok: true }
  | { ok: false; error: "Configuration" | "AccessDenied" };

function stripQuotesAndAt(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, "").replace(/^@/, "").trim();
}

function normalizeIdentity(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const text = stripQuotesAndAt(String(value));
  return text || null;
}

/**
 * Parse ALLOWED_GITHUB_ID. Accepts a numeric GitHub user id, a login, or a
 * comma / whitespace separated list of either. Strips quotes and a leading @.
 */
export function parseGitHubAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  const entries = raw
    .split(/[,\s]+/)
    .map((part) => stripQuotesAndAt(part))
    .filter(Boolean);
  return [...new Set(entries)];
}

export function githubAllowlistCandidates(identity: GitHubAllowlistIdentity): string[] {
  const values = [
    identity.userId,
    identity.providerAccountId,
    identity.profileId,
    identity.login,
  ]
    .map(normalizeIdentity)
    .filter((value): value is string => Boolean(value));
  return [...new Set(values)];
}

export function isAllowedGitHubIdentity(
  allowlist: string[],
  identity: GitHubAllowlistIdentity
): boolean {
  if (allowlist.length === 0) return false;
  const allowed = new Set(allowlist.map((entry) => entry.toLowerCase()));
  return githubAllowlistCandidates(identity).some((candidate) =>
    allowed.has(candidate.toLowerCase())
  );
}

export function decideGitHubSignIn(
  allowedRaw: string | undefined | null,
  identity: GitHubAllowlistIdentity
): GitHubSignInDecision {
  const allowlist = parseGitHubAllowlist(allowedRaw);
  if (allowlist.length === 0) {
    return { ok: false, error: "Configuration" };
  }
  if (!isAllowedGitHubIdentity(allowlist, identity)) {
    return { ok: false, error: "AccessDenied" };
  }
  return { ok: true };
}
