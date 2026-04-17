"use client";

import { useAtlasLive } from "@/components/atlas-live-context";

export function ConnectionBadge() {
  const { snapshot } = useAtlasLive();
  const mode = snapshot.mode;

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

  const dotCls =
    mode === "full"
      ? "bg-ok animate-breathe"
      : mode === "readonly"
        ? "bg-warn"
        : "bg-dim";

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotCls}`} />
      {label}
    </span>
  );
}
