export type TripwireStatus = "armed" | "tripped" | "disabled";

export type TripwireSourceRef = {
  kind:
    | "terminal:integrity.gi"
    | "terminal:integrity.mode"
    | "terminal:vault.balance"
    | "terminal:vault.status"
    | "terminal:signal.composite"
    | "terminal:lane.state"
    | "terminal:micro-agent.value"
    | "terminal:epicon.backlog"
    | "terminal:sentiment.domain";
  param?: string;
};

export type TripwireCondition =
  | { op: "lt" | "lte" | "gt" | "gte"; threshold: number }
  | { op: "eq" | "neq"; threshold: string | number | boolean }
  | { op: "in"; threshold: Array<string | number> }
  | { op: "changed" };

export type TripwireAction = {
  journal: boolean;
  push: boolean;
};

export type TripwireDefinition = {
  id: string;
  label: string;
  rationale: string;
  source: TripwireSourceRef;
  condition: TripwireCondition;
  action: TripwireAction;
  cooldown_seconds: number;
  status: TripwireStatus;
  created_at: string;
  updated_at: string;
  last_tripped_at: string | null;
  last_reset_at: string | null;
};

export type TripEvent = {
  tripwire_id: string;
  timestamp: string;
  observed_value: unknown;
  observed_context: Record<string, unknown>;
  summary: string;
};

export type TripwireEvaluationResult = {
  tripwire_id: string;
  evaluated_at: string;
  matched: boolean;
  fired: boolean;
  skip_reason: string | null;
  observed_value: unknown;
  observed_context: Record<string, unknown>;
};

export type TripwireCreateInput = {
  label: string;
  rationale: string;
  source: TripwireSourceRef;
  condition: TripwireCondition;
  action?: Partial<TripwireAction>;
  cooldown_seconds?: number;
  status?: TripwireStatus;
};

export type TripwireUpdateInput = Partial<
  Pick<
    TripwireDefinition,
    "label" | "rationale" | "condition" | "action" | "cooldown_seconds" | "status"
  >
>;

/** Single-operator today; multi-tenant uses same key shape with another scope id. */
export type CitizenScope = "self";
