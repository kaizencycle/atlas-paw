import { NextRequest, NextResponse } from "next/server";
import {
  dispatchJob,
  validateDispatchRequest,
} from "@/lib/mobius/dispatcher/orchestrator";
import { verifyWebhookSecret } from "@/lib/mobius/hmac/signer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(
  body: {
    ok: boolean;
    status: string;
    claimId: string | null;
    message: string | null;
  },
  status: number
) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  const secret = process.env.MOBIUS_DISPATCH_WEBHOOK_SECRET?.trim() ?? "";
  if (!secret) {
    return json(
      {
        ok: false,
        status: "CONFIG_INCOMPLETE",
        claimId: null,
        message: "MOBIUS_DISPATCH_WEBHOOK_SECRET is not configured",
      },
      503
    );
  }

  if (!verifyWebhookSecret(req.headers.get("authorization"), secret)) {
    return json(
      {
        ok: false,
        status: "UNAUTHORIZED",
        claimId: null,
        message: "Invalid webhook secret",
      },
      401
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(
      {
        ok: false,
        status: "INVALID_REQUEST",
        claimId: null,
        message: "Invalid JSON",
      },
      400
    );
  }

  const parsed = validateDispatchRequest(body);
  if (typeof parsed === "string") {
    return json(
      {
        ok: false,
        status: "INVALID_REQUEST",
        claimId: null,
        message: parsed,
      },
      400
    );
  }

  const dispatched = await dispatchJob(parsed);
  return json(
    {
      ok: dispatched.ok,
      status: dispatched.status,
      claimId: dispatched.claimId,
      message: dispatched.message,
    },
    dispatched.httpStatus
  );
}
