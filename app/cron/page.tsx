"use client";

import { useEffect, useState, useCallback } from "react";
import { StatusCard } from "@/components/status-card";

interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: { kind: string; expr?: string; tz?: string };
  state?: { nextRunAtMs?: number };
}

function timeUntil(ms: number): string {
  const diff = ms - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [mode, setMode] = useState<"full" | "readonly">("readonly");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

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
          body: JSON.stringify({ action: "cron.list" }),
        });
        const data = await res.json();
        const result = data.result;
        const list = Array.isArray(result)
          ? result
          : Array.isArray(result?.jobs)
            ? result.jobs
            : [];
        setJobs(list);
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

  async function runJob(jobId: string) {
    setRunning(jobId);
    await fetch("/api/openclaw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cron.run", params: { jobId } }),
    });
    setRunning(null);
    refresh();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-dim text-sm">
        Loading cron jobs...
      </div>
    );
  }

  if (mode === "readonly") {
    return (
      <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-center">
        <p className="text-warn text-sm font-semibold">Gateway Offline</p>
        <p className="text-dim text-xs mt-1">
          Cron management requires a live OpenClaw connection.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xs uppercase tracking-widest text-dim font-semibold">
        Scheduled Jobs ({jobs.length})
      </h2>

      {jobs.length === 0 ? (
        <div className="text-center py-12 text-dim text-sm italic">
          No cron jobs configured.
        </div>
      ) : (
        jobs.map((job) => (
          <StatusCard key={job.id} label={job.name}>
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-xs font-mono text-dim truncate">
                  {job.schedule.expr || job.schedule.kind}
                  {job.schedule.tz && (
                    <span className="text-dim/60"> @ {job.schedule.tz}</span>
                  )}
                </p>
                {job.state?.nextRunAtMs && (
                  <p className="text-xs text-info">
                    Next: {timeUntil(job.state.nextRunAtMs)}
                  </p>
                )}
              </div>
              <button
                disabled={running === job.id}
                onClick={() => runJob(job.id)}
                className="flex-shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-accent text-accent bg-accent/10 active:bg-accent/25 disabled:opacity-50"
              >
                {running === job.id ? "..." : "Run"}
              </button>
            </div>
          </StatusCard>
        ))
      )}
    </div>
  );
}
