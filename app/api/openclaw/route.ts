import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { openclawRPC, openclawExec, checkTunnelHealth } from "@/lib/openclaw";
import { readGatewayState, loadLastSeen } from "@/lib/atlas-gateway-state";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, params } = body as {
    action: string;
    params?: Record<string, unknown>;
  };

  if (action === "state" || action === "audit") {
    const online = await checkTunnelHealth();
    if (online) {
      try {
        const { state, auditTail } = await readGatewayState();
        return NextResponse.json({
          result: action === "state" ? state : auditTail,
          lastSeen: null,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }
    const last = await loadLastSeen();
    return NextResponse.json({
      result: action === "state" ? last?.state ?? null : last?.auditTail ?? [],
      lastSeen: last,
    });
  }

  const online = await checkTunnelHealth();
  if (!online) {
    return NextResponse.json({ error: "Gateway offline" }, { status: 503 });
  }

  try {
    switch (action) {
      case "status": {
        const out = await openclawExec(
          "python atlas_heartbeat_v3.py status 2>&1"
        );
        return NextResponse.json({ result: out });
      }
      case "drafts": {
        const out = await openclawExec(
          "python -c \"import json,pathlib,os; d=pathlib.Path.home()/'.config'/'moltbook_atlas'/'drafts'; files=[json.loads((d/f).read_text()) for f in os.listdir(d) if f.endswith('.json')] if d.exists() else []; print(json.dumps(files))\""
        );
        return NextResponse.json({ result: JSON.parse(out || "[]") });
      }
      case "approve": {
        const id = params?.draftId as string;
        if (!id)
          return NextResponse.json({ error: "Missing draftId" }, { status: 400 });
        const out = await openclawExec(
          `python atlas_heartbeat_v3.py approve ${id} --yes 2>&1`
        );
        return NextResponse.json({ result: out });
      }
      case "reject": {
        const id = params?.draftId as string;
        if (!id)
          return NextResponse.json({ error: "Missing draftId" }, { status: 400 });
        const out = await openclawExec(
          `python atlas_heartbeat_v3.py reject ${id} 2>&1`
        );
        return NextResponse.json({ result: out });
      }
      case "resume": {
        const out = await openclawExec(
          "python -c \"import atlas_heartbeat_v3 as a; s=a.load_state(); s.suspended=False; s.suspension_reason=None; s.suspension_time=None; a.save_state(s); print('Resumed')\""
        );
        return NextResponse.json({ result: out });
      }
      case "heartbeat": {
        const out = await openclawExec(
          "python atlas_heartbeat_v3.py heartbeat 2>&1"
        );
        return NextResponse.json({ result: out });
      }
      case "cron.list": {
        const data = await openclawRPC("cron.list");
        return NextResponse.json({ result: data });
      }
      case "cron.run": {
        const jobId = params?.jobId as string;
        if (!jobId)
          return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
        const data = await openclawRPC("cron.run", {
          jobId,
          mode: "force",
        });
        return NextResponse.json({ result: data });
      }
      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
