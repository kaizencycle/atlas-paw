import { kvConfigured, kvGet, kvSet, kvDel } from "@/lib/kv";
import type {
  CitizenScope,
  TripwireCreateInput,
  TripwireDefinition,
  TripwireUpdateInput,
  TripEvent,
} from "@/lib/tripwires/types";

const HISTORY_MAX = 100;

function indexKey(scope: CitizenScope): string {
  return `atlas:paw:tripwires:${scope}:index`;
}
function defKey(scope: CitizenScope, id: string): string {
  return `atlas:paw:tripwires:${scope}:def:${id}`;
}
function historyKey(scope: CitizenScope, id: string): string {
  return `atlas:paw:tripwires:${scope}:history:${id}`;
}

function newId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `tw_${time}_${rand}`;
}

async function readIndex(scope: CitizenScope): Promise<string[]> {
  const raw = await kvGet<string[] | string>(indexKey(scope));
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function writeIndex(scope: CitizenScope, ids: string[]): Promise<void> {
  await kvSet(indexKey(scope), ids);
}

export async function listTripwires(
  scope: CitizenScope = "self"
): Promise<TripwireDefinition[]> {
  if (!kvConfigured()) return [];
  const ids = await readIndex(scope);
  if (ids.length === 0) return [];
  const results = await Promise.all(ids.map((id) => getTripwire(id, scope)));
  return results.filter((t): t is TripwireDefinition => t !== null);
}

export async function getTripwire(
  id: string,
  scope: CitizenScope = "self"
): Promise<TripwireDefinition | null> {
  if (!kvConfigured()) return null;
  return kvGet<TripwireDefinition>(defKey(scope, id));
}

export async function createTripwire(
  input: TripwireCreateInput,
  scope: CitizenScope = "self"
): Promise<TripwireDefinition | null> {
  if (!kvConfigured()) return null;

  const now = new Date().toISOString();
  const def: TripwireDefinition = {
    id: newId(),
    label: input.label,
    rationale: input.rationale,
    source: input.source,
    condition: input.condition,
    action: {
      journal: input.action?.journal ?? true,
      push: input.action?.push ?? false,
    },
    cooldown_seconds: input.cooldown_seconds ?? 3600,
    status: input.status ?? "armed",
    created_at: now,
    updated_at: now,
    last_tripped_at: null,
    last_reset_at: null,
  };

  const ok = await kvSet(defKey(scope, def.id), def);
  if (!ok) return null;

  const ids = await readIndex(scope);
  if (!ids.includes(def.id)) {
    await writeIndex(scope, [...ids, def.id]);
  }
  return def;
}

export async function updateTripwire(
  id: string,
  patch: TripwireUpdateInput,
  scope: CitizenScope = "self"
): Promise<TripwireDefinition | null> {
  if (!kvConfigured()) return null;
  const current = await getTripwire(id, scope);
  if (!current) return null;

  const next: TripwireDefinition = {
    ...current,
    ...(patch.label !== undefined ? { label: patch.label } : {}),
    ...(patch.rationale !== undefined ? { rationale: patch.rationale } : {}),
    ...(patch.condition !== undefined ? { condition: patch.condition } : {}),
    ...(patch.action !== undefined
      ? { action: { ...current.action, ...patch.action } }
      : {}),
    ...(patch.cooldown_seconds !== undefined
      ? { cooldown_seconds: patch.cooldown_seconds }
      : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    updated_at: new Date().toISOString(),
  };

  const ok = await kvSet(defKey(scope, id), next);
  return ok ? next : null;
}

export async function deleteTripwire(
  id: string,
  scope: CitizenScope = "self"
): Promise<boolean> {
  if (!kvConfigured()) return false;
  const ids = await readIndex(scope);
  const nextIds = ids.filter((x) => x !== id);
  if (nextIds.length !== ids.length) {
    await writeIndex(scope, nextIds);
  }
  await kvDel(defKey(scope, id));
  await kvDel(historyKey(scope, id));
  return true;
}

export async function recordTrip(
  id: string,
  event: TripEvent,
  scope: CitizenScope = "self"
): Promise<void> {
  if (!kvConfigured()) return;

  const current = await getTripwire(id, scope);
  if (current) {
    await kvSet(defKey(scope, id), {
      ...current,
      last_tripped_at: event.timestamp,
      status: "tripped" as const,
      updated_at: event.timestamp,
    });
  }

  const history = (await kvGet<TripEvent[]>(historyKey(scope, id))) ?? [];
  const next = [event, ...history].slice(0, HISTORY_MAX);
  await kvSet(historyKey(scope, id), next);
}

export async function recordReset(
  id: string,
  scope: CitizenScope = "self"
): Promise<void> {
  if (!kvConfigured()) return;
  const current = await getTripwire(id, scope);
  if (!current || current.status !== "tripped") return;
  const now = new Date().toISOString();
  await kvSet(defKey(scope, id), {
    ...current,
    status: "armed" as const,
    last_reset_at: now,
    updated_at: now,
  });
}

export async function getHistory(
  id: string,
  scope: CitizenScope = "self",
  limit = 50
): Promise<TripEvent[]> {
  if (!kvConfigured()) return [];
  const history = (await kvGet<TripEvent[]>(historyKey(scope, id))) ?? [];
  return history.slice(0, limit);
}

export function listScopes(): CitizenScope[] {
  return ["self"];
}
