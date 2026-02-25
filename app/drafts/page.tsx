"use client";

import { useEffect, useState, useCallback } from "react";
import { DraftCard } from "@/components/draft-card";

interface Draft {
  id: string;
  created_at: string;
  draft_type: string;
  target_post_title?: string;
  target_author?: string;
  prompt_context: string;
  drafted_content: string;
  status: string;
  meta: Record<string, unknown>;
}

export default function DraftsPage() {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [mode, setMode] = useState<"full" | "readonly">("readonly");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "all">("pending");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const hRes = await fetch("/api/health");
      const hData = await hRes.json();
      setMode(hData.mode);

      if (hData.mode === "full") {
        const res = await fetch("/api/openclaw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "drafts" }),
        });
        const data = await res.json();
        const list = Array.isArray(data.result) ? data.result : [];
        list.sort(
          (a: Draft, b: Draft) =>
            (b.created_at || "").localeCompare(a.created_at || "")
        );
        setDrafts(list);
      }
    } catch {
      setMode("readonly");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleAction(
    id: string,
    action: "approve" | "reject",
    editedContent?: string
  ) {
    await fetch("/api/openclaw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        params: {
          draftId: id,
          ...(editedContent ? { editedContent } : {}),
        },
      }),
    });
    refresh();
  }

  const pendingCount = drafts.filter((d) => d.status === "pending").length;
  const filtered =
    tab === "pending" ? drafts.filter((d) => d.status === "pending") : drafts;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-atlas text-2xl animate-breathe">⬡</span>
        <p className="text-dim text-sm">Loading drafts...</p>
      </div>
    );
  }

  if (mode === "readonly") {
    return (
      <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-center animate-card-in">
        <p className="text-warn text-sm font-semibold">Gateway Offline</p>
        <p className="text-dim text-xs mt-1">
          Draft management requires a live OpenClaw connection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab selector */}
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1">
        {(["pending", "all"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors ${
              tab === t
                ? "bg-atlas/15 text-atlas"
                : "text-dim hover:text-text"
            }`}
          >
            {t === "pending"
              ? `Pending (${pendingCount})`
              : `All (${drafts.length})`}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-dim text-sm italic animate-card-in">
          {tab === "pending" ? "No pending drafts." : "No drafts yet."}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d, i) => (
            <div
              key={d.id}
              className="animate-card-in"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <DraftCard
                draft={d}
                canAct={mode === "full"}
                onAction={handleAction}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
