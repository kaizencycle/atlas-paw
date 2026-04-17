import {
  checkTunnelHealth,
  openclawExec,
  openclawRPC,
} from "@/lib/openclaw-core";
import { kvConfigured, kvGet, kvSet } from "@/lib/kv";
import type {
  AtlasAuditEntry,
  AtlasLastSeen,
  AtlasLiveState,
} from "@/lib/atlas-types";

const KV_LAST_SEEN = "atlas:paw:last-seen";
const LAST_SEEN_TTL_SECONDS = 86_400;

type StateReadResult = {
  result?: { state?: AtlasLiveState; audit?: AtlasAuditEntry[] };
};

async function persistLastSeen(state: AtlasLiveState, auditTail: AtlasAuditEntry[]) {
  if (!kvConfigured()) return;
  await kvSet(
    KV_LAST_SEEN,
    {
      state,
      auditTail,
      at: new Date().toISOString(),
    } satisfies AtlasLastSeen,
    { ex: LAST_SEEN_TTL_SECONDS }
  );
}

export async function readGatewayState(): Promise<{
  state: AtlasLiveState | null;
  auditTail: AtlasAuditEntry[];
}> {
  try {
    const raw = (await openclawRPC("state.read")) as StateReadResult;
    const state = raw?.result?.state ?? null;
    const auditRaw = Array.isArray(raw?.result?.audit)
      ? raw.result!.audit!
      : [];
    const auditTail = auditRaw
      .slice()
      .sort((x, y) => (y.timestamp || "").localeCompare(x.timestamp || ""))
      .slice(0, 8);
    if (state && typeof state.suspended === "boolean") {
      void persistLastSeen(state, auditTail);
      return { state, auditTail };
    }
  } catch {
    // Fall through to legacy exec path.
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

    void persistLastSeen(state, auditTail);
    return { state, auditTail };
  } catch {
    return { state: null, auditTail: [] };
  }
}

export async function loadLastSeen(): Promise<AtlasLastSeen | null> {
  if (!kvConfigured()) return null;
  return kvGet<AtlasLastSeen>(KV_LAST_SEEN);
}

export async function fetchAtlasLiveForChat(): Promise<{
  mode: "full" | "readonly";
  state: AtlasLiveState | null;
  auditTail: AtlasAuditEntry[];
  lastSeen: AtlasLastSeen | null;
}> {
  const online = await checkTunnelHealth();
  if (!online) {
    const lastSeen = await loadLastSeen();
    return {
      mode: "readonly",
      state: null,
      auditTail: [],
      lastSeen,
    };
  }

  try {
    const { state, auditTail } = await readGatewayState();
    return {
      mode: state ? "full" : "readonly",
      state,
      auditTail,
      lastSeen: null,
    };
  } catch {
    const lastSeen = await loadLastSeen();
    return { mode: "readonly", state: null, auditTail: [], lastSeen };
  }
}
