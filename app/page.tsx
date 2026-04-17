"use client";

import { useEffect, useState, useCallback } from "react";
import { StatusCard } from "@/components/status-card";
import { TripwireGrid } from "@/components/tripwire-grid";
import { AtlasSays } from "@/components/atlas-says";
import { AtlasNotifyBar } from "@/components/atlas-notify-bar";

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

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-atlas text-2xl animate-breathe">⬡</span>
        <p className="text-dim text-sm">Loading ATLAS state...</p>
      </div>
    );
  }

  if (mode === "readonly" || !state) {
    return (
      <div className="space-y-4">
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-center animate-card-in">
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
      <AtlasNotifyBar />
      {/* ATLAS Says — self-report card */}
      <AtlasSays
        suspended={state.suspended}
        suspensionReason={state.suspension_reason}
        postsToday={state.posts_today}
        commentsToday={state.comments_today}
        postsWithoutEngagement={state.posts_without_engagement}
        recentConfidenceLevels={state.recent_confidence_levels}
      />

      {/* Status + heartbeat */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard label="System Status" variant="atlas">
          {state.suspended ? (
            <>
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-fail/15 text-fail">
                Suspended
              </span>
              <p className="text-xs text-dim mt-1.5">{state.suspension_reason}</p>
              <button
                disabled={acting}
                onClick={resume}
                className="mt-3 w-full py-2 rounded-lg text-xs font-semibold border border-accent text-accent bg-accent/10 active:bg-accent/25 disabled:opacity-50"
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

        <StatusCard label="Last Heartbeat" variant="atlas">
          <p className="text-sm font-mono text-atlas leading-tight">
            {relativeTime(state.last_heartbeat)}
          </p>
          <p className="text-[10px] text-dim mt-1">
            {state.last_heartbeat?.slice(0, 19) || "—"}
          </p>
        </StatusCard>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 gap-3">
        <StatusCard label="Posts Today">
          <p className="text-2xl font-bold text-atlas">
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
        <StatusCard label="Tripwires" variant="atlas">
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

      {/* Quick actions — custodian coral for human-initiated actions */}
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
