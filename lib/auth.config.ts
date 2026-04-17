import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

const authConfig = {
  /** Required on Vercel / behind proxies so OAuth callback URLs resolve correctly. */
  trustHost: true,
  /** Explicit secret avoids MissingSecret in production; falls back to NEXTAUTH_SECRET. */
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/signin",
  },
  providers: [
    GitHub({
      clientId:
        process.env.GITHUB_CLIENT_ID ||
        process.env.AUTH_GITHUB_ID ||
        "",
      clientSecret:
        process.env.GITHUB_CLIENT_SECRET ||
        process.env.AUTH_GITHUB_SECRET ||
        "",
    }),
  ],
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
