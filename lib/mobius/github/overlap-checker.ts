export type OverlapHit = {
  repository: string;
  kind: "branch" | "pull_request";
  ref: string;
  url?: string;
  paths?: string[];
};

export type OverlapResult =
  | { ok: true; overlap: false }
  | { ok: true; overlap: true; hits: OverlapHit[] }
  | { ok: false; reason: string };

export type GitHubJsonFetcher = (url: string) => Promise<{
  status: number;
  json: unknown;
}>;

const DEFAULT_OWNER = "kaizencycle";
const DEFAULT_PULLS_PER_PAGE = 100;
const DEFAULT_FILES_PER_PAGE = 100;
const DEFAULT_MAX_PAGES = 10;

export function normalizeRepoName(repository: string): { owner: string; repo: string } {
  const trimmed = repository.trim().replace(/\.git$/, "");
  const parts = trimmed.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return { owner: parts[parts.length - 2], repo: parts[parts.length - 1] };
  }
  return { owner: DEFAULT_OWNER, repo: trimmed };
}

export function repoIdentity(repository: string): string {
  const { owner, repo } = normalizeRepoName(repository);
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

export function normalizePath(path: string): string {
  return path.trim().replace(/^\/+/, "").replace(/\\/g, "/");
}

export function pathsOverlap(scopePath: string, filePath: string): boolean {
  const scope = normalizePath(scopePath);
  const file = normalizePath(filePath);
  if (!scope || !file) return false;
  if (scope === file) return true;

  const scopePrefix = scope.endsWith("/") ? scope : `${scope}/`;
  const filePrefix = file.endsWith("/") ? file : `${file}/`;
  return file.startsWith(scopePrefix) || scope.startsWith(filePrefix);
}

export async function defaultGitHubJsonFetcher(url: string): Promise<{
  status: number;
  json: unknown;
}> {
  const token = process.env.GITHUB_TOKEN?.trim() ?? "";
  if (!token) {
    return { status: 401, json: { message: "GITHUB_TOKEN is not configured" } };
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "atlas-paw-dispatcher",
    },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  let json: unknown = null;
  const text = await response.text();
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { raw: text.slice(0, 200) };
    }
  }
  return { status: response.status, json };
}

type PullFile = { filename?: unknown };
type Pull = {
  html_url?: unknown;
  number?: unknown;
  head?: { ref?: unknown };
};

type PagedCollect<T> =
  | { ok: true; items: T[] }
  | { ok: false; reason: string };

async function collectGithubPages(params: {
  fetcher: GitHubJsonFetcher;
  urlForPage: (page: number) => string;
  perPage: number;
  maxPages: number;
  truncatedReason: string;
}): Promise<PagedCollect<unknown>> {
  const items: unknown[] = [];
  for (let page = 1; page <= params.maxPages; page += 1) {
    let response: { status: number; json: unknown };
    try {
      response = await params.fetcher(params.urlForPage(page));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: message };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
    if (!Array.isArray(response.json)) {
      return { ok: false, reason: "non-array response" };
    }
    items.push(...response.json);
    if (response.json.length < params.perPage) {
      return { ok: true, items };
    }
  }
  return { ok: false, reason: params.truncatedReason };
}

export async function checkGitHubOverlap(params: {
  repositories: string[];
  scopePaths: string[];
  branch: string;
  fetcher?: GitHubJsonFetcher;
  pullsPerPage?: number;
  filesPerPage?: number;
  maxPages?: number;
}): Promise<OverlapResult> {
  const branch = params.branch.trim();
  if (!branch) return { ok: false, reason: "branch is required for overlap detection" };
  if (params.repositories.length === 0) {
    return { ok: false, reason: "repositories are required for overlap detection" };
  }
  if (params.scopePaths.length === 0) {
    return { ok: false, reason: "scopePaths are required for overlap detection" };
  }

  const fetcher = params.fetcher ?? defaultGitHubJsonFetcher;
  const pullsPerPage = params.pullsPerPage ?? DEFAULT_PULLS_PER_PAGE;
  const filesPerPage = params.filesPerPage ?? DEFAULT_FILES_PER_PAGE;
  const maxPages = params.maxPages ?? DEFAULT_MAX_PAGES;
  const hits: OverlapHit[] = [];

  for (const repository of params.repositories) {
    const { owner, repo } = normalizeRepoName(repository);
    const repoLabel = `${owner}/${repo}`;

    let branchResponse: { status: number; json: unknown };
    try {
      branchResponse = await fetcher(
        `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: `GitHub branch lookup failed for ${repoLabel}: ${message}` };
    }

    if (branchResponse.status === 401 || branchResponse.status === 403) {
      return { ok: false, reason: `GitHub token cannot read ${repoLabel}` };
    }
    if (branchResponse.status === 200) {
      hits.push({
        repository: repoLabel,
        kind: "branch",
        ref: branch,
        url: `https://github.com/${repoLabel}/tree/${branch}`,
      });
    } else if (branchResponse.status !== 404) {
      return {
        ok: false,
        reason: `GitHub branch lookup HTTP ${branchResponse.status} for ${repoLabel}`,
      };
    }

    const pulls = await collectGithubPages({
      fetcher,
      perPage: pullsPerPage,
      maxPages,
      truncatedReason: `open PR list for ${repoLabel} was truncated; refuse claim`,
      urlForPage: (page) =>
        `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=${pullsPerPage}&page=${page}`,
    });
    if (!pulls.ok) {
      if (pulls.reason.startsWith("HTTP 401") || pulls.reason.startsWith("HTTP 403")) {
        return { ok: false, reason: `GitHub token cannot list pulls on ${repoLabel}` };
      }
      if (pulls.reason.startsWith("HTTP ")) {
        return {
          ok: false,
          reason: `GitHub pull lookup ${pulls.reason} for ${repoLabel}`,
        };
      }
      if (pulls.reason === "non-array response") {
        return { ok: false, reason: `GitHub pull lookup returned non-array for ${repoLabel}` };
      }
      if (pulls.reason.includes("truncated")) {
        return { ok: false, reason: pulls.reason };
      }
      return { ok: false, reason: `GitHub pull lookup failed for ${repoLabel}: ${pulls.reason}` };
    }

    for (const rawPull of pulls.items) {
      const pull = rawPull as Pull;
      const number = typeof pull.number === "number" ? pull.number : null;
      const headRef = typeof pull.head?.ref === "string" ? pull.head.ref : "";
      const pullUrl = typeof pull.html_url === "string" ? pull.html_url : undefined;
      if (headRef === branch) {
        hits.push({
          repository: repoLabel,
          kind: "pull_request",
          ref: headRef,
          url: pullUrl,
        });
        continue;
      }
      if (number === null) continue;

      const files = await collectGithubPages({
        fetcher,
        perPage: filesPerPage,
        maxPages,
        truncatedReason: `pull files for ${repoLabel}#${number} were truncated; refuse claim`,
        urlForPage: (page) =>
          `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files?per_page=${filesPerPage}&page=${page}`,
      });
      if (!files.ok) {
        if (files.reason.startsWith("HTTP 401") || files.reason.startsWith("HTTP 403")) {
          return {
            ok: false,
            reason: `GitHub token cannot read files for ${repoLabel}#${number}`,
          };
        }
        if (files.reason.startsWith("HTTP ")) {
          return {
            ok: false,
            reason: `GitHub pull files ${files.reason} for ${repoLabel}#${number}`,
          };
        }
        if (files.reason.includes("truncated")) {
          return { ok: false, reason: files.reason };
        }
        return {
          ok: false,
          reason: `GitHub pull files lookup failed for ${repoLabel}#${number}: ${files.reason}`,
        };
      }

      const matching = (files.items as PullFile[])
        .map((file) => (typeof file.filename === "string" ? file.filename : ""))
        .filter((filename) =>
          filename ? params.scopePaths.some((scope) => pathsOverlap(scope, filename)) : false
        );

      if (matching.length > 0) {
        hits.push({
          repository: repoLabel,
          kind: "pull_request",
          ref: headRef || `#${number}`,
          url: pullUrl,
          paths: matching.slice(0, 10),
        });
      }
    }
  }

  if (hits.length > 0) {
    return { ok: true, overlap: true, hits };
  }
  return { ok: true, overlap: false };
}
