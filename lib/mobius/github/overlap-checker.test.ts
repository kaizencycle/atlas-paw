import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkGitHubOverlap,
  normalizeRepoName,
  pathsOverlap,
} from "./overlap-checker";

describe("github overlap checker", () => {
  it("treats nested paths as overlapping", () => {
    assert.equal(pathsOverlap("lib/", "lib/mobius/dispatcher/orchestrator.ts"), true);
    assert.equal(pathsOverlap("lib/mobius", "lib/mobius/hmac/signer.ts"), true);
    assert.equal(pathsOverlap("docs/STATE.md", "docs/STATE.md"), true);
    assert.equal(pathsOverlap("lib/", "apps/hub/page.tsx"), false);
  });

  it("normalizes owner/repo pairs", () => {
    assert.deepEqual(normalizeRepoName("Mobius-Substrate"), {
      owner: "kaizencycle",
      repo: "Mobius-Substrate",
    });
    assert.deepEqual(normalizeRepoName("kaizencycle/OAA-API-Library"), {
      owner: "kaizencycle",
      repo: "OAA-API-Library",
    });
  });

  it("flags an existing branch as overlap", async () => {
    const result = await checkGitHubOverlap({
      repositories: ["Mobius-Substrate"],
      scopePaths: ["lib/"],
      branch: "claude/dispatch-test",
      fetcher: async (url) => {
        if (url.includes("/branches/")) {
          return { status: 200, json: { name: "claude/dispatch-test" } };
        }
        return { status: 200, json: [] };
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.overlap, true);
    }
  });

  it("flags open PRs whose files intersect the scope", async () => {
    const result = await checkGitHubOverlap({
      repositories: ["Mobius-Substrate"],
      scopePaths: ["lib/"],
      branch: "claude/fresh",
      fetcher: async (url) => {
        if (url.includes("/branches/")) return { status: 404, json: {} };
        if (url.includes("/pulls/12/files")) {
          return { status: 200, json: [{ filename: "lib/cycle/reconciler.ts" }] };
        }
        if (url.includes("/pulls?")) {
          return {
            status: 200,
            json: [{ number: 12, html_url: "https://github.com/example/pull/12", head: { ref: "other" } }],
          };
        }
        return { status: 500, json: {} };
      },
    });
    assert.equal(result.ok && result.overlap, true);
  });

  it("fails closed when GitHub auth is missing", async () => {
    const result = await checkGitHubOverlap({
      repositories: ["Mobius-Substrate"],
      scopePaths: ["lib/"],
      branch: "claude/fresh",
      fetcher: async () => ({ status: 401, json: { message: "bad credentials" } }),
    });
    assert.equal(result.ok, false);
  });
});
