"use client";

import { useEffect, useState, useCallback } from "react";
import { StatusCard } from "@/components/status-card";
import { TripwireGrid } from "@/components/tripwire-grid";

interface AtlasState {
  suspended: boolean;
  suspension_reason: string | null;
  last_heartbeat: string | null;
  posts_today: number;
  comments_today: number;
  recent_confidence_levels: string[];
  posts_without_engagement: number;
}

type TripwireMap = Record<string, string>;

function computeTripwires(s: AtlasState): TripwireMap {
  const window = (s.recent_confidence_levels || []).slice(-20);
  let ci = "pass";
  if (window.length >= 10) {
    const highRatio = window.filter((c) => c === "high").length / window.length;
    if (highRatio > 0.5) ci = "fail";
    else if (highRatio > 0.4) ci = "watch";
  }

  let er = "pass";
  if (s.posts_without_engagement >= 3) er = "fail";
  else if (s.posts_without_engagement === 2) er = "watch";

  return {
    confidence_inflation: ci,
    engagement_ratio: er,
    retraction_avoidance: "pass",
    missing_epicon_footer: "pass",
  };
}

export default function DashboardPage() {
  const [state, setState] = useState<AtlasState | null>(null);
  const [mode, setMode] = useState<"full" | "readonly" | "checking">("checking");
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const hRes = await fetch("/api/health");
      const hData = await hRes.json();
      setMode(hData.mode);

      if (hData.mode === "full") {
        const sRes = await fetch("/api/openclaw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "state" }),
        });
        const sData = await sRes.json();
        setState(sData.result);
      } else {
        setState(null);
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

  async function triggerHeartbeat() {
    setActing(true);
    await fetch("/api/openclaw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "heartbeat" }),
    });
    setActing(false);
    refresh();
  }

  async function resume() {
    setActing(true);
    await fetch("/api/openclaw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    });
    setActing(false);
    refresh();
  }

  const tripwires = state ? computeTripwires(state) : null;
  const confDist = state
    ? {
        low: state.recent_confidence_levels.filter((c) => c === "low").length,
        medium: state.recent_confidence_levels.filter((c) => c === "medium").length,
        high: state.recent_confidence_levels.filter((c) => c === "high").length,
      }
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-dim text-sm">
        Loading ATLAS state...
      </div>
    );
  }

  if (mode === "readonly" || !state) {
    return (
      <div className="space-y-4">
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-center">
          <p className="text-warn text-sm font-semibold">Read-Only Mode</p>
          <p className="text-dim text-xs mt-1">
            Gateway offline. Local state unavailable. Showing Moltbook data
            only.
          </p>
        </div>
        <StatusCard label="Moltbook Agent">
          <p className="text-sm text-dim">
            Connect your PC and start OpenClaw + cloudflared to enable full
            control.
          </p>
        </StatusCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status + heartbeat */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard label="System Status">
          {state.suspended ? (
            <>
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-fail/15 text-fail">
                Suspended
              </span>
              <p className="text-xs text-dim mt-1.5">{state.suspension_reason}</p>
              <button
                disabled={acting}
                onClick={resume}
                className="mt-3 w-full py-2 rounded-lg text-xs font-semibold border border-info text-info bg-info/10 active:bg-info/25 disabled:opacity-50"
              >
                Resume
              </button>
            </>
          ) : (
            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-ok/15 text-ok">
              Active
            </span>
          )}
        </StatusCard>

        <StatusCard label="Last Heartbeat">
          <p className="text-sm font-mono text-info leading-tight">
            {state.last_heartbeat?.slice(0, 19) || "Never"}
          </p>
        </StatusCard>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard label="Posts Today">
          <p className="text-2xl font-bold text-accent">
            {state.posts_today}
          </p>
        </StatusCard>
        <StatusCard label="Comments Today">
          <p className="text-2xl font-bold text-accent2">
            {state.comments_today}
          </p>
        </StatusCard>
      </div>

      {/* Tripwires */}
      {tripwires && (
        <StatusCard label="Tripwires">
          <TripwireGrid tripwires={tripwires} />
        </StatusCard>
      )}

      {/* Confidence */}
      {confDist && (
        <StatusCard label="Confidence Distribution">
          <div className="flex gap-6">
            {(["low", "medium", "high"] as const).map((level) => (
              <div key={level} className="text-center">
                <p
                  className={`text-xl font-bold ${
                    level === "low"
                      ? "text-ok"
                      : level === "medium"
                        ? "text-warn"
                        : "text-fail"
                  }`}
                >
                  {confDist[level]}
                </p>
                <p className="text-[10px] text-dim uppercase">{level}</p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-dim mt-2">
            {state.recent_confidence_levels.length} samples
          </p>
        </StatusCard>
      )}

      {/* Quick actions */}
      <button
        disabled={acting}
        onClick={triggerHeartbeat}
        className="w-full py-3 rounded-xl text-sm font-semibold border border-accent text-accent bg-accent/10 active:bg-accent/25 disabled:opacity-50 transition-colors"
      >
        {acting ? "Running..." : "Trigger Heartbeat"}
      </button>
    </div>
  );
}
