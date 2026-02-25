"use client";

import { useEffect, useState, useCallback } from "react";

interface AuditEntry {
  timestamp: string;
  action: string;
  details: Record<string, unknown>;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [mode, setMode] = useState<"full" | "readonly">("readonly");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-dim text-sm">
        Loading audit log...
      </div>
    );
  }

  if (mode === "readonly") {
    return (
      <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-center">
        <p className="text-warn text-sm font-semibold">Gateway Offline</p>
        <p className="text-dim text-xs mt-1">
          Audit log requires a live OpenClaw connection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-xs uppercase tracking-widest text-dim font-semibold">
        Audit Log ({entries.length} entries)
      </h2>

      {entries.length === 0 ? (
        <div className="text-center py-12 text-dim text-sm italic">
          No audit entries found.
        </div>
      ) : (
        entries.map((e, i) => (
          <button
            key={i}
            onClick={() => setExpanded(expanded === i ? null : i)}
            className="w-full text-left bg-surface border border-border rounded-lg px-4 py-3 transition-colors active:bg-surface2"
          >
            <div className="flex items-center gap-3">
              <code className="text-xs text-accent font-semibold flex-shrink-0">
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
        ))
      )}
    </div>
  );
}
