import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { kvConfigured, kvGet, kvSet } from "@/lib/kv";
import type { TripEvent } from "@/lib/tripwires/types";

export const dynamic = "force-dynamic";

function journalKey(): string {
  return "atlas:paw:tripwires:self:journal";
}

function pushQueueKey(): string {
  return "atlas:paw:tripwires:self:push-queue";
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!kvConfigured()) {
    return NextResponse.json({ error: "KV not configured" }, { status: 503 });
  }

  const consume = req.nextUrl.searchParams.get("consume");

  if (consume === "push") {
    const queue = (await kvGet<TripEvent[]>(pushQueueKey())) ?? [];
    await kvSet(pushQueueKey(), []);
    return NextResponse.json({
      ok: true,
      events: queue,
      consumed: queue.length,
    });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(200, Math.floor(limitParam)))
    : 50;

  const journal = (await kvGet<TripEvent[]>(journalKey())) ?? [];
  return NextResponse.json({
    ok: true,
    count: journal.length,
    events: journal.slice(0, limit),
  });
}
