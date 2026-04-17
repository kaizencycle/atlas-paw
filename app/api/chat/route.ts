import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { streamChat, getInferenceEnv } from "@/lib/inference";
import { buildAtlasSystemPrompt } from "@/lib/atlas-chat-prompt";
import { fetchAtlasLiveForChat } from "@/lib/atlas-gateway-state";
import type { AtlasAuditEntry, AtlasLiveState } from "@/lib/atlas-types";

export const dynamic = "force-dynamic";

type ClientSnapshot = {
  mode?: string;
  state?: AtlasLiveState | null;
  auditTail?: AtlasAuditEntry[];
  checkedAt?: string;
};

type ChatBody = {
  messages?: Array<{ role: string; content: string }>;
  model?: string;
  snapshot?: ClientSnapshot;
};

const CLIENT_SNAPSHOT_MAX_AGE_MS = 30_000;

function ageMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Date.now() - t;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getInferenceEnv()) {
    return NextResponse.json(
      {
        error:
          "Chat inference not configured. Set INFERENCE_BASE_URL and INFERENCE_API_KEY (optional INFERENCE_MODEL).",
      },
      { status: 503 }
    );
  }

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : [];
  const userThread = rawMessages
    .filter(
      (m): m is { role: "user" | "assistant" | "system"; content: string } =>
        (m.role === "user" || m.role === "assistant" || m.role === "system") &&
        typeof m.content === "string"
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12000) }));

  if (userThread.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  let liveMode: "full" | "readonly" = "readonly";
  let liveState: AtlasLiveState | null = null;
  let liveAudit: AtlasAuditEntry[] = [];

  const clientAge = ageMs(body.snapshot?.checkedAt);
  const clientFresh =
    clientAge !== null && clientAge < CLIENT_SNAPSHOT_MAX_AGE_MS;
  const cs = body.snapshot;

  if (
    clientFresh &&
    cs &&
    (cs.mode === "full" || cs.mode === "readonly")
  ) {
    liveMode = cs.mode;
    liveState = cs.state ?? null;
    liveAudit = Array.isArray(cs.auditTail) ? cs.auditTail : [];
  } else {
    const live = await fetchAtlasLiveForChat();
    liveMode = live.mode;
    liveState = live.state ?? live.lastSeen?.state ?? null;
    liveAudit =
      live.auditTail.length > 0
        ? live.auditTail
        : live.lastSeen?.auditTail ?? [];
  }

  const system = buildAtlasSystemPrompt({
    mode: liveMode,
    state: liveState,
    auditTail: liveAudit,
  });

  const messages = [
    { role: "system" as const, content: system },
    ...userThread.filter((m) => m.role !== "system"),
  ];

  try {
    const stream = await streamChat({ messages, model: body.model });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
