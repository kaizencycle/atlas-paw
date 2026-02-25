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

// Intent annotations — what ATLAS would do about each tripwire state
const intentMap: Record<string, Record<string, string>> = {
  confidence_inflation: {
    pass: "No correction needed",
    watch: "Increasing hedging language in drafts",
    fail: "Pausing autonomous posts — awaiting review",
  },
  engagement_ratio: {
    pass: "Audience response healthy",
    watch: "Considering shorter, more targeted posts",
    fail: "Shifting to comments-only until engagement recovers",
  },
  retraction_avoidance: {
    pass: "Correction record clean",
    watch: "Flagging potential retraction candidates",
    fail: "Issuing corrections — integrity requires it",
  },
  missing_epicon_footer: {
    pass: "All posts properly attributed",
    watch: "Checking recent drafts for footer compliance",
    fail: "Halting posts until footer template is restored",
  },
};

export function TripwireGrid({ tripwires }: TripwireGridProps) {
  return (
    <div className="space-y-2">
      {Object.entries(tripwires).map(([name, status], i) => {
        const intent = intentMap[name]?.[status];
        return (
          <div
            key={name}
            className="px-3 py-2.5 bg-surface2 rounded-lg animate-card-in"
            style={{ animationDelay: `${i * 50}ms` }}
          >
            <div className="flex items-center gap-3">
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
            {intent && (
              <p className="text-[11px] text-dim/80 mt-1.5 ml-[22px] italic leading-snug">
                {intent}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
