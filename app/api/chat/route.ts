import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { completeChat, getInferenceEnv } from "@/lib/inference";
import { buildAtlasSystemPrompt } from "@/lib/atlas-chat-prompt";
import { fetchAtlasLiveForChat } from "@/lib/atlas-gateway-state";

export const dynamic = "force-dynamic";

type ChatBody = {
  messages?: Array<{ role: string; content: string }>;
  model?: string;
};

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

  const live = await fetchAtlasLiveForChat();
  const system = buildAtlasSystemPrompt({
    mode: live.mode,
    state: live.state,
    auditTail: live.auditTail,
  });

  const messages = [
    { role: "system" as const, content: system },
    ...userThread.filter((m) => m.role !== "system"),
  ];

  try {
    const reply = await completeChat({
      messages,
      model: body.model,
    });
    return NextResponse.json({
      reply,
      context: {
        mode: live.mode,
        hasState: Boolean(live.state),
        auditCount: live.auditTail.length,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
