import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { kvConfigured } from "@/lib/kv";
import { deleteTripwire, getTripwire, updateTripwire } from "@/lib/tripwires/store";
import type { TripwireCondition, TripwireUpdateInput } from "@/lib/tripwires/types";
import { isValidCondition } from "@/lib/tripwires/validate";

export const dynamic = "force-dynamic";

function kvCheck() {
  if (!kvConfigured()) {
    return NextResponse.json({ error: "KV not configured" }, { status: 503 });
  }
  return null;
}

function validatePatch(raw: unknown): TripwireUpdateInput | string {
  if (!raw || typeof raw !== "object") return "body must be an object";
  const r = raw as Record<string, unknown>;
  const patch: TripwireUpdateInput = {};

  if (r.label !== undefined) {
    if (typeof r.label !== "string" || r.label.trim().length === 0) {
      return "label must be a non-empty string";
    }
    patch.label = r.label.trim().slice(0, 120);
  }
  if (r.rationale !== undefined) {
    if (typeof r.rationale !== "string" || r.rationale.trim().length === 0) {
      return "rationale must be a non-empty string";
    }
    patch.rationale = r.rationale.trim().slice(0, 2000);
  }
  if (r.cooldown_seconds !== undefined) {
    if (typeof r.cooldown_seconds !== "number" || r.cooldown_seconds < 0) {
      return "cooldown_seconds must be a non-negative number";
    }
    patch.cooldown_seconds = r.cooldown_seconds;
  }
  if (r.status !== undefined) {
    if (r.status !== "armed" && r.status !== "disabled" && r.status !== "tripped") {
      return "status must be armed|disabled|tripped";
    }
    patch.status = r.status;
  }
  if (r.action !== undefined) {
    if (!r.action || typeof r.action !== "object") return "action must be object";
    const a = r.action as Record<string, unknown>;
    const action: { journal?: boolean; push?: boolean } = {};
    if (a.journal !== undefined) {
      if (typeof a.journal !== "boolean") return "action.journal must be boolean";
      action.journal = a.journal;
    }
    if (a.push !== undefined) {
      if (typeof a.push !== "boolean") return "action.push must be boolean";
      action.push = a.push;
    }
    patch.action = action as { journal: boolean; push: boolean };
  }
  if (r.condition !== undefined) {
    if (!isValidCondition(r.condition)) return "invalid condition";
    patch.condition = r.condition as TripwireCondition;
  }

  return patch;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kvErr = kvCheck();
  if (kvErr) return kvErr;

  const { id } = await params;
  const tripwire = await getTripwire(id, "self");
  if (!tripwire) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, tripwire });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kvErr = kvCheck();
  if (kvErr) return kvErr;

  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch = validatePatch(body);
  if (typeof patch === "string") {
    return NextResponse.json({ error: patch }, { status: 400 });
  }

  const updated = await updateTripwire(id, patch, "self");
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, tripwire: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const kvErr = kvCheck();
  if (kvErr) return kvErr;

  const { id } = await params;
  await deleteTripwire(id, "self");
  return NextResponse.json({ ok: true });
}
