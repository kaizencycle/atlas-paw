/**
 * Daily ATLAS heartbeat forward to the Civic AI Terminal (Vercel Hobby allows
 * at most once-per-day crons). Schedule is staggered after the terminal’s
 * midnight UTC batch: watchdog 0:00, eve 0:15, promote 0:30, gi-refresh 0:45,
 * then this route at 0:50 — see mobius-civic-ai-terminal vercel.json.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadLastSeen } from "@/lib/atlas-gateway-state";
import { kvConfigured } from "@/lib/kv";
import { runTripwireEvaluation } from "@/lib/tripwires/run-evaluation";

export const dynamic = "force-dynamic";

const TERMINAL_URL = process.env.TERMINAL_HEARTBEAT_URL || "";
const AGENT_TOKEN = process.env.AGENT_SERVICE_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET || "";

function cronAuthorized(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  if (!CRON_SECRET) return false;
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer.length !== CRON_SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < bearer.length; i++) {
    diff |= bearer.charCodeAt(i) ^ CRON_SECRET.charCodeAt(i);
  }
  return diff === 0;
}

export async function GET(req: NextRequest) {
  if (!cronAuthorized(req)) {
    return NextResponse.json({ error: "Cron-only endpoint" }, { status: 403 });
  }

  if (!TERMINAL_URL || !AGENT_TOKEN) {
    const tripwires = await runTripwireEvaluation();
    return NextResponse.json({
      ok: false,
      skipped: "TERMINAL_HEARTBEAT_URL or AGENT_SERVICE_TOKEN not configured",
      tripwires,
    });
  }

  const lastSeen = kvConfigured() ? await loadLastSeen() : null;
  const now = new Date().toISOString();

  const payload = {
    agent: "ATLAS",
    source: "paw-cron",
    timestamp: now,
    observed: lastSeen
      ? {
          last_state_at: lastSeen.at,
          suspended: lastSeen.state.suspended,
          last_heartbeat: lastSeen.state.last_heartbeat,
          posts_today: lastSeen.state.posts_today,
          comments_today: lastSeen.state.comments_today,
        }
      : null,
    note: lastSeen
      ? "Forwarded from PAW last-seen KV"
      : "No recent PAW state; ATLAS present but quiet",
  };

  try {
    const res = await fetch(TERMINAL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT_TOKEN}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.text().catch(() => "");
    const tripwires = await runTripwireEvaluation();
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      sent_at: now,
      response_preview: body.slice(0, 200),
      had_last_seen: Boolean(lastSeen),
      tripwires,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg, sent_at: now }, { status: 502 });
  }
}
