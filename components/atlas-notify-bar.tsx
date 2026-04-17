"use client";

import { useAtlasLive } from "@/components/atlas-live-context";

export function AtlasNotifyBar() {
  const {
    notifyEnabled,
    setNotifyEnabled,
    requestNotifyPermission,
  } = useAtlasLive();

  async function toggle() {
    if (!notifyEnabled) {
      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "default") {
          const p = await requestNotifyPermission();
          if (p !== "granted") return;
        }
        if (Notification.permission === "granted") {
          setNotifyEnabled(true);
        }
      }
      return;
    }
    setNotifyEnabled(false);
  }

  const canNotify =
    typeof window !== "undefined" && "Notification" in window;

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-dim font-semibold">
          Live updates
        </p>
        <p className="text-[11px] text-dim/90 truncate">
          Browser notifications when ATLAS state changes (background tab only).
        </p>
      </div>
      <button
        type="button"
        disabled={!canNotify}
        onClick={() => void toggle()}
        className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-colors ${
          notifyEnabled
            ? "border-ok/50 text-ok bg-ok/10"
            : "border-border text-dim bg-surface2"
        } disabled:opacity-40`}
      >
        {notifyEnabled ? "On" : "Off"}
      </button>
    </div>
  );
}
