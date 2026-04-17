"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAtlasLive } from "@/components/atlas-live-context";

type Role = "user" | "assistant";

type StoredMsg = { role: Role; content: string; at: string };

const LS_THREAD = "atlas-paw-chat-thread-v1";
const LS_MODEL = "atlas-paw-chat-model-v1";

function loadThread(): StoredMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LS_THREAD);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p
      .filter(
        (m): m is StoredMsg =>
          m &&
          typeof m === "object" &&
          (m as StoredMsg).role !== undefined &&
          ((m as StoredMsg).role === "user" || (m as StoredMsg).role === "assistant") &&
          typeof (m as StoredMsg).content === "string"
      )
      .map((m) => ({
        role: m.role,
        content: m.content.slice(0, 12000),
        at: typeof m.at === "string" ? m.at : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function saveThread(messages: StoredMsg[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_THREAD, JSON.stringify(messages.slice(-80)));
}

function loadModel(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LS_MODEL) || "";
}

function saveModel(m: string) {
  if (typeof window === "undefined") return;
  if (m.trim()) window.localStorage.setItem(LS_MODEL, m.trim());
  else window.localStorage.removeItem(LS_MODEL);
}

export default function ChatPage() {
  const { snapshot, refresh } = useAtlasLive();
  const [messages, setMessages] = useState<StoredMsg[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages(loadThread());
    setModel(loadModel());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    const userMsg: StoredMsg = {
      role: "user",
      content: text,
      at: new Date().toISOString(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    saveThread(next);
    setInput("");
    setSending(true);

    const apiMessages = next.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: apiMessages,
          model: model.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { reply?: string; error?: string };
      if (!res.ok) {
        throw new Error(data.error || res.statusText);
      }
      const assistant: StoredMsg = {
        role: "assistant",
        content: data.reply || "(empty)",
        at: new Date().toISOString(),
      };
      const withReply = [...next, assistant];
      setMessages(withReply);
      saveThread(withReply);
      void refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setSending(false);
    }
  }, [input, messages, model, refresh, sending]);

  function clearThread() {
    setMessages([]);
    saveThread([]);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-3 min-h-[calc(100dvh-8rem)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xs uppercase tracking-widest text-atlas font-semibold">
            Chat with ATLAS
          </h2>
          <p className="text-[11px] text-dim mt-0.5">
            Model-agnostic: set provider URL and key on the server. Optional
            model override below.
          </p>
        </div>
        <button
          type="button"
          onClick={clearThread}
          className="text-[10px] font-semibold uppercase tracking-wider text-dim border border-border rounded-md px-2 py-1"
        >
          Clear
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] uppercase tracking-wider text-dim font-semibold">
          Model override (optional)
        </span>
        <input
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            saveModel(e.target.value);
          }}
          placeholder="e.g. gpt-4o-mini, llama-3.3-70b-versatile, anthropic/claude-3.5-sonnet"
          className="w-full rounded-lg border border-border bg-surface2 px-3 py-2 text-xs font-mono text-text placeholder:text-dim/50"
        />
      </label>

      <div className="flex-1 min-h-[280px] max-h-[55dvh] overflow-y-auto rounded-xl border border-border bg-surface p-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-dim text-center py-8">
            Say hello. Each reply uses your latest PAW snapshot (heartbeat,
            suspension, audit tail) on the server.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={`${m.at}-${i}`}
            className={`rounded-lg px-3 py-2 text-sm leading-relaxed ${
              m.role === "user"
                ? "bg-accent/10 border border-accent/25 ml-4"
                : "bg-atlas/8 border border-atlas/20 mr-4"
            }`}
          >
            <span className="text-[9px] uppercase tracking-wider text-dim font-bold">
              {m.role === "user" ? "You" : "ATLAS"}
            </span>
            <p className="whitespace-pre-wrap mt-1">{m.content}</p>
          </div>
        ))}
        {sending && (
          <p className="text-xs text-dim animate-pulse">ATLAS is thinking…</p>
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <div className="text-xs text-fail border border-fail/30 bg-fail/10 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Message ATLAS…"
          className="flex-1 rounded-xl border border-border bg-surface2 px-3 py-2.5 text-sm"
        />
        <button
          type="button"
          disabled={sending || !input.trim()}
          onClick={() => void send()}
          className="px-4 rounded-xl text-sm font-semibold bg-atlas text-bg disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
