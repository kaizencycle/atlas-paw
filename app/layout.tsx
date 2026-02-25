import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MobileNav } from "@/components/mobile-nav";
import { ConnectionBadge } from "@/components/connection-badge";

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
        <header className="sticky top-0 z-50 flex items-center gap-3 px-4 py-3 bg-surface border-b border-border">
          <h1 className="text-sm font-semibold tracking-wide text-accent">
            ATLAS PAW
          </h1>
          <span className="text-xs text-dim hidden sm:inline">
            Mobius Civic AI
          </span>
          <div className="ml-auto">
            <ConnectionBadge />
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-5">{children}</main>
        <MobileNav />
      </body>
    </html>
  );
}
