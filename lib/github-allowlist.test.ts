import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideGitHubSignIn,
  isAllowedGitHubIdentity,
  parseGitHubAllowlist,
} from "./github-allowlist.ts";

const kaizencycle = {
  userId: "230379496",
  providerAccountId: "230379496",
  profileId: 230379496,
  login: "kaizencycle",
};

describe("parseGitHubAllowlist", () => {
  it("splits comma and whitespace and strips quotes/@", () => {
    assert.deepEqual(parseGitHubAllowlist('  "230379496", @kaizencycle '), [
      "230379496",
      "kaizencycle",
    ]);
  });

  it("returns empty for missing or blank values", () => {
    assert.deepEqual(parseGitHubAllowlist(undefined), []);
    assert.deepEqual(parseGitHubAllowlist("  "), []);
  });
});

describe("isAllowedGitHubIdentity", () => {
  it("matches a numeric GitHub user id from the raw profile", () => {
    assert.equal(
      isAllowedGitHubIdentity(["230379496"], { profileId: 230379496 }),
      true
    );
  });

  it("matches a GitHub login case-insensitively", () => {
    assert.equal(
      isAllowedGitHubIdentity(["KaizenCycle"], { login: "kaizencycle" }),
      true
    );
  });

  it("matches providerAccountId when profile.id is missing", () => {
    assert.equal(
      isAllowedGitHubIdentity(["230379496"], { providerAccountId: "230379496" }),
      true
    );
  });

  it("rejects an unrelated account", () => {
    assert.equal(
      isAllowedGitHubIdentity(["230379496"], {
        profileId: 1,
        login: "someone-else",
      }),
      false
    );
  });
});

describe("decideGitHubSignIn", () => {
  it("treats a missing allowlist as Configuration, not AccessDenied", () => {
    assert.deepEqual(decideGitHubSignIn(undefined, kaizencycle), {
      ok: false,
      error: "Configuration",
    });
  });

  it("allows the linked account by login or id", () => {
    assert.deepEqual(decideGitHubSignIn("kaizencycle", kaizencycle), { ok: true });
    assert.deepEqual(decideGitHubSignIn("230379496", kaizencycle), { ok: true });
  });

  it("denies a different GitHub account", () => {
    assert.deepEqual(
      decideGitHubSignIn("230379496", { profileId: 42, login: "octocat" }),
      { ok: false, error: "AccessDenied" }
    );
  });
});
