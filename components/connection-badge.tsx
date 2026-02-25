"use client";

import { useEffect, useState } from "react";
import type { ConnectionMode } from "@/lib/connection";

export function ConnectionBadge() {
  const [mode, setMode] = useState<ConnectionMode>("checking");

  useEffect(() => {
    let mounted = true;
    async function check() {
      try {
        const res = await fetch("/api/health");
        const data = await res.json();
        if (mounted) setMode(data.mode);
      } catch {
        if (mounted) setMode("readonly");
      }
    }
    check();
    const id = setInterval(check, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const label =
    mode === "full"
      ? "Full Control"
      : mode === "readonly"
        ? "Read-Only"
        : "Checking...";

  const cls =
    mode === "full"
      ? "bg-ok/15 text-ok border-ok/40"
      : mode === "readonly"
        ? "bg-warn/15 text-warn border-warn/40"
        : "bg-dim/15 text-dim border-dim/40";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${cls}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${mode === "full" ? "bg-ok" : mode === "readonly" ? "bg-warn" : "bg-dim"} ${mode === "full" ? "animate-pulse" : ""}`}
      />
      {label}
    </span>
  );
}
