import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ProfileIndicator } from "@/components/shared/ProfileIndicator";
import { SidebarNav } from "@/components/shared/SidebarNav";

export const metadata: Metadata = {
  title: "Anki Spelling Portal",
  description: "Extract, review, and enrich spelling cards for Anki",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground">
        <div className="flex min-h-screen">
          {/* Sidebar */}
          <aside className="flex w-56 flex-col border-r border-border bg-muted/30">
            <div className="border-b border-border px-4 py-2.5">
              <h1 className="text-sm font-bold tracking-tight">
                Spelling Portal
              </h1>
              <ProfileIndicator />
            </div>
            <Suspense>
              <SidebarNav />
            </Suspense>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-auto">
            <div className="mx-auto max-w-5xl p-6">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
