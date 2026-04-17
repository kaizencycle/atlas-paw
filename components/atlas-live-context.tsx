"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useAtlasLiveSignals } from "@/hooks/use-atlas-live-signals";
import type { AtlasLiveSnapshot } from "@/lib/atlas-types";

type AtlasLiveContextValue = {
  snapshot: AtlasLiveSnapshot;
  refresh: () => Promise<void>;
  notifyEnabled: boolean;
  setNotifyEnabled: (on: boolean) => void;
  requestNotifyPermission: () => Promise<NotificationPermission | "unsupported">;
};

const AtlasLiveContext = createContext<AtlasLiveContextValue | null>(null);

export function AtlasLiveProvider({ children }: { children: ReactNode }) {
  const value = useAtlasLiveSignals({
    pollMs: 12_000,
    pollReadonlyMs: 20_000,
  });
  return (
    <AtlasLiveContext.Provider value={value}>
      {children}
    </AtlasLiveContext.Provider>
  );
}

export function useAtlasLive(): AtlasLiveContextValue {
  const ctx = useContext(AtlasLiveContext);
  if (!ctx) {
    throw new Error("useAtlasLive must be used within AtlasLiveProvider");
  }
  return ctx;
}
