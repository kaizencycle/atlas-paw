"use client";

import { signOut, useSession } from "next-auth/react";

export function UserMenu() {
  const { data: session, status } = useSession();

  if (status !== "authenticated" || !session?.user) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-dim max-w-[100px] truncate hidden sm:inline">
        {session.user.name || session.user.email}
      </span>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/signin" })}
        className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md border border-border text-dim hover:text-text"
      >
        Sign out
      </button>
    </div>
  );
}
