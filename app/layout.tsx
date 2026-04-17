import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MobileNav } from "@/components/mobile-nav";
import { ConnectionBadge } from "@/components/connection-badge";
import { Providers } from "@/components/providers";
import { UserMenu } from "@/components/user-menu";

export const metadata: Metadata = {
  title: "ATLAS PAW",
  description: "MobiusATLAS Privileged Access Workstation",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0d1117",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-dvh font-sans antialiased pb-20">
        <Providers>
          <header className="sticky top-0 z-50 flex items-center gap-3 px-4 py-3 bg-surface/95 backdrop-blur-sm border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-atlas text-base leading-none" aria-hidden="true">⬡</span>
              <h1 className="text-sm font-semibold tracking-wide text-atlas">
                ATLAS
              </h1>
              <span className="text-[10px] text-dim font-medium tracking-wider uppercase hidden sm:inline">
                PAW
              </span>
            </div>
            <span className="text-[10px] text-dim/60 hidden sm:inline truncate">
              Mobius Civic AI
            </span>
            <div className="ml-auto flex items-center gap-2 flex-shrink-0">
              <UserMenu />
              <ConnectionBadge />
            </div>
          </header>
          <main className="max-w-2xl mx-auto px-4 py-5">{children}</main>
          <MobileNav />
        </Providers>
      </body>
    </html>
  );
}
