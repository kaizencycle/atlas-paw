import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeCallbackUrl } from "./auth-callback.ts";

describe("safeCallbackUrl", () => {
  it("allows relative in-app paths", () => {
    assert.equal(safeCallbackUrl("/chat"), "/chat");
    assert.equal(safeCallbackUrl("/"), "/");
  });

  it("rejects protocol-relative and open redirects", () => {
    assert.equal(safeCallbackUrl("//evil.example"), "/");
    assert.equal(safeCallbackUrl("https://evil.example/phish"), "/");
    assert.equal(safeCallbackUrl("https://evil.example/phish", "https://atlas-paw.vercel.app"), "/");
  });

  it("keeps same-origin absolute URLs as a path", () => {
    assert.equal(
      safeCallbackUrl("https://atlas-paw.vercel.app/", "https://atlas-paw.vercel.app"),
      "/"
    );
    assert.equal(
      safeCallbackUrl(
        "https://atlas-paw.vercel.app/chat?x=1",
        "https://atlas-paw.vercel.app"
      ),
      "/chat?x=1"
    );
  });
});
