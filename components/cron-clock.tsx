"use client";

interface CronClockProps {
  jobs: Array<{
    name: string;
    schedule: { expr?: string };
    state?: { nextRunAtMs?: number };
  }>;
}

function getHourFromCron(expr?: string): number | null {
  if (!expr) return null;
  // Parse simple cron: "0 9 * * *" → hour 9
  const parts = expr.trim().split(/\s+/);
  if (parts.length >= 2) {
    const hour = parseInt(parts[1], 10);
    if (!isNaN(hour) && hour >= 0 && hour <= 23) return hour;
  }
  return null;
}

function getHourFromMs(ms?: number): number | null {
  if (!ms) return null;
  const d = new Date(ms);
  return d.getHours();
}

const RADIUS = 52;
const CENTER = 64;

export function CronClock({ jobs }: CronClockProps) {
  // Collect hours for each job
  const jobHours = jobs.map((job) => {
    const cronHour = getHourFromCron(job.schedule.expr);
    const nextHour = getHourFromMs(job.state?.nextRunAtMs);
    return {
      name: job.name,
      hour: cronHour ?? nextHour,
    };
  }).filter((j) => j.hour !== null) as Array<{ name: string; hour: number }>;

  if (jobHours.length === 0) return null;

  // Current hour marker
  const now = new Date();
  const currentAngle = ((now.getHours() + now.getMinutes() / 60) / 24) * 360 - 90;

  return (
    <div className="flex items-center justify-center py-2">
      <svg viewBox="0 0 128 128" className="w-32 h-32">
        {/* Background ring */}
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1"
          opacity="0.4"
        />

        {/* Hour markers */}
        {[0, 6, 12, 18].map((h) => {
          const angle = (h / 24) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const x1 = CENTER + (RADIUS - 4) * Math.cos(rad);
          const y1 = CENTER + (RADIUS - 4) * Math.sin(rad);
          const x2 = CENTER + (RADIUS + 2) * Math.cos(rad);
          const y2 = CENTER + (RADIUS + 2) * Math.sin(rad);
          const lx = CENTER + (RADIUS + 9) * Math.cos(rad);
          const ly = CENTER + (RADIUS + 9) * Math.sin(rad);
          return (
            <g key={h}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="var(--color-dim)"
                strokeWidth="0.8"
                opacity="0.5"
              />
              <text
                x={lx} y={ly}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--color-dim)"
                fontSize="6"
                opacity="0.6"
              >
                {h === 0 ? "0h" : `${h}h`}
              </text>
            </g>
          );
        })}

        {/* Job dots */}
        {jobHours.map((job, i) => {
          const angle = (job.hour / 24) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const x = CENTER + RADIUS * Math.cos(rad);
          const y = CENTER + RADIUS * Math.sin(rad);
          return (
            <g key={i}>
              <circle
                cx={x} cy={y} r="4"
                fill="var(--color-atlas)"
                opacity="0.9"
              />
              <circle
                cx={x} cy={y} r="6"
                fill="var(--color-atlas)"
                opacity="0.15"
              />
              <title>{job.name} — {job.hour}:00</title>
            </g>
          );
        })}

        {/* Current time hand */}
        {(() => {
          const rad = (currentAngle * Math.PI) / 180;
          const x = CENTER + (RADIUS - 14) * Math.cos(rad);
          const y = CENTER + (RADIUS - 14) * Math.sin(rad);
          return (
            <line
              x1={CENTER} y1={CENTER} x2={x} y2={y}
              stroke="var(--color-accent)"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.7"
            />
          );
        })()}

        {/* Center dot */}
        <circle cx={CENTER} cy={CENTER} r="2" fill="var(--color-accent)" opacity="0.8" />
      </svg>
    </div>
  );
}
