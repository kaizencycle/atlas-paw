import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import {
  extractBearerToken,
  signOaaEnvelope,
  timingSafeEqualString,
  verifyWebhookSecret,
} from "./signer";

describe("hmac signer", () => {
  it("signs the OAA timestamp.body envelope", () => {
    const bodyText = '{"job_id":"JOB-1"}';
    const { headers, payload } = signOaaEnvelope({
      bodyText,
      secret: "test-secret",
      agentId: "mobius-atlas-claude",
      timestampSeconds: 1_700_000_000,
    });

    assert.equal(payload, `1700000000.${bodyText}`);
    assert.equal(headers["x-oaa-agent"], "mobius-atlas-claude");
    assert.equal(headers["x-oaa-timestamp"], "1700000000");
    assert.equal(
      headers["x-oaa-signature"],
      createHmac("sha256", "test-secret").update(payload).digest("hex")
    );
  });

  it("accepts a matching bearer webhook secret", () => {
    assert.equal(extractBearerToken("Bearer abc"), "abc");
    assert.equal(verifyWebhookSecret("Bearer super-secret", "super-secret"), true);
    assert.equal(verifyWebhookSecret("Bearer nope", "super-secret"), false);
    assert.equal(verifyWebhookSecret(null, "super-secret"), false);
    assert.equal(verifyWebhookSecret("Bearer super-secret", ""), false);
  });

  it("compares strings in constant time when lengths match", () => {
    assert.equal(timingSafeEqualString("abcd", "abcd"), true);
    assert.equal(timingSafeEqualString("abcd", "abce"), false);
    assert.equal(timingSafeEqualString("short", "longer-value"), false);
  });
});
