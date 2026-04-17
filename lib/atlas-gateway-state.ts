import {
  checkTunnelHealth,
  openclawExec,
} from "@/lib/openclaw-core";
import type { AtlasAuditEntry, AtlasLiveState } from "@/lib/atlas-types";

export async function fetchAtlasLiveForChat(): Promise<{
  mode: "full" | "readonly";
  state: AtlasLiveState | null;
  auditTail: AtlasAuditEntry[];
}> {
  const online = await checkTunnelHealth();
  if (!online) {
    return { mode: "readonly", state: null, auditTail: [] };
  }

  try {
    const stateOut = await openclawExec(
      "python -c \"import json,pathlib; p=pathlib.Path.home()/'.config'/'moltbook_atlas'/'atlas_state.json'; print(p.read_text()) if p.exists() else print('{}')\""
    );
    const state = JSON.parse(stateOut || "{}") as AtlasLiveState;

    const auditOut = await openclawExec(
      "python -c \"import json,pathlib,os; d=pathlib.Path.home()/'.config'/'moltbook_atlas'/'audit'; entries=[]; [entries.extend(json.loads((d/f).read_text())) for f in sorted(os.listdir(d),reverse=True)[:7] if f.endswith('.json')] if d.exists() else None; print(json.dumps(entries[-100:]))\""
    );
    const auditRaw = JSON.parse(auditOut || "[]") as AtlasAuditEntry[];
    const auditTail = auditRaw
      .slice()
      .sort((x, y) => (y.timestamp || "").localeCompare(x.timestamp || ""))
      .slice(0, 8);

    return { mode: "full", state, auditTail };
  } catch {
    return { mode: "readonly", state: null, auditTail: [] };
  }
}
