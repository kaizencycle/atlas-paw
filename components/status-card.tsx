interface StatusCardProps {
  label: string;
  children: React.ReactNode;
  className?: string;
  variant?: "default" | "atlas";
}

export function StatusCard({ label, children, className = "", variant = "default" }: StatusCardProps) {
  const borderCls = variant === "atlas"
    ? "border-atlas/20"
    : "border-border";

  const labelCls = variant === "atlas"
    ? "text-atlas"
    : "text-dim";

  return (
    <div
      className={`bg-surface border ${borderCls} rounded-xl p-4 animate-card-in ${className}`}
    >
      <h2 className={`text-[10px] uppercase tracking-widest ${labelCls} mb-2 font-semibold`}>
        {label}
      </h2>
      {children}
    </div>
  );
}
