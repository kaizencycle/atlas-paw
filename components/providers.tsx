"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";
import { AtlasLiveProvider } from "@/components/atlas-live-context";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AtlasLiveProvider>{children}</AtlasLiveProvider>
    </SessionProvider>
  );
}
