"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AtlasAuditEntry,
  AtlasLastSeen,
  AtlasLiveSnapshot,
  AtlasLiveState,
} from "@/lib/atlas-types";

export type { AtlasAuditEntry, AtlasLiveSnapshot, AtlasLiveState } from "@/lib/atlas-types";

const LS_NOTIFY = "atlas-paw-notify-enabled";

function loadNotifyPref(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LS_NOTIFY) === "1";
}

function saveNotifyPref(on: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_NOTIFY, on ? "1" : "0");
}

function fingerprint(s: AtlasLiveSnapshot): string {
  const st = s.state ?? s.lastSeen?.state ?? null;
  const tail =
    s.auditTail[0] ?? s.lastSeen?.auditTail?.[0] ?? undefined;
  return JSON.stringify({
    mode: s.mode,
    hb: st?.last_heartbeat ?? null,
    sus: st?.suspended ?? null,
    sr: st?.suspension_reason ?? null,
    pt: st?.posts_today ?? null,
    ct: st?.comments_today ?? null,
    pwe: st?.posts_without_engagement ?? null,
    audit: tail ? `${tail.timestamp}|${tail.action}` : "",
    lsAt: s.lastSeen?.at ?? null,
  });
}

function summarizeChange(prev: string, next: string): string | null {
  if (prev === next || !prev) return null;
  try {
    const a = JSON.parse(prev) as Record<string, unknown>;
    const b = JSON.parse(next) as Record<string, unknown>;
    const parts: string[] = [];
    if (a.mode !== b.mode) parts.push(`Mode: ${String(b.mode)}`);
    if (a.hb !== b.hb) parts.push("Heartbeat updated");
    if (a.sus !== b.sus) parts.push(b.sus ? "ATLAS suspended" : "ATLAS active");
    if (a.sr !== b.sr && b.sr) parts.push(`Reason: ${String(b.sr)}`);
    if (a.pt !== b.pt) parts.push(`Posts today: ${String(b.pt)}`);
    if (a.ct !== b.ct) parts.push(`Comments today: ${String(b.ct)}`);
    if (a.pwe !== b.pwe) parts.push(`Posts w/o engagement: ${String(b.pwe)}`);
    if (a.audit !== b.audit && typeof b.audit === "string" && b.audit) {
      parts.push(`Audit: ${b.audit.split("|")[1] || "new entry"}`);
    }
    return parts.length ? parts.join(" · ") : "ATLAS signal updated";
  } catch {
    return "ATLAS signal updated";
  }
}

export function useAtlasLiveSignals(options: {
  pollMs?: number;
  pollReadonlyMs?: number;
}) {
  const pollMs = options.pollMs ?? 12_000;
  const pollReadonlyMs = options.pollReadonlyMs ?? 20_000;

  const [snapshot, setSnapshot] = useState<AtlasLiveSnapshot>({
    mode: "checking",
    state: null,
    auditTail: [],
    checkedAt: new Date().toISOString(),
    lastSeen: null,
  });
  const [notifyEnabled, setNotifyEnabledState] = useState(false);
  const prevFp = useRef<string>("");
  const notifyRef = useRef(notifyEnabled);

  useEffect(() => {
    notifyRef.current = notifyEnabled;
  }, [notifyEnabled]);

  const setNotifyEnabled = useCallback((on: boolean) => {
    setNotifyEnabledState(on);
    saveNotifyPref(on);
  }, []);

  useEffect(() => {
    setNotifyEnabledState(loadNotifyPref());
  }, []);

  const refresh = useCallback(async () => {
    const checkedAt = new Date().toISOString();
    try {
      const hRes = await fetch("/api/health");
      const hData = (await hRes.json()) as { mode?: string };
      const mode =
        hData.mode === "full"
          ? "full"
          : hData.mode === "readonly"
            ? "readonly"
            : "checking";

      if (mode !== "full") {
        let lastSeen: AtlasLastSeen | null = null;
        try {
          const lsRes = await fetch("/api/last-seen");
          if (lsRes.ok) {
            const lsData = (await lsRes.json()) as { lastSeen?: AtlasLastSeen | null };
            lastSeen = lsData.lastSeen ?? null;
          }
        } catch {
          lastSeen = null;
        }
        const next: AtlasLiveSnapshot = {
          mode,
          state: null,
          auditTail: [],
          checkedAt,
          lastSeen,
        };
        const fp = fingerprint(next);
        const delta =
          prevFp.current && notifyRef.current
            ? summarizeChange(prevFp.current, fp)
            : null;
        if (
          delta &&
          typeof window !== "undefined" &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          document.visibilityState === "hidden"
        ) {
          new Notification("ATLAS", { body: delta, tag: "atlas-paw" });
        }
        prevFp.current = fp;
        setSnapshot(next);
        return;
      }

      const [sRes, aRes] = await Promise.all([
        fetch("/api/openclaw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "state" }),
        }),
        fetch("/api/openclaw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "audit" }),
        }),
      ]);
      const sJson = (await sRes.json()) as {
        result?: AtlasLiveState;
        lastSeen?: AtlasLastSeen | null;
        error?: string;
      };
      const aJson = (await aRes.json()) as {
        result?: AtlasAuditEntry[];
        lastSeen?: AtlasLastSeen | null;
        error?: string;
      };

      const state =
        sJson.result && typeof sJson.result === "object" ? sJson.result : null;
      const auditRaw = Array.isArray(aJson.result) ? aJson.result : [];
      const auditTail = auditRaw
        .slice()
        .sort((x, y) => (y.timestamp || "").localeCompare(x.timestamp || ""))
        .slice(0, 5);

      const next: AtlasLiveSnapshot = {
        mode: "full",
        state,
        auditTail,
        checkedAt,
        lastSeen: sJson.lastSeen ?? aJson.lastSeen ?? null,
      };
      const fp = fingerprint(next);
      const delta =
        prevFp.current && notifyRef.current
          ? summarizeChange(prevFp.current, fp)
          : null;
      if (
        delta &&
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted" &&
        document.visibilityState === "hidden"
      ) {
        new Notification("ATLAS", { body: delta, tag: "atlas-paw" });
      }
      prevFp.current = fp;
      setSnapshot(next);
    } catch {
      setSnapshot({
        mode: "readonly",
        state: null,
        auditTail: [],
        checkedAt,
        lastSeen: null,
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const ms = snapshot.mode === "full" ? pollMs : pollReadonlyMs;
    let id: number | null = null;

    const start = () => {
      if (id !== null) return;
      id = window.setInterval(() => void refresh(), ms);
    };
    const stop = () => {
      if (id === null) return;
      window.clearInterval(id);
      id = null;
    };

    const onVis = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    if (typeof document !== "undefined") {
      if (document.visibilityState === "visible") start();
      document.addEventListener("visibilitychange", onVis);
    } else {
      start();
    }

    return () => {
      stop();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVis);
      }
    };
  }, [snapshot.mode, pollMs, pollReadonlyMs, refresh]);

  const requestNotifyPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "unsupported" as const;
    }
    return Notification.requestPermission();
  }, []);

  return {
    snapshot,
    refresh,
    notifyEnabled,
    setNotifyEnabled,
    requestNotifyPermission,
  };
}
