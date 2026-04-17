import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { kvConfigured } from "@/lib/kv";
import { getHistory, getTripwire } from "@/lib/tripwires/store";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!kvConfigured()) {
    return NextResponse.json({ error: "KV not configured" }, { status: 503 });
  }

  const { id } = await params;
  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(100, Math.floor(limitParam)))
    : 50;

  const tripwire = await getTripwire(id, "self");
  if (!tripwire) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const history = await getHistory(id, "self", limit);
  return NextResponse.json({
    ok: true,
    tripwire_id: id,
    count: history.length,
    history,
  });
}
