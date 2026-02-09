"use client";

import Link from "next/link";
import { Upload, Library, Sparkles } from "lucide-react";
import { useAnkiConnection } from "@/hooks/useAnkiConnection";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

export default function DashboardPage() {
  const { status, loading, refresh } = useAnkiConnection();

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
          <button
            onClick={refresh}
            className="text-xs text-primary hover:underline"
          >
            Refresh
          </button>
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
              <p className="text-xs text-muted-foreground">Note Type</p>
              <StatusBadge
                status={status.checks.modelExists ? "connected" : "disconnected"}
                label={
                  status.checks.modelExists
                    ? "school spelling+"
                    : "Missing"
                }
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-3">
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
