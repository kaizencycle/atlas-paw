import { NextResponse } from "next/server";
import { checkTunnelHealth } from "@/lib/openclaw";
import { loadLastSeen } from "@/lib/atlas-gateway-state";
import { kvConfigured, kvGet } from "@/lib/kv";

export const dynamic = "force-dynamic";

export async function GET() {
  const [online, lastSeen, tripwireIds] = await Promise.all([
    checkTunnelHealth(),
    kvConfigured() ? loadLastSeen() : Promise.resolve(null),
    kvConfigured()
      ? kvGet<string[]>("atlas:paw:tripwires:self:index")
      : Promise.resolve(null),
  ]);

  const tripwireCount = Array.isArray(tripwireIds) ? tripwireIds.length : 0;
  const checks = {
    tunnel: online ? "ok" : "error",
    kv: kvConfigured() ? "ok" : "not-configured",
    lastSeen: lastSeen ? "ok" : "stale",
    tripwires: kvConfigured() ? `${tripwireCount} registered` : "unavailable",
  };
  const status = online && checks.kv === "ok" ? "ok" : "degraded";
  const checkedAt = new Date().toISOString();

  return NextResponse.json({
    status,
    service: "atlas-paw",
    ts: Date.now(),
    checks,
    tripwireCount,
    mode: online ? "full" : "readonly",
    tunnelUrl: process.env.OPENCLAW_TUNNEL_URL || null,
    checkedAt,
    lastSeenAt: lastSeen?.at ?? null,
  });
}
