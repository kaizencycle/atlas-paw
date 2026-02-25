interface StatusCardProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function StatusCard({ label, children, className = "" }: StatusCardProps) {
  return (
    <div
      className={`bg-surface border border-border rounded-xl p-4 ${className}`}
    >
      <h2 className="text-[10px] uppercase tracking-widest text-dim mb-2 font-semibold">
        {label}
      </h2>
      {children}
    </div>
  );
}
