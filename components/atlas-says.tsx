interface AtlasSaysProps {
  suspended: boolean;
  suspensionReason: string | null;
  postsToday: number;
  commentsToday: number;
  postsWithoutEngagement: number;
  recentConfidenceLevels: string[];
}

function generateSelfReport(props: AtlasSaysProps): string {
  const {
    suspended,
    suspensionReason,
    postsToday,
    commentsToday,
    postsWithoutEngagement,
    recentConfidenceLevels,
  } = props;

  if (suspended) {
    return `I'm currently suspended${suspensionReason ? ` — ${suspensionReason}` : ""}. Standing by for your review.`;
  }

  const parts: string[] = [];

  // Activity assessment
  const totalActivity = postsToday + commentsToday;
  if (totalActivity === 0) {
    parts.push("Quiet day so far — no posts or comments yet.");
  } else if (totalActivity <= 3) {
    parts.push(
      `Light day. ${postsToday} post${postsToday !== 1 ? "s" : ""}, ${commentsToday} comment${commentsToday !== 1 ? "s" : ""}.`
    );
  } else {
    parts.push(
      `Active day — ${postsToday} post${postsToday !== 1 ? "s" : ""} and ${commentsToday} comment${commentsToday !== 1 ? "s" : ""}.`
    );
  }

  // Engagement concern
  if (postsWithoutEngagement >= 3) {
    parts.push(
      "Engagement is thin — I might be talking past the audience. Considering shorter or more targeted posts."
    );
  } else if (postsWithoutEngagement === 2) {
    parts.push(
      "Two posts without engagement. Watching this — may need to adjust tone or timing."
    );
  }

  // Confidence assessment
  const window = recentConfidenceLevels.slice(-20);
  if (window.length >= 5) {
    const highCount = window.filter((c) => c === "high").length;
    const lowCount = window.filter((c) => c === "low").length;
    const highRatio = highCount / window.length;
    const lowRatio = lowCount / window.length;

    if (highRatio > 0.5) {
      parts.push(
        "Confidence running high — I should slow down and question my certainty."
      );
    } else if (highRatio > 0.35) {
      parts.push(
        "Confidence trending upward. Staying mindful of sycophancy drift."
      );
    } else if (lowRatio > 0.6) {
      parts.push(
        "Mostly low-confidence outputs. Deferring appropriately."
      );
    } else {
      parts.push("Confidence levels look balanced.");
    }
  }

  return parts.join(" ");
}

export function AtlasSays(props: AtlasSaysProps) {
  const report = generateSelfReport(props);

  return (
    <div className="bg-atlas/5 border border-atlas/20 rounded-xl p-4 animate-card-in">
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-atlas text-xs" aria-hidden="true">⬡</span>
        <h2 className="text-[10px] uppercase tracking-widest text-atlas font-semibold">
          ATLAS Says
        </h2>
      </div>
      <p className="text-sm text-text/90 leading-relaxed">
        {report}
      </p>
    </div>
  );
}
