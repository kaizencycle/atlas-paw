"use client";

import { useCallback, useState } from "react";
import { StatusCard } from "@/components/status-card";
import { TripwireGrid } from "@/components/tripwire-grid";
import { AtlasSays } from "@/components/atlas-says";
import { AtlasNotifyBar } from "@/components/atlas-notify-bar";
import { useAtlasLive } from "@/components/atlas-live-context";
import type { AtlasLiveState } from "@/lib/atlas-types";

type TripwireMap = Record<string, string>;

function computeTripwires(s: AtlasLiveState): TripwireMap {
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
  const { snapshot, refresh } = useAtlasLive();
  const [acting, setActing] = useState(false);

  const mode = snapshot.mode;
  const state = snapshot.state;
  const lastSeen = snapshot.lastSeen ?? null;
  const effectiveState = state ?? lastSeen?.state ?? null;
  const isLive = mode === "full" && state !== null;
  const isStale = !isLive && effectiveState !== null;

  const triggerHeartbeat = useCallback(async () => {
    setActing(true);
    await fetch("/api/openclaw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "heartbeat" }),
    });
    setActing(false);
    void refresh();
  }, [refresh]);

  const resume = useCallback(async () => {
    setActing(true);
    await fetch("/api/openclaw", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    });
    setActing(false);
    void refresh();
  }, [refresh]);

  if (mode === "checking") {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <span className="text-atlas text-2xl animate-breathe">⬡</span>
        <p className="text-dim text-sm">Loading ATLAS state...</p>
      </div>
    );
  }

  if (!effectiveState) {
    return (
      <div className="space-y-4">
        <AtlasNotifyBar />
        <div className="bg-warn/10 border border-warn/30 rounded-xl p-4 text-center animate-card-in">
          <p className="text-warn text-sm font-semibold">Gateway quiet</p>
          <p className="text-dim text-xs mt-1">
            No live state and no cached last-seen. Start OpenClaw + cloudflared
            on your PC, or wait for the next heartbeat.
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

  const tripwires = computeTripwires(effectiveState);
  const confDist = {
    low: effectiveState.recent_confidence_levels.filter((c) => c === "low").length,
    medium: effectiveState.recent_confidence_levels.filter((c) => c === "medium")
      .length,
    high: effectiveState.recent_confidence_levels.filter((c) => c === "high")
      .length,
  };

  return (
    <div className="space-y-4">
      <AtlasNotifyBar />

      {isStale && lastSeen && (
        <div className="bg-surface/60 border border-border/60 rounded-lg px-3 py-2 text-[11px] text-dim text-center">
          Showing last seen {relativeTime(lastSeen.at)} · PC offline
        </div>
      )}

      <AtlasSays
        suspended={effectiveState.suspended}
        suspensionReason={effectiveState.suspension_reason}
        postsToday={effectiveState.posts_today}
        commentsToday={effectiveState.comments_today}
        postsWithoutEngagement={effectiveState.posts_without_engagement}
        recentConfidenceLevels={effectiveState.recent_confidence_levels}
      />

      <div className="grid grid-cols-2 gap-3">
        <StatusCard label="System Status" variant="atlas">
          {effectiveState.suspended ? (
            <>
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-fail/15 text-fail">
                Suspended
              </span>
              <p className="text-xs text-dim mt-1.5">
                {effectiveState.suspension_reason}
              </p>
              {isLive && (
                <button
                  disabled={acting}
                  onClick={resume}
                  className="mt-3 w-full py-2 rounded-lg text-xs font-semibold border border-accent text-accent bg-accent/10 active:bg-accent/25 disabled:opacity-50"
                >
                  Resume
                </button>
              )}
            </>
          ) : (
            <span
              className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold uppercase ${
                isLive ? "bg-ok/15 text-ok" : "bg-dim/15 text-dim"
              }`}
            >
              {isLive ? "Active" : "Last Active"}
            </span>
          )}
        </StatusCard>

        <StatusCard label="Last Heartbeat" variant="atlas">
          <p className="text-sm font-mono text-atlas leading-tight">
            {relativeTime(effectiveState.last_heartbeat)}
          </p>
          <p className="text-[10px] text-dim mt-1">
            {effectiveState.last_heartbeat?.slice(0, 19) || "—"}
          </p>
        </StatusCard>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatusCard label="Posts Today">
          <p className="text-2xl font-bold text-atlas">
            {effectiveState.posts_today}
          </p>
        </StatusCard>
        <StatusCard label="Comments Today">
          <p className="text-2xl font-bold text-accent2">
            {effectiveState.comments_today}
          </p>
        </StatusCard>
      </div>

      <StatusCard label="Tripwires" variant="atlas">
        <TripwireGrid tripwires={tripwires} />
      </StatusCard>

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
          {effectiveState.recent_confidence_levels.length} samples
        </p>
      </StatusCard>

      {isLive && (
        <button
          disabled={acting}
          onClick={triggerHeartbeat}
          className="w-full py-3 rounded-xl text-sm font-semibold border border-accent text-accent bg-accent/10 active:bg-accent/25 disabled:opacity-50 transition-colors"
        >
          {acting ? "Running..." : "Trigger Heartbeat"}
        </button>
      )}
    </div>
  );
}
