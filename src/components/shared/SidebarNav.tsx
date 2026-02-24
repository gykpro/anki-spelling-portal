"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";
import {
  Home,
  Upload,
  Library,
  Sparkles,
  PenLine,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getAllLanguages } from "@/lib/languages";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/quick-add", label: "Quick Add", icon: PenLine },
  { href: "/browse", label: "Browse", icon: Library },
  { href: "/enrich", label: "Enrich", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

const languages = getAllLanguages();

export function SidebarNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [deckCounts, setDeckCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    Promise.all(
      languages.map(async (lang) => {
        try {
          const res = await fetch(
            `/api/stats?deck=${encodeURIComponent(lang.deck)}`
          );
          const data = await res.json();
          return [lang.deck, data.total ?? 0] as const;
        } catch {
          return [lang.deck, 0] as const;
        }
      })
    ).then((results) => {
      setDeckCounts(Object.fromEntries(results));
    });
  }, [pathname]);

  const activeDeck = searchParams.get("deck");

  return (
    <nav className="flex-1 p-2">
      {navItems.map((item) => {
        const isActive =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

        return (
          <div key={item.href}>
            <Link
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>

            {item.href === "/browse" &&
              languages.map((lang) => {
                const isActiveDeck =
                  pathname === "/browse" && activeDeck === lang.deck;
                const count = deckCounts[lang.deck];

                return (
                  <Link
                    key={lang.id}
                    href={`/browse?deck=${encodeURIComponent(lang.deck)}`}
                    className={cn(
                      "flex items-center justify-between rounded-md py-1.5 pl-9 pr-3 text-xs transition-colors",
                      isActiveDeck
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <span>{lang.deck}</span>
                    {count !== undefined && (
                      <span className="text-muted-foreground/60">{count}</span>
                    )}
                  </Link>
                );
              })}
          </div>
        );
      })}
    </nav>
  );
}
