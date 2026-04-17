import type { TripwireCondition, TripwireSourceRef } from "@/lib/tripwires/types";
import { listSourceKinds } from "@/lib/tripwires/sources";

export function isValidSourceKind(kind: unknown): kind is TripwireSourceRef["kind"] {
  if (typeof kind !== "string") return false;
  return listSourceKinds().some((s) => s.kind === kind);
}

export function isValidCondition(c: unknown): c is TripwireCondition {
  if (!c || typeof c !== "object") return false;
  const op = (c as { op?: unknown }).op;
  if (typeof op !== "string") return false;
  switch (op) {
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      return typeof (c as { threshold?: unknown }).threshold === "number";
    case "eq":
    case "neq": {
      const t = (c as { threshold?: unknown }).threshold;
      return typeof t === "string" || typeof t === "number" || typeof t === "boolean";
    }
    case "in":
      return Array.isArray((c as { threshold?: unknown }).threshold);
    case "changed":
      return true;
    default:
      return false;
  }
}
