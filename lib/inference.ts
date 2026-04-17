/**
 * Model-agnostic chat via OpenAI-compatible HTTP APIs (OpenAI, Groq, OpenRouter,
 * vLLM, Ollama with OpenAI shim, etc.). Configure base URL + key + default model in env.
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type InferenceEnv = {
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
};

export function getInferenceEnv(): InferenceEnv | null {
  const baseUrl = (process.env.INFERENCE_BASE_URL || "").replace(/\/$/, "");
  const apiKey = process.env.INFERENCE_API_KEY || "";
  const defaultModel = process.env.INFERENCE_MODEL || "gpt-4o-mini";
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey, defaultModel };
}

export async function completeChat(params: {
  messages: ChatMessage[];
  model?: string;
}): Promise<string> {
  const env = getInferenceEnv();
  if (!env) {
    throw new Error("Inference is not configured (INFERENCE_BASE_URL, INFERENCE_API_KEY)");
  }
  const model = params.model?.trim() || env.defaultModel;
  const url = `${env.baseUrl}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      temperature: 0.6,
      max_tokens: 2048,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Inference ${res.status}: ${raw.slice(0, 500)}`);
  }
  let data: {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
  };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error("Inference returned non-JSON");
  }
  if (data.error?.message) throw new Error(data.error.message);
  const text = data.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error("Inference response missing assistant content");
  }
  return text.trim();
}

export async function streamChat(params: {
  messages: ChatMessage[];
  model?: string;
}): Promise<ReadableStream<Uint8Array>> {
  const env = getInferenceEnv();
  if (!env) {
    throw new Error("Inference is not configured");
  }
  const model = params.model?.trim() || env.defaultModel;
  const url = `${env.baseUrl}/v1/chat/completions`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.apiKey}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      model,
      messages: params.messages,
      temperature: 0.6,
      max_tokens: 2048,
      stream: true,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!upstream.ok || !upstream.body) {
    const raw = await upstream.text().catch(() => "");
    throw new Error(`Inference ${upstream.status}: ${raw.slice(0, 500)}`);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === "[DONE]") continue;
            try {
              const obj = JSON.parse(payload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const delta = obj.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                controller.enqueue(encoder.encode(delta));
              }
            } catch {
              // ignore malformed SSE frames
            }
          }
        }
      }
    },
    async cancel() {
      try {
        await reader.cancel();
      } catch {
        // no-op
      }
    },
  });
}
