import { NextResponse } from "next/server";
import { checkTunnelHealth } from "@/lib/openclaw";
import { loadLastSeen } from "@/lib/atlas-gateway-state";
import { kvConfigured, kvGet } from "@/lib/kv";

export const dynamic = "force-dynamic";

function isFreshIso(iso: string | null | undefined, maxAgeMs: number): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= maxAgeMs;
}

export async function GET() {
  const [online, lastSeen, tripwireIds] = await Promise.all([
    checkTunnelHealth(),
    kvConfigured() ? loadLastSeen() : Promise.resolve(null),
    kvConfigured()
      ? kvGet<string[]>("atlas:paw:tripwires:self:index")
      : Promise.resolve(null),
  ]);

  const tripwireCount = Array.isArray(tripwireIds) ? tripwireIds.length : 0;
  const lastSeenFresh = isFreshIso(
    lastSeen?.state.last_heartbeat ?? lastSeen?.at ?? null,
    26 * 60 * 60 * 1000
  );
  const checks = {
    tunnel: online ? "ok" : "error",
    kv: kvConfigured() ? "ok" : "not-configured",
    lastSeen: lastSeenFresh ? "ok" : "stale",
    tripwires: kvConfigured() ? `${tripwireCount} registered` : "unavailable",
  };
  const status = online && checks.kv === "ok" && lastSeenFresh ? "ok" : "degraded";
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
