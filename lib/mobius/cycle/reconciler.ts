export const DEFAULT_CYCLE_OWNER = "kaizencycle";
export const DEFAULT_CYCLE_REPO = "Mobius-Substrate";
export const DEFAULT_CYCLE_PATH = "cycle.json";

export type CycleDocument = {
  current_cycle?: unknown;
  current?: unknown;
  cycle?: unknown;
};

export type CycleReconciliation =
  | { ok: true; cycle: string; source: string }
  | { ok: false; code: "invalid" | "unavailable" | "mismatch"; reason: string };

export type GitHubContentsFetcher = (params: {
  owner: string;
  repo: string;
  path: string;
}) => Promise<{ status: number; text: string }>;

const CYCLE_PATTERN = /^C-\d+$/;

export function extractCanonicalCycle(document: CycleDocument): string | null {
  const candidates = [document.current_cycle, document.current, document.cycle];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && CYCLE_PATTERN.test(candidate.trim())) {
      return candidate.trim();
    }
  }
  return null;
}

export async function defaultGitHubContentsFetcher(params: {
  owner: string;
  repo: string;
  path: string;
}): Promise<{ status: number; text: string }> {
  const token = process.env.GITHUB_TOKEN?.trim() ?? "";
  if (!token) {
    return { status: 401, text: "GITHUB_TOKEN is not configured" };
  }

  const url = `https://api.github.com/repos/${params.owner}/${params.repo}/contents/${params.path}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github.raw+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "atlas-paw-dispatcher",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  const text = await response.text();
  return { status: response.status, text };
}

export async function reconcileCycle(params: {
  requestedCycle: string;
  fetcher?: GitHubContentsFetcher;
  owner?: string;
  repo?: string;
  path?: string;
}): Promise<CycleReconciliation> {
  const requested = params.requestedCycle.trim();
  if (!CYCLE_PATTERN.test(requested)) {
    return {
      ok: false,
      code: "invalid",
      reason: `requested cycle '${requested}' is not canonical (C-N)`,
    };
  }

  const fetcher = params.fetcher ?? defaultGitHubContentsFetcher;
  let fetched: { status: number; text: string };
  try {
    fetched = await fetcher({
      owner: params.owner ?? DEFAULT_CYCLE_OWNER,
      repo: params.repo ?? DEFAULT_CYCLE_REPO,
      path: params.path ?? DEFAULT_CYCLE_PATH,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: "unavailable", reason: `cycle.json fetch failed: ${message}` };
  }

  if (fetched.status === 401 || fetched.status === 403) {
    return {
      ok: false,
      code: "unavailable",
      reason: "GitHub token is missing or cannot read cycle.json",
    };
  }
  if (fetched.status < 200 || fetched.status >= 300) {
    return {
      ok: false,
      code: "unavailable",
      reason: `cycle.json HTTP ${fetched.status}`,
    };
  }

  let document: CycleDocument;
  try {
    document = JSON.parse(fetched.text) as CycleDocument;
  } catch {
    return { ok: false, code: "unavailable", reason: "cycle.json is not valid JSON" };
  }

  const canonical = extractCanonicalCycle(document);
  if (!canonical) {
    return {
      ok: false,
      code: "unavailable",
      reason: "cycle.json is missing current_cycle, current, or cycle",
    };
  }

  if (canonical !== requested) {
    return {
      ok: false,
      code: "mismatch",
      reason: `requested ${requested} does not match canonical ${canonical}`,
    };
  }

  return {
    ok: true,
    cycle: canonical,
    source: `${params.owner ?? DEFAULT_CYCLE_OWNER}/${params.repo ?? DEFAULT_CYCLE_REPO}/${params.path ?? DEFAULT_CYCLE_PATH}`,
  };
}
