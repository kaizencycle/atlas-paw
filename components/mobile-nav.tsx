"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Dashboard", icon: "⬡" },
  { href: "/chat", label: "Chat", icon: "◇" },
  { href: "/drafts", label: "Drafts", icon: "✎" },
  { href: "/cron", label: "Cron", icon: "⟳" },
  { href: "/audit", label: "Audit", icon: "⊞" },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-sm border-t border-border flex">
      {tabs.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition-colors ${
              active ? "text-atlas" : "text-dim"
            }`}
          >
            <span
              className={`w-7 h-7 flex items-center justify-center rounded-lg text-sm ${
                active ? "bg-atlas/15 font-bold" : ""
              }`}
            >
              {t.icon}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
