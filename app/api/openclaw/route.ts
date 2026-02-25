import { NextRequest, NextResponse } from "next/server";
import { openclawRPC, openclawExec, checkTunnelHealth } from "@/lib/openclaw";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const online = await checkTunnelHealth();
  if (!online) {
    return NextResponse.json(
      { error: "Gateway offline" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const { action, params } = body as {
    action: string;
    params?: Record<string, unknown>;
  };

  try {
    switch (action) {
      case "status": {
        const out = await openclawExec(
          "python atlas_heartbeat_v3.py status 2>&1"
        );
        return NextResponse.json({ result: out });
      }
      case "state": {
        const out = await openclawExec(
          "python -c \"import json,pathlib; p=pathlib.Path.home()/'.config'/'moltbook_atlas'/'atlas_state.json'; print(p.read_text()) if p.exists() else print('{}')\""
        );
        return NextResponse.json({ result: JSON.parse(out || "{}") });
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
      case "audit": {
        const out = await openclawExec(
          "python -c \"import json,pathlib,os; d=pathlib.Path.home()/'.config'/'moltbook_atlas'/'audit'; entries=[]; [entries.extend(json.loads((d/f).read_text())) for f in sorted(os.listdir(d),reverse=True)[:7] if f.endswith('.json')] if d.exists() else None; print(json.dumps(entries[-100:]))\""
        );
        return NextResponse.json({ result: JSON.parse(out || "[]") });
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
