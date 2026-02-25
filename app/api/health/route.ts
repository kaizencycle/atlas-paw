import { NextResponse } from "next/server";
import { checkTunnelHealth } from "@/lib/openclaw";

export const dynamic = "force-dynamic";

export async function GET() {
  const online = await checkTunnelHealth();
  return NextResponse.json({
    mode: online ? "full" : "readonly",
    tunnelUrl: process.env.OPENCLAW_TUNNEL_URL || null,
    checkedAt: new Date().toISOString(),
  });
}
