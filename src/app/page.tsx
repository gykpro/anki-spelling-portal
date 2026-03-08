"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Upload,
  Library,
  Sparkles,
  PenLine,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { useAnkiConnection } from "@/hooks/useAnkiConnection";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { getAllLanguages } from "@/lib/languages";

interface DeckStats {
  total: number;
  missingDefinition: number;
  missingAudio: number;
  missingImage: number;
  missingSentence: number;
  missingPhonetic: number;
  missingSentenceAudio: number;
  missingStrokeOrder: number;
  missingSynonyms: number;
  missingExtraInfo: number;
  missingSentencePinyin: number;
  complete: number;
  needsAttention: number;
  needsAttentionNoteIds: number[];
}

interface AllStats extends DeckStats {
  byLanguage: Record<string, DeckStats>;
}

// Chip config: which stat fields to show, with optional language restriction
const STAT_CHIPS: {
  key: keyof DeckStats;
  label: string;
  filter: string;
  chineseOnly?: boolean;
}[] = [
  { key: "missingDefinition", label: "No Definition", filter: "missing_definition" },
  { key: "missingAudio", label: "No Audio", filter: "missing_audio" },
  { key: "missingImage", label: "No Image", filter: "missing_image" },
  { key: "missingSentence", label: "No Sentence", filter: "missing_sentence" },
  { key: "missingPhonetic", label: "No Phonetic", filter: "missing_phonetic" },
  { key: "missingSentenceAudio", label: "No Sentence Audio", filter: "missing_sentence_audio" },
  { key: "missingStrokeOrder", label: "No Stroke Order", filter: "missing_stroke_order", chineseOnly: true },
];

export default function DashboardPage() {
  const { status, loading, refresh } = useAnkiConnection();
  const [stats, setStats] = useState<AllStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<"success" | "error" | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/anki/sync", { method: "POST" });
      if (!res.ok) throw new Error("Sync failed");
      setSyncResult("success");
    } catch {
      setSyncResult("error");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 3000);
    }
  }

  useEffect(() => {
    async function fetchStats() {
      try {
        setStatsLoading(true);
        setStatsError(null);
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error("Failed to fetch stats");
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setStatsError(
          err instanceof Error ? err.message : "Failed to load stats"
        );
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
  }, []);

  const languages = getAllLanguages();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Spelling card management portal for Anki
        </p>
      </div>

      {/* Connection Status */}
      <div className="rounded-lg border border-border p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">System Status</h3>
          <div className="flex items-center gap-3">
            {syncResult === "success" && (
              <span className="text-xs text-green-600 dark:text-green-400">Synced</span>
            )}
            {syncResult === "error" && (
              <span className="text-xs text-destructive">Sync failed</span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Sync"}
            </button>
            <button
              onClick={refresh}
              className="text-xs text-primary hover:underline"
            >
              Refresh
            </button>
          </div>
        </div>
        {loading ? (
          <div className="mt-4 flex items-center gap-2">
            <LoadingSpinner size="sm" />
            <span className="text-sm text-muted-foreground">
              Checking connections...
            </span>
          </div>
        ) : status ? (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">AnkiConnect</p>
              <StatusBadge
                status={status.checks.ankiConnect ? "connected" : "disconnected"}
                label={
                  status.checks.ankiConnect
                    ? `v${status.checks.ankiVersion}`
                    : "Offline"
                }
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Deck</p>
              <StatusBadge
                status={status.checks.deck ? "connected" : "warning"}
                label={status.checks.deck || "Not found"}
              />
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Note Types</p>
              {status.checks.languages ? (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(status.checks.languages as Record<string, { deck: boolean; model: boolean }>).map(([id, lang]) => (
                    <StatusBadge
                      key={id}
                      status={lang.model ? "connected" : "disconnected"}
                      label={id === "english" ? "EN" : "CN"}
                    />
                  ))}
                </div>
              ) : (
                <StatusBadge
                  status={status.checks.modelExists ? "connected" : "disconnected"}
                  label={
                    status.checks.modelExists
                      ? "school spelling"
                      : "Missing"
                  }
                />
              )}
            </div>
          </div>
        ) : null}
      </div>

      {/* Card Completeness — per language */}
      <div className="rounded-lg border border-border p-5">
        <h3 className="text-sm font-semibold">Card Completeness</h3>
        {statsLoading ? (
          <div className="mt-4 flex items-center gap-2">
            <LoadingSpinner size="sm" />
            <span className="text-sm text-muted-foreground">
              Loading stats...
            </span>
          </div>
        ) : statsError ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>{statsError}</span>
          </div>
        ) : stats?.byLanguage ? (
          <div className="mt-4 space-y-6">
            {languages.map((lang) => {
              const langStats = stats.byLanguage[lang.id] as DeckStats | undefined;
              if (!langStats || langStats.total === 0) return null;
              const isChinese = lang.id === "chinese";
              return (
                <DeckCompletenessSection
                  key={lang.id}
                  label={lang.label}
                  deck={lang.deck}
                  stats={langStats}
                  isChinese={isChinese}
                />
              );
            })}
          </div>
        ) : stats ? (
          // Fallback: flat stats (no byLanguage)
          <div className="mt-4">
            <DeckCompletenessSection
              label="English"
              deck={languages[0]?.deck || ""}
              stats={stats}
              isChinese={false}
            />
          </div>
        ) : null}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/upload"
          className="group rounded-lg border border-border p-5 transition-colors hover:border-primary/50 hover:bg-accent"
        >
          <Upload className="h-8 w-8 text-primary" />
          <h3 className="mt-3 text-sm font-semibold">Upload & Extract</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Upload spelling worksheets and extract sentences
          </p>
        </Link>
        <Link
          href="/quick-add"
          className="group rounded-lg border border-border p-5 transition-colors hover:border-primary/50 hover:bg-accent"
        >
          <PenLine className="h-8 w-8 text-primary" />
          <h3 className="mt-3 text-sm font-semibold">Quick Add</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Add words and generate cards with enrichment
          </p>
        </Link>
        <Link
          href="/browse"
          className="group rounded-lg border border-border p-5 transition-colors hover:border-primary/50 hover:bg-accent"
        >
          <Library className="h-8 w-8 text-primary" />
          <h3 className="mt-3 text-sm font-semibold">Browse Cards</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            View and manage existing spelling cards in Anki
          </p>
        </Link>
        <Link
          href="/enrich"
          className="group rounded-lg border border-border p-5 transition-colors hover:border-primary/50 hover:bg-accent"
        >
          <Sparkles className="h-8 w-8 text-primary" />
          <h3 className="mt-3 text-sm font-semibold">Enrich Cards</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Add definitions, audio, and images to cards
          </p>
        </Link>
      </div>
    </div>
  );
}

function DeckCompletenessSection({
  label,
  deck,
  stats,
  isChinese,
}: {
  label: string;
  deck: string;
  stats: DeckStats;
  isChinese: boolean;
}) {
  const chips = STAT_CHIPS.filter(
    (c) => !c.chineseOnly || isChinese
  ).filter((c) => (stats[c.key] as number) > 0);

  const hasIssues = stats.needsAttention > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        {hasIssues ? (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">
          {hasIssues ? (
            <>
              <span className="font-semibold text-foreground">{stats.needsAttention}</span> of{" "}
              <span className="font-semibold text-foreground">{stats.total}</span> cards need attention
            </>
          ) : (
            <>All {stats.total} cards are complete</>
          )}
        </span>
      </div>

      {(chips.length > 0 || stats.complete > 0) && (
        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <Link
              key={c.key}
              href={`/browse?deck=${encodeURIComponent(deck)}&filter=${c.filter}`}
              className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
            >
              {c.label} ({stats[c.key] as number})
            </Link>
          ))}
          <span className="inline-flex items-center rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300">
            Complete ({stats.complete})
          </span>
        </div>
      )}

      {hasIssues && (
        <Link
          href={`/enrich?noteIds=${stats.needsAttentionNoteIds.join(",")}`}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Sparkles className="h-4 w-4" />
          Enrich {stats.needsAttention} cards
        </Link>
      )}
    </div>
  );
}
