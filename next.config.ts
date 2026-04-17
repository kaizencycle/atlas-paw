import type { NextConfig } from "next";

if (
  process.env.VERCEL === "1" &&
  process.env.SKIP_AUTH_SECRET_CHECK !== "1" &&
  !process.env.AUTH_SECRET?.trim() &&
  !process.env.NEXTAUTH_SECRET?.trim()
) {
  throw new Error(
    "Vercel build: set AUTH_SECRET (or NEXTAUTH_SECRET) on this project. " +
      "Auth.js requires it for cookies/JWT. Generate: openssl rand -base64 32. " +
      "Docs: https://errors.authjs.dev#missingsecret — To skip this check temporarily: SKIP_AUTH_SECRET_CHECK=1"
  );
}

const nextConfig: NextConfig = {};

export default nextConfig;
