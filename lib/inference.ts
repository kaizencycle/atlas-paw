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
