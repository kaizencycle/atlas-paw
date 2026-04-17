import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * Auth.js v5 reads `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` via setEnvDefaults when
 * the provider entry is the `GitHub` function (not a pre-built object). Many
 * deployments still use `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`; bridge
 * those so we never pass empty strings (which block merge and cause
 * "Configuration" / server error on /api/auth/signin/github).
 */
if (process.env.GITHUB_CLIENT_ID && !process.env.AUTH_GITHUB_ID) {
  process.env.AUTH_GITHUB_ID = process.env.GITHUB_CLIENT_ID;
}
if (process.env.GITHUB_CLIENT_SECRET && !process.env.AUTH_GITHUB_SECRET) {
  process.env.AUTH_GITHUB_SECRET = process.env.GITHUB_CLIENT_SECRET;
}

const authConfig = {
  /** Required on Vercel / behind proxies so OAuth callback URLs resolve correctly. */
  trustHost: true,
  /** Omit `secret` here so next-auth `setEnvDefaults` can set it from AUTH_SECRET / NEXTAUTH_SECRET. */
  pages: {
    signIn: "/signin",
  },
  /** Use `GitHub` as a function so Auth merges `AUTH_GITHUB_*` from env. */
  providers: [GitHub],
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      if (path.startsWith("/api/auth")) return true;
      if (path === "/api/health") return true;
      if (path === "/api/gateway/register") return true;
      if (path.startsWith("/api/cron/")) return true;
      if (path.startsWith("/api/")) return true;
      if (path === "/signin") return true;
      return Boolean(auth?.user);
    },
    async signIn({ profile }) {
      const allowedId = process.env.ALLOWED_GITHUB_ID;
      if (!allowedId) return false;
      return String(profile?.id) === allowedId;
    },
    async session({ session, token }) {
      if (token?.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
