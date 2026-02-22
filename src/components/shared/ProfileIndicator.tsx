"use client";

import { useState, useEffect, useRef } from "react";
import { User, ChevronDown, Loader2 } from "lucide-react";

interface ProfileData {
  profiles: string[];
  active: string | null;
}

export function ProfileIndicator() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/anki/profiles")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to fetch profiles");
        return r.json();
      })
      .then(setData)
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (!data || data.profiles.length <= 1) return null;

  const switchProfile = async (name: string) => {
    if (name === data.active) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const res = await fetch("/api/anki/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        setData((prev) => (prev ? { ...prev, active: name } : prev));
        window.location.reload();
      }
    } catch {
      // ignore
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        disabled={switching}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
      >
        {switching ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <User className="h-3.5 w-3.5" />
        )}
        <span className="truncate">{data.active || "No profile"}</span>
        <ChevronDown className="ml-auto h-3 w-3" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-background shadow-lg">
          {data.profiles.map((p) => (
            <button
              key={p}
              onClick={() => switchProfile(p)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted ${
                p === data.active
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <User className="h-3 w-3" />
              {p}
              {p === data.active && (
                <span className="ml-auto text-[10px] text-success">active</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
