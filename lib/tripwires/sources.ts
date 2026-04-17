import type { TripwireSourceRef } from "@/lib/tripwires/types";

const TERMINAL_SNAPSHOT_URL =
  process.env.TERMINAL_SNAPSHOT_URL ||
  "https://mobius-civic-ai-terminal.vercel.app/api/terminal/snapshot-lite";

export type SourceResolution = {
  ok: boolean;
  value: unknown;
  context: Record<string, unknown>;
  display: string;
};

export type TerminalSnapshot = Record<string, unknown>;

export async function fetchTerminalSnapshot(): Promise<TerminalSnapshot | null> {
  try {
    const res = await fetch(TERMINAL_SNAPSHOT_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as TerminalSnapshot;
  } catch {
    return null;
  }
}

function get<T = unknown>(obj: unknown, path: string[]): T | undefined {
  let cur: unknown = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur as T | undefined;
}

function unavailable(why: string): SourceResolution {
  return {
    ok: false,
    value: null,
    context: { error: why },
    display: `unavailable (${why})`,
  };
}

type Resolver = (
  ref: TripwireSourceRef,
  snapshot: TerminalSnapshot | null
) => SourceResolution;

const SOURCE_RESOLVERS: Record<TripwireSourceRef["kind"], Resolver> = {
  "terminal:integrity.gi": (_ref, snap) => {
    if (!snap) return unavailable("no snapshot");
    const gi = get<number>(snap, ["integrity", "data", "global_integrity"]);
    if (typeof gi !== "number") return unavailable("gi missing");
    return {
      ok: true,
      value: gi,
      context: {
        cycle: get(snap, ["integrity", "data", "cycle"]),
        mode: get(snap, ["integrity", "data", "mode"]),
      },
      display: `GI ${gi.toFixed(2)}`,
    };
  },

  "terminal:integrity.mode": (_ref, snap) => {
    if (!snap) return unavailable("no snapshot");
    const mode = get<string>(snap, ["integrity", "data", "mode"]);
    if (typeof mode !== "string") return unavailable("mode missing");
    return {
      ok: true,
      value: mode,
      context: { gi: get(snap, ["integrity", "data", "global_integrity"]) },
      display: `mode ${mode}`,
    };
  },

  "terminal:vault.balance": (_ref, snap) => {
    if (!snap) return unavailable("no snapshot");
    const balance = get<number>(snap, ["vault", "data", "balance_reserve"]);
    if (typeof balance !== "number") return unavailable("vault balance missing");
    return {
      ok: true,
      value: balance,
      context: {
        threshold: get(snap, ["vault", "data", "activation_threshold"]),
        status: get(snap, ["vault", "data", "status"]),
      },
      display: `vault ${balance.toFixed(2)} reserve`,
    };
  },

  "terminal:vault.status": (_ref, snap) => {
    if (!snap) return unavailable("no snapshot");
    const status = get<string>(snap, ["vault", "data", "status"]);
    if (typeof status !== "string") return unavailable("vault status missing");
    return {
      ok: true,
      value: status,
      context: { balance: get(snap, ["vault", "data", "balance_reserve"]) },
      display: `vault ${status}`,
    };
  },

  "terminal:signal.composite": (_ref, snap) => {
    if (!snap) return unavailable("no snapshot");
    const composite = get<number>(snap, ["signals", "data", "composite"]);
    if (typeof composite !== "number") return unavailable("composite missing");
    return {
      ok: true,
      value: composite,
      context: { anomalies: get(snap, ["signals", "data", "anomalies"]) },
      display: `signal composite ${composite.toFixed(3)}`,
    };
  },

  "terminal:lane.state": (ref, snap) => {
    if (!snap) return unavailable("no snapshot");
    const laneKey = ref.param;
    if (!laneKey) return unavailable("missing lane key");
    const lanes = get<Array<{ key: string; state: string; message?: string }>>(
      snap,
      ["lanes"]
    );
    if (!Array.isArray(lanes)) return unavailable("lanes missing");
    const lane = lanes.find((l) => l.key === laneKey);
    if (!lane) return unavailable(`lane ${laneKey} not found`);
    return {
      ok: true,
      value: lane.state,
      context: { message: lane.message },
      display: `lane ${laneKey}: ${lane.state}`,
    };
  },

  "terminal:micro-agent.value": (ref, snap) => {
    if (!snap) return unavailable("no snapshot");
    const agentName = ref.param;
    if (!agentName) return unavailable("missing agent name");
    const signals = get<
      Array<{
        agentName: string;
        value: number;
        label?: string;
        severity?: string;
      }>
    >(snap, ["signals", "data", "allSignals"]);
    if (!Array.isArray(signals)) return unavailable("allSignals missing");
    const sig = signals.find((s) => s.agentName === agentName);
    if (!sig) return unavailable(`${agentName} not in signals`);
    return {
      ok: true,
      value: sig.value,
      context: { label: sig.label, severity: sig.severity },
      display: `${agentName}: ${sig.value} (${sig.severity ?? "?"})`,
    };
  },

  "terminal:epicon.backlog": (_ref, snap) => {
    if (!snap) return unavailable("no snapshot");
    const count = get<number>(snap, ["epicon", "data", "count"]);
    if (typeof count !== "number") return unavailable("epicon count missing");
    return {
      ok: true,
      value: count,
      context: { total: get(snap, ["epicon", "data", "total"]) },
      display: `epicon backlog ${count}`,
    };
  },

  "terminal:sentiment.domain": (ref, snap) => {
    if (!snap) return unavailable("no snapshot");
    const domainKey = ref.param;
    if (!domainKey) return unavailable("missing domain key");
    const domains = get<
      Array<{ key: string; score: number | null; label?: string }>
    >(snap, ["sentiment", "data", "domains"]);
    if (!Array.isArray(domains)) return unavailable("sentiment domains missing");
    const d = domains.find((x) => x.key === domainKey);
    if (!d) return unavailable(`domain ${domainKey} not found`);
    if (d.score === null) return unavailable(`domain ${domainKey} has no score`);
    return {
      ok: true,
      value: d.score,
      context: { label: d.label },
      display: `${domainKey}: ${d.score.toFixed(2)}`,
    };
  },
};

export function resolveSource(
  ref: TripwireSourceRef,
  snapshot: TerminalSnapshot | null
): SourceResolution {
  const resolver = SOURCE_RESOLVERS[ref.kind];
  if (!resolver) return unavailable(`unknown source kind: ${ref.kind}`);
  try {
    return resolver(ref, snapshot);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return unavailable(`resolver threw: ${msg}`);
  }
}

export function listSourceKinds(): Array<{
  kind: TripwireSourceRef["kind"];
  description: string;
  takes_param: boolean;
  param_hint?: string;
}> {
  return [
    {
      kind: "terminal:integrity.gi",
      description: "Global Integrity score (0–1)",
      takes_param: false,
    },
    {
      kind: "terminal:integrity.mode",
      description: 'Integrity mode (e.g. "green" / "yellow" / "red")',
      takes_param: false,
    },
    {
      kind: "terminal:vault.balance",
      description: "Vault reserve units",
      takes_param: false,
    },
    {
      kind: "terminal:vault.status",
      description: "Vault status string",
      takes_param: false,
    },
    {
      kind: "terminal:signal.composite",
      description: "Overall signal composite (0–1)",
      takes_param: false,
    },
    {
      kind: "terminal:lane.state",
      description: "State of a named snapshot lane",
      takes_param: true,
      param_hint: "lane key, e.g. sentiment",
    },
    {
      kind: "terminal:micro-agent.value",
      description: "Numeric value for a named micro-agent",
      takes_param: true,
      param_hint: "e.g. DAEDALUS-µ5",
    },
    {
      kind: "terminal:epicon.backlog",
      description: "EPICON promotable / backlog count",
      takes_param: false,
    },
    {
      kind: "terminal:sentiment.domain",
      description: "Score for a sentiment domain",
      takes_param: true,
      param_hint: "domain key, e.g. civic",
    },
  ];
}
