"use client";

import { useEffect, useState, useCallback, useMemo } from "react";

interface AuditEntry {
  timestamp: string;
  action: string;
  details: Record<string, unknown>;
}

// Categorize audit actions into human-readable groups
function categorize(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("post") || a.includes("publish")) return "posts";
  if (a.includes("comment") || a.includes("reply")) return "comments";
  if (a.includes("suspend") || a.includes("resume") || a.includes("tripwire")) return "governance";
  if (a.includes("heartbeat") || a.includes("health") || a.includes("cron")) return "system";
  if (a.includes("draft") || a.includes("approve") || a.includes("reject")) return "drafts";
  return "other";
}

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "posts", label: "Posts" },
  { key: "comments", label: "Comments" },
  { key: "drafts", label: "Drafts" },
  { key: "governance", label: "Gov" },
  { key: "system", label: "System" },
] as const;

type FilterKey = (typeof FILTER_TABS)[number]["key"];

// Summarize details into a compact one-liner
function summarizeDetails(details: Record<string, unknown>): string {
  if (!details || Object.keys(details).length === 0) return "";
  const pick =
    details.title ||
    details.post_title ||
    details.target ||
    details.reason ||
    details.status ||
    details.message;
  if (pick) return String(pick).slice(0, 80);
  const entries = Object.entries(details);
  if (entries.length === 0) return "";
  const [k, v] = entries[0];
  return `${k}: ${String(v).slice(0, 60)}`;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [mode, setMode] = useState<"full" | "readonly">("readonly");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [compact, setCompact] = useState(false);

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
          body: JSON.stringify({ action: "audit" }),
        });
        const data = await res.json();
        const list = Array.isArray(data.result) ? data.result : [];
        list.sort((a: AuditEntry, b: AuditEntry) =>
          (b.timestamp || "").localeCompare(a.timestamp || "")
        );
        setEntries(list);
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

  // Compute category counts for filter badges
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) {
      const cat = categorize(e.action);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [entries]);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => categorize(e.action) === filter);
  }, [entries, filter]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-atlas text-2xl animate-breathe">⬡</span>
        <p className="text-dim text-sm">Loading audit log...</p>
      </div>
    );
  }

  if (mode === "readonly") {
    return (
      <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-center animate-card-in">
        <p className="text-warn text-sm font-semibold">Gateway Offline</p>
        <p className="text-dim text-xs mt-1">
          Audit log requires a live OpenClaw connection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with compact toggle */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-dim font-semibold">
          Audit Log (
          {filtered.length}
          {filter !== "all" ? ` / ${entries.length}` : ""})
        </h2>
        <button
          onClick={() => {
            setCompact(!compact);
            setExpanded(null);
          }}
          className={`text-[10px] px-2 py-1 rounded-md font-semibold uppercase tracking-wider border transition-colors ${
            compact
              ? "border-atlas/30 text-atlas bg-atlas/10"
              : "border-border text-dim bg-surface"
          }`}
        >
          {compact ? "Compact" : "Detailed"}
        </button>
      </div>

      {/* Filter tabs — scrollable on mobile */}
      <div className="flex gap-1 bg-surface border border-border rounded-lg p-1 overflow-x-auto no-scrollbar">
        {FILTER_TABS.map((t) => {
          const count =
            t.key === "all"
              ? entries.length
              : categoryCounts[t.key] || 0;
          return (
            <button
              key={t.key}
              onClick={() => {
                setFilter(t.key);
                setExpanded(null);
              }}
              className={`flex-shrink-0 px-2.5 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                filter === t.key
                  ? "bg-atlas/15 text-atlas"
                  : "text-dim hover:text-text"
              }`}
            >
              {t.label}
              {count > 0 && (
                <span className="ml-1 opacity-60">{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Entries */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-dim text-sm italic animate-card-in">
          {filter === "all"
            ? "No audit entries found."
            : `No ${filter} entries.`}
        </div>
      ) : compact ? (
        /* Compact timeline mode */
        <div className="bg-surface border border-border rounded-xl overflow-hidden animate-card-in">
          {filtered.map((e, i) => {
            const summary = summarizeDetails(e.details);
            const isExpanded = expanded === i;
            return (
              <div key={i}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : i)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${
                    isExpanded
                      ? "bg-surface2"
                      : "hover:bg-surface2/50"
                  } ${i > 0 ? "border-t border-border/50" : ""}`}
                >
                  <span className="text-[10px] text-dim font-mono flex-shrink-0 w-[52px]">
                    {e.timestamp?.slice(11, 19) || "—"}
                  </span>
                  <code className="text-[11px] text-atlas font-semibold flex-shrink-0 max-w-[120px] truncate">
                    {e.action}
                  </code>
                  {summary && (
                    <span className="text-[10px] text-dim/70 truncate flex-1 min-w-0">
                      {summary}
                    </span>
                  )}
                </button>
                {isExpanded && (
                  <div className="px-3 pb-2">
                    <pre className="text-[10px] text-dim bg-bg border border-border rounded p-2 whitespace-pre-wrap break-all max-h-36 overflow-y-auto">
                      {JSON.stringify(e.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Detailed mode (default) */
        <div className="space-y-2">
          {filtered.map((e, i) => (
            <button
              key={i}
              onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full text-left bg-surface border border-border rounded-lg px-4 py-3 transition-colors active:bg-surface2 animate-card-in"
              style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}
            >
              <div className="flex items-center gap-3">
                <code className="text-xs text-atlas font-semibold flex-shrink-0">
                  {e.action}
                </code>
                <span className="text-[10px] text-dim ml-auto whitespace-nowrap">
                  {e.timestamp?.slice(0, 19)}
                </span>
              </div>
              {expanded === i && (
                <pre className="mt-2 text-[11px] text-dim bg-bg border border-border rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                  {JSON.stringify(e.details, null, 2)}
                </pre>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
