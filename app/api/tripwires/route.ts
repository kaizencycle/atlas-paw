import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { kvConfigured } from "@/lib/kv";
import { createTripwire, listTripwires } from "@/lib/tripwires/store";
import type {
  TripwireCondition,
  TripwireCreateInput,
  TripwireSourceRef,
} from "@/lib/tripwires/types";
import { listSourceKinds } from "@/lib/tripwires/sources";
import { STARTER_TEMPLATES } from "@/lib/tripwires/templates";
import { isValidCondition, isValidSourceKind } from "@/lib/tripwires/validate";

export const dynamic = "force-dynamic";

function kvCheck() {
  if (!kvConfigured()) {
    return NextResponse.json(
      {
        error:
          "KV not configured. Set KV_REST_API_URL and KV_REST_API_TOKEN.",
      },
      { status: 503 }
    );
  }
  return null;
}

function validateCreateInput(raw: unknown): TripwireCreateInput | string {
  if (!raw || typeof raw !== "object") return "body must be an object";
  const r = raw as Record<string, unknown>;

  if (typeof r.label !== "string" || r.label.trim().length === 0) {
    return "label required";
  }
  if (typeof r.rationale !== "string" || r.rationale.trim().length === 0) {
    return "rationale required";
  }
  if (!r.source || typeof r.source !== "object") return "source required";
  const src = r.source as Record<string, unknown>;
  if (!isValidSourceKind(src.kind)) return "invalid source.kind";
  if (
    src.param !== undefined &&
    src.param !== null &&
    typeof src.param !== "string"
  ) {
    return "source.param must be a string";
  }
  if (!isValidCondition(r.condition)) return "invalid condition";

  const action = r.action as { journal?: unknown; push?: unknown } | undefined;
  if (action) {
    if (action.journal !== undefined && typeof action.journal !== "boolean") {
      return "action.journal must be boolean";
    }
    if (action.push !== undefined && typeof action.push !== "boolean") {
      return "action.push must be boolean";
    }
  }
  if (
    r.cooldown_seconds !== undefined &&
    (typeof r.cooldown_seconds !== "number" || r.cooldown_seconds < 0)
  ) {
    return "cooldown_seconds must be a non-negative number";
  }

  return {
    label: r.label.trim().slice(0, 120),
    rationale: r.rationale.trim().slice(0, 2000),
    source: {
      kind: src.kind as TripwireSourceRef["kind"],
      param:
        typeof src.param === "string" ? src.param.trim().slice(0, 80) : undefined,
    },
    condition: r.condition as TripwireCondition,
    action:
      action !== undefined
        ? {
            journal:
              typeof action.journal === "boolean" ? action.journal : undefined,
            push: typeof action.push === "boolean" ? action.push : undefined,
          }
        : undefined,
    cooldown_seconds:
      typeof r.cooldown_seconds === "number" ? r.cooldown_seconds : undefined,
    status:
      r.status === "armed" || r.status === "disabled" ? r.status : undefined,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kvErr = kvCheck();
  if (kvErr) return kvErr;

  const tripwires = await listTripwires("self");
  return NextResponse.json({
    ok: true,
    tripwires,
    templates: STARTER_TEMPLATES,
    source_kinds: listSourceKinds(),
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kvErr = kvCheck();
  if (kvErr) return kvErr;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validated = validateCreateInput(body);
  if (typeof validated === "string") {
    return NextResponse.json({ error: validated }, { status: 400 });
  }

  const created = await createTripwire(validated, "self");
  if (!created) {
    return NextResponse.json(
      { error: "Failed to create tripwire" },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true, tripwire: created }, { status: 201 });
}
