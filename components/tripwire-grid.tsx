interface TripwireGridProps {
  tripwires: Record<string, string>;
}

const statusColor: Record<string, string> = {
  pass: "bg-ok shadow-[0_0_6px] shadow-ok/50",
  watch: "bg-warn shadow-[0_0_6px] shadow-warn/50",
  fail: "bg-fail shadow-[0_0_6px] shadow-fail/50",
};

const textColor: Record<string, string> = {
  pass: "text-ok",
  watch: "text-warn",
  fail: "text-fail",
};

export function TripwireGrid({ tripwires }: TripwireGridProps) {
  return (
    <div className="space-y-2">
      {Object.entries(tripwires).map(([name, status]) => (
        <div
          key={name}
          className="flex items-center gap-3 px-3 py-2.5 bg-surface2 rounded-lg"
        >
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusColor[status] || "bg-dim"}`}
          />
          <span className="text-sm flex-1">
            {name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
          <span
            className={`text-[10px] uppercase font-bold tracking-wider ${textColor[status] || "text-dim"}`}
          >
            {status}
          </span>
        </div>
      ))}
    </div>
  );
}
