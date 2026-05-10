"use client";

import { useState, useEffect } from "react";
import { Share2, Check, AlertCircle, Loader2 } from "lucide-react";
import type { DistributeResult } from "@/types/anki";

interface DistributionTargetsProps {
  /** Pre-loaded target endpoints to show. If omitted, reads configured endpoints from settings. */
  endpoints?: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

/** Read-only display of configured distribution target endpoints. */
export function DistributionTargets({
  endpoints: propEndpoints,
  selected,
  onChange,
}: DistributionTargetsProps) {
  const [endpoints, setEndpoints] = useState<string[]>(propEndpoints || []);

  useEffect(() => {
    if (propEndpoints) {
      onChange(propEndpoints);
      return;
    }
    fetch("/api/settings")
      .then((r) => r.json())
      .then((settings) => {
        const distValue = settings.settings?.DISTRIBUTION_ENDPOINTS?.maskedValue || "";
        const targets = distValue
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean);
        setEndpoints(targets);
        onChange(targets);
      })
      .catch(() => {});
  }, [propEndpoints, onChange]);

  if (endpoints.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      <Share2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className="text-muted-foreground shrink-0">Copy to:</span>
      {endpoints.map((endpoint) => (
        <span
          key={endpoint}
          title={endpoint}
          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 ${
            selected.includes(endpoint)
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground"
          }`}
        >
          <Check className="h-3 w-3" />
          {endpoint}
        </span>
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
          key={r.target}
          className={`inline-flex items-center gap-1 ${
            r.success ? "text-success" : "text-destructive"
          }`}
        >
          {r.success ? (
            <Check className="h-3 w-3" />
          ) : (
            <AlertCircle className="h-3 w-3" />
          )}
          {r.target}
          {r.success && r.notesDistributed > 0 && (
            <span className="text-muted-foreground">({r.notesDistributed})</span>
          )}
        </span>
      ))}
    </div>
  );
}
