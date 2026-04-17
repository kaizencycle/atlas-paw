import type { AtlasAuditEntry, AtlasLiveState } from "@/lib/atlas-types";

export type AtlasChatContextPayload = {
  mode: string;
  state: AtlasLiveState | null;
  auditTail: AtlasAuditEntry[];
};

export function buildAtlasSystemPrompt(ctx: AtlasChatContextPayload): string {
  const lines: string[] = [
    "You are ATLAS, the Mobius sentinel agent for monitoring, calibration, and integrity-aware communication with your operator.",
    "You speak clearly and briefly on mobile. You acknowledge uncertainty. You never fabricate live metrics: only use the context block below for current numbers.",
    "When the operator asks about tripwires, governance, or system health, ground answers in the context. If context is missing or gateway is offline, say so.",
  ];

  lines.push("", "## Live context (from PAW)", `Gateway mode: ${ctx.mode}`);

  if (ctx.state) {
    const s = ctx.state;
    lines.push(
      `Suspended: ${s.suspended}${s.suspension_reason ? ` — ${s.suspension_reason}` : ""}`,
      `Last heartbeat: ${s.last_heartbeat ?? "unknown"}`,
      `Posts today: ${s.posts_today}, comments today: ${s.comments_today}`,
      `Posts without engagement: ${s.posts_without_engagement}`,
      `Recent confidence (last up to 20): ${(s.recent_confidence_levels || []).join(", ") || "none recorded"}`
    );
  } else {
    lines.push("No live state loaded (readonly or gateway offline).");
  }

  if (ctx.auditTail.length) {
    lines.push("", "Recent audit tail:");
    for (const e of ctx.auditTail) {
      lines.push(`- ${e.timestamp} ${e.action}`);
    }
  }

  return lines.join("\n");
}
