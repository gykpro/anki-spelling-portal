"use client";

import { useState, useEffect } from "react";
import { Share2, Check, AlertCircle, Loader2 } from "lucide-react";
import type { DistributeResult } from "@/types/anki";

interface DistributionTargetsProps {
  /** Pre-loaded profiles to choose from. If omitted, fetches from API. */
  profiles?: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

/** Checkbox selector for distribution target instances */
export function DistributionTargets({
  profiles: propProfiles,
  selected,
  onChange,
}: DistributionTargetsProps) {
  const [profiles, setProfiles] = useState<string[]>(propProfiles || []);

  useEffect(() => {
    if (propProfiles) return;
    fetch("/api/settings")
      .then((r) => r.json())
      .then((settings) => {
        // DISTRIBUTION_TARGETS is "Name=URL, Name2=URL2" — show the names
        const raw = settings.settings?.DISTRIBUTION_TARGETS?.maskedValue || "";
        const names = raw
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean)
          .map((entry: string) => entry.split("=")[0]?.trim())
          .filter(Boolean);
        if (names.length > 0) {
          setProfiles(names);
          // Auto-select all distribution targets
          onChange(names);
        }
      })
      .catch(() => {});
  }, [propProfiles]);

  if (profiles.length === 0) return null;

  const toggle = (profile: string) => {
    if (selected.includes(profile)) {
      onChange(selected.filter((p) => p !== profile));
    } else {
      onChange([...selected, profile]);
    }
  };

  return (
    <div className="flex items-center gap-2 text-xs">
      <Share2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground shrink-0">Distribute to:</span>
      {profiles.map((p) => (
        <button
          key={p}
          onClick={() => toggle(p)}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 transition-colors ${
            selected.includes(p)
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted"
          }`}
        >
          {selected.includes(p) && <Check className="h-3 w-3" />}
          {p}
        </button>
      ))}
    </div>
  );
}

/** Inline display of distribution results */
export function DistributionStatus({
  results,
  loading,
}: {
  results: DistributeResult[] | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Distributing...
      </div>
    );
  }

  if (!results || results.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
      {results.map((r) => (
        <span
          key={r.profile}
          className={`inline-flex items-center gap-1 ${
            r.success ? "text-success" : "text-destructive"
          }`}
        >
          {r.success ? (
            <Check className="h-3 w-3" />
          ) : (
            <AlertCircle className="h-3 w-3" />
          )}
          {r.profile}
          {r.success && r.notesDistributed > 0 && (
            <span className="text-muted-foreground">({r.notesDistributed})</span>
          )}
        </span>
      ))}
    </div>
  );
}
