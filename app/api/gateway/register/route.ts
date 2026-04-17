import { NextRequest, NextResponse } from "next/server";
import { registerTunnelUrl, getRegisteredTunnelUrl } from "@/lib/openclaw-core";
import { kvConfigured } from "@/lib/kv";

export const dynamic = "force-dynamic";

const SECRET = process.env.GATEWAY_REGISTER_SECRET || "";

function authed(req: NextRequest): boolean {
  if (!SECRET) return false;
  const header = req.headers.get("authorization") || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer.length !== SECRET.length) return false;
  let diff = 0;
  for (let i = 0; i < bearer.length; i++) {
    diff |= bearer.charCodeAt(i) ^ SECRET.charCodeAt(i);
  }
  return diff === 0;
}

export async function POST(req: NextRequest) {
  if (!kvConfigured()) {
    return NextResponse.json(
      { error: "KV not configured" },
      { status: 503 }
    );
  }
  if (!authed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { url?: unknown };
  try {
    body = (await req.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url || !url.startsWith("https://")) {
    return NextResponse.json(
      { error: "url must be an https:// string" },
      { status: 400 }
    );
  }

  const ok = await registerTunnelUrl(url);
  if (!ok) {
    return NextResponse.json({ error: "Failed to persist" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    registered: url,
    ttl_seconds: 3600,
    at: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  if (!authed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = await getRegisteredTunnelUrl();
  return NextResponse.json({
    registered: url,
    kv_configured: kvConfigured(),
  });
}
