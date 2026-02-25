interface ConfidenceMeterProps {
  level: string; // "low" | "medium" | "high"
}

const config: Record<string, { color: string; bg: string; width: string; label: string }> = {
  low: {
    color: "bg-ok",
    bg: "bg-ok/10",
    width: "w-1/4",
    label: "Low confidence — deferring appropriately",
  },
  medium: {
    color: "bg-warn",
    bg: "bg-warn/10",
    width: "w-2/4",
    label: "Medium confidence",
  },
  high: {
    color: "bg-fail",
    bg: "bg-fail/10",
    width: "w-3/4",
    label: "High confidence — review closely",
  },
};

export function ConfidenceMeter({ level }: ConfidenceMeterProps) {
  const c = config[level] || config.medium;

  return (
    <div className="space-y-1">
      <div className={`h-1 rounded-full ${c.bg} overflow-hidden`}>
        <div className={`h-full rounded-full ${c.color} ${c.width} transition-all duration-500`} />
      </div>
      <p className="text-[10px] text-dim/70">{c.label}</p>
    </div>
  );
}
