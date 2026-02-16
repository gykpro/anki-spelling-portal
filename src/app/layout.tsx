import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import {
  Home,
  Upload,
  Library,
  Sparkles,
  PenLine,
  Settings,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Anki Spelling Portal",
  description: "Extract, review, and enrich spelling cards for Anki",
};

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/quick-add", label: "Quick Add", icon: PenLine },
  { href: "/browse", label: "Browse", icon: Library },
  { href: "/enrich", label: "Enrich", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

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
            <div className="flex h-14 items-center border-b border-border px-4">
              <h1 className="text-sm font-bold tracking-tight">
                Spelling Portal
              </h1>
            </div>
            <nav className="flex-1 p-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              ))}
            </nav>
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
