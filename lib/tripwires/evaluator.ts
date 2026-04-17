import type {
  TripEvent,
  TripwireCondition,
  TripwireDefinition,
  TripwireEvaluationResult,
} from "@/lib/tripwires/types";
import {
  resolveSource,
  type SourceResolution,
  type TerminalSnapshot,
} from "@/lib/tripwires/sources";

export type LastObservedMap = Record<string, unknown>;

function evaluateCondition(
  condition: TripwireCondition,
  observedValue: unknown,
  lastObserved: unknown
): boolean {
  switch (condition.op) {
    case "lt":
      return typeof observedValue === "number" && observedValue < condition.threshold;
    case "lte":
      return typeof observedValue === "number" && observedValue <= condition.threshold;
    case "gt":
      return typeof observedValue === "number" && observedValue > condition.threshold;
    case "gte":
      return typeof observedValue === "number" && observedValue >= condition.threshold;
    case "eq":
      return observedValue === condition.threshold;
    case "neq":
      return observedValue !== condition.threshold;
    case "in":
      return (
        Array.isArray(condition.threshold) &&
        condition.threshold.some((t) => t === observedValue)
      );
    case "changed":
      if (lastObserved === undefined) return false;
      return observedValue !== lastObserved;
    default:
      return false;
  }
}

function isInCooldown(def: TripwireDefinition, now: number): boolean {
  if (!def.last_tripped_at) return false;
  const last = new Date(def.last_tripped_at).getTime();
  if (!Number.isFinite(last)) return false;
  return now - last < def.cooldown_seconds * 1000;
}

function summarize(
  def: TripwireDefinition,
  resolution: SourceResolution
): string {
  const c = def.condition;
  let what: string;
  if (c.op === "changed") {
    what = `${resolution.display} changed`;
  } else if ("threshold" in c) {
    const th = c.threshold;
    what = `${resolution.display} — op ${c.op} ${String(th)}`;
  } else {
    what = resolution.display;
  }
  return `${def.label} — ${what}`;
}

export type EvaluateOutcome = {
  result: TripwireEvaluationResult;
  trip: TripEvent | null;
  shouldReset: boolean;
  nextObserved: unknown;
};

export function evaluateTripwire(
  def: TripwireDefinition,
  snapshot: TerminalSnapshot | null,
  lastObservedMap: LastObservedMap,
  now: number = Date.now()
): EvaluateOutcome {
  const evaluated_at = new Date(now).toISOString();

  if (def.status === "disabled") {
    return {
      result: {
        tripwire_id: def.id,
        evaluated_at,
        matched: false,
        fired: false,
        skip_reason: "disabled",
        observed_value: null,
        observed_context: {},
      },
      trip: null,
      shouldReset: false,
      nextObserved: lastObservedMap[def.id],
    };
  }

  const resolution = resolveSource(def.source, snapshot);

  if (!resolution.ok) {
    return {
      result: {
        tripwire_id: def.id,
        evaluated_at,
        matched: false,
        fired: false,
        skip_reason: "source-error",
        observed_value: resolution.value,
        observed_context: resolution.context,
      },
      trip: null,
      shouldReset: false,
      nextObserved: lastObservedMap[def.id],
    };
  }

  const lastObserved = lastObservedMap[def.id];
  const matched = evaluateCondition(def.condition, resolution.value, lastObserved);

  if (!matched) {
    const shouldReset = def.status === "tripped";
    return {
      result: {
        tripwire_id: def.id,
        evaluated_at,
        matched: false,
        fired: false,
        skip_reason: "no-match",
        observed_value: resolution.value,
        observed_context: resolution.context,
      },
      trip: null,
      shouldReset,
      nextObserved: resolution.value,
    };
  }

  if (def.status !== "armed") {
    return {
      result: {
        tripwire_id: def.id,
        evaluated_at,
        matched: true,
        fired: false,
        skip_reason: "not-armed",
        observed_value: resolution.value,
        observed_context: resolution.context,
      },
      trip: null,
      shouldReset: false,
      nextObserved: resolution.value,
    };
  }

  if (isInCooldown(def, now)) {
    return {
      result: {
        tripwire_id: def.id,
        evaluated_at,
        matched: true,
        fired: false,
        skip_reason: "cooldown",
        observed_value: resolution.value,
        observed_context: resolution.context,
      },
      trip: null,
      shouldReset: false,
      nextObserved: resolution.value,
    };
  }

  const trip: TripEvent = {
    tripwire_id: def.id,
    timestamp: evaluated_at,
    observed_value: resolution.value,
    observed_context: resolution.context,
    summary: summarize(def, resolution),
  };

  return {
    result: {
      tripwire_id: def.id,
      evaluated_at,
      matched: true,
      fired: true,
      skip_reason: null,
      observed_value: resolution.value,
      observed_context: resolution.context,
    },
    trip,
    shouldReset: false,
    nextObserved: resolution.value,
  };
}
