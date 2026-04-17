import { kvConfigured, kvGet, kvSet } from "@/lib/kv";
import type { CitizenScope, TripEvent } from "@/lib/tripwires/types";
import {
  listScopes,
  listTripwires,
  recordReset,
  recordTrip,
} from "@/lib/tripwires/store";
import { evaluateTripwire, type LastObservedMap } from "@/lib/tripwires/evaluator";
import { fetchTerminalSnapshot } from "@/lib/tripwires/sources";

const PUSH_QUEUE_MAX = 50;

function lastObservedKey(scope: CitizenScope): string {
  return `atlas:paw:tripwires:${scope}:last-observed`;
}

function pushQueueKey(scope: CitizenScope): string {
  return `atlas:paw:tripwires:${scope}:push-queue`;
}

function journalKey(scope: CitizenScope): string {
  return `atlas:paw:tripwires:${scope}:journal`;
}

async function appendJournal(scope: CitizenScope, event: TripEvent): Promise<void> {
  const existing = (await kvGet<TripEvent[]>(journalKey(scope))) ?? [];
  const next = [event, ...existing].slice(0, 200);
  await kvSet(journalKey(scope), next);
}

async function appendPushQueue(scope: CitizenScope, event: TripEvent): Promise<void> {
  const existing = (await kvGet<TripEvent[]>(pushQueueKey(scope))) ?? [];
  const already = existing.some(
    (e) => e.tripwire_id === event.tripwire_id && e.timestamp === event.timestamp
  );
  if (already) return;
  const next = [event, ...existing].slice(0, PUSH_QUEUE_MAX);
  await kvSet(pushQueueKey(scope), next);
}

export type TripwireEvaluationReport = {
  scope: CitizenScope;
  total: number;
  fired: number;
  reset: number;
  errors: number;
  skipped: Record<string, number>;
};

export type RunTripwireEvaluationResult = {
  ok: boolean;
  skipped?: string;
  duration_ms: number;
  scopes_evaluated: number;
  snapshot_ok: boolean;
  report: TripwireEvaluationReport[];
  at: string;
};

export async function runTripwireEvaluation(): Promise<RunTripwireEvaluationResult> {
  const started = Date.now();
  const at = new Date().toISOString();

  if (!kvConfigured()) {
    return {
      ok: false,
      skipped: "KV not configured",
      duration_ms: Date.now() - started,
      scopes_evaluated: 0,
      snapshot_ok: false,
      report: [],
      at,
    };
  }

  const snapshot = await fetchTerminalSnapshot();
  const scopes = listScopes();
  const report: TripwireEvaluationReport[] = [];

  for (const scope of scopes) {
    const tripwires = await listTripwires(scope);
    const lastObserved =
      (await kvGet<LastObservedMap>(lastObservedKey(scope))) ?? {};
    const nextObserved: LastObservedMap = { ...lastObserved };

    const perScope: TripwireEvaluationReport = {
      scope,
      total: tripwires.length,
      fired: 0,
      reset: 0,
      errors: 0,
      skipped: {},
    };

    for (const def of tripwires) {
      const outcome = evaluateTripwire(def, snapshot, lastObserved);
      nextObserved[def.id] = outcome.nextObserved;

      if (outcome.result.skip_reason) {
        perScope.skipped[outcome.result.skip_reason] =
          (perScope.skipped[outcome.result.skip_reason] ?? 0) + 1;
        if (outcome.result.skip_reason === "source-error") {
          perScope.errors += 1;
        }
      }

      if (outcome.shouldReset) {
        await recordReset(def.id, scope);
        perScope.reset += 1;
      }

      if (outcome.trip) {
        await recordTrip(def.id, outcome.trip, scope);
        if (def.action.journal) {
          await appendJournal(scope, outcome.trip);
        }
        if (def.action.push) {
          await appendPushQueue(scope, outcome.trip);
        }
        perScope.fired += 1;
      }
    }

    await kvSet(lastObservedKey(scope), nextObserved);
    report.push(perScope);
  }

  return {
    ok: true,
    duration_ms: Date.now() - started,
    scopes_evaluated: scopes.length,
    snapshot_ok: snapshot !== null,
    report,
    at,
  };
}
