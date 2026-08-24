"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { safeCallbackUrl } from "@/lib/auth-callback";

function messageForAuthError(error: string | null): string | null {
  if (!error) return null;
  switch (error) {
    case "AccessDenied":
      return "This GitHub account is not on the ATLAS PAW allowlist. Sign in as the linked account, or set ALLOWED_GITHUB_ID to that user's numeric id or login.";
    case "Configuration":
      return "Sign-in is misconfigured. Set ALLOWED_GITHUB_ID (GitHub user id or login) plus AUTH_SECRET and AUTH_GITHUB_ID / AUTH_GITHUB_SECRET.";
    case "OAuthCallback":
    case "OAuthSignin":
    case "Callback":
      return "GitHub OAuth failed. Confirm the callback URL is https://atlas-paw.vercel.app/api/auth/callback/github.";
    case "Verification":
      return "Sign-in link expired. Try again.";
    default:
      return "Sign-in failed. Try again.";
  }
}

export function SignInForm() {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const error = messageForAuthError(searchParams.get("error"));

  async function onGitHub() {
    const callbackUrl = safeCallbackUrl(
      searchParams.get("callbackUrl"),
      window.location.origin
    );
    setPending(true);
    try {
      await signIn("github", { callbackUrl });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 gap-6">
      <div className="text-center space-y-2">
        <span className="text-atlas text-3xl" aria-hidden="true">
          ⬡
        </span>
        <h1 className="text-lg font-semibold text-atlas tracking-wide">
          ATLAS PAW
        </h1>
        <p className="text-dim text-sm max-w-xs">
          Sign in with the linked GitHub account to use your personal ATLAS
          workstation.
        </p>
      </div>
      {error ? (
        <p
          role="alert"
          className="text-sm text-fail max-w-xs text-center border border-fail/30 rounded-xl px-3 py-2"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => void onGitHub()}
        disabled={pending}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-atlas text-bg border border-atlas-dim active:opacity-90 disabled:opacity-60"
      >
        {pending ? "Redirecting…" : "Continue with GitHub"}
      </button>
    </div>
  );
}
