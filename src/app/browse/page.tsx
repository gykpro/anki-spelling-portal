"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search, RefreshCw, Filter } from "lucide-react";
import { NoteTable } from "@/components/browse/NoteTable";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { cn } from "@/lib/utils";
import type { AnkiNote } from "@/types/anki";

type QuickFilter = "all" | "missing_definition" | "missing_audio" | "missing_image" | "has_all";

const QUICK_FILTERS: { key: QuickFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "missing_definition", label: "No Definition" },
  { key: "missing_audio", label: "No Audio" },
  { key: "missing_image", label: "No Image" },
  { key: "has_all", label: "Complete" },
];

function getFieldValue(note: AnkiNote, field: string): string {
  return note.fields[field]?.value || "";
}

export default function BrowsePage() {
  const [allNotes, setAllNotes] = useState<AnkiNote[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchNotes = useCallback(async (query?: string) => {
    setLoading(true);
    try {
      const q = query
        ? `deck:"Gao English Spelling" ${query}`
        : 'deck:"Gao English Spelling"';
      const res = await fetch(
        `/api/anki/notes?q=${encodeURIComponent(q)}&limit=500`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAllNotes(data.notes || []);
      setTotal(data.total || 0);
      setPage(1);
    } catch (err) {
      console.error("Failed to fetch notes:", err);
      setAllNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Apply quick filter client-side
  const filteredNotes = useMemo(() => {
    if (quickFilter === "all") return allNotes;
    return allNotes.filter((note) => {
      const hasDef = !!getFieldValue(note, "Definition");
      const hasAudio = !!getFieldValue(note, "Audio");
      const hasImage = !!getFieldValue(note, "Picture");
      switch (quickFilter) {
        case "missing_definition": return !hasDef;
        case "missing_audio": return !hasAudio;
        case "missing_image": return !hasImage;
        case "has_all": return hasDef && hasAudio && hasImage;
        default: return true;
      }
    });
  }, [allNotes, quickFilter]);

  // Collect unique tags for display
  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const note of allNotes) {
      for (const tag of note.tags) {
        counts[tag] = (counts[tag] || 0) + 1;
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allNotes]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNotes(search || undefined);
  };

  const handleTagClick = (tag: string) => {
    setSearch(`tag:${tag}`);
    fetchNotes(`tag:${tag}`);
  };

  const toggleSelect = (noteId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  };

  const selectAll = () => {
    const pageStart = (page - 1) * pageSize;
    const pageNotes = filteredNotes.slice(pageStart, pageStart + pageSize);
    if (pageNotes.every((n) => selectedIds.has(n.noteId))) {
      // Deselect page notes
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageNotes.forEach((n) => next.delete(n.noteId));
        return next;
      });
    } else {
      // Select page notes
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageNotes.forEach((n) => next.add(n.noteId));
        return next;
      });
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Browse Cards</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage spelling cards in Anki
          {total > 0 && ` (${total} total)`}
        </p>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <form onSubmit={handleSearch} className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Search cards (e.g., "creature" or "tag:term_2_week_3")'
              className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Search
          </button>
        </form>
        <button
          onClick={() => fetchNotes(search || undefined)}
          className="rounded-md border border-border p-2 text-muted-foreground hover:bg-muted"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Quick filters + tag chips */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setQuickFilter(f.key); setPage(1); }}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              quickFilter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            {f.label}
            {f.key !== "all" && (
              <span className="ml-1 opacity-70">
                ({f.key === "missing_definition"
                  ? allNotes.filter((n) => !getFieldValue(n, "Definition")).length
                  : f.key === "missing_audio"
                    ? allNotes.filter((n) => !getFieldValue(n, "Audio")).length
                    : f.key === "missing_image"
                      ? allNotes.filter((n) => !getFieldValue(n, "Picture")).length
                      : allNotes.filter((n) =>
                          !!getFieldValue(n, "Definition") &&
                          !!getFieldValue(n, "Audio") &&
                          !!getFieldValue(n, "Picture")
                        ).length})
              </span>
            )}
          </button>
        ))}
        {tagCounts.length > 0 && (
          <>
            <span className="mx-1 text-border">|</span>
            {tagCounts.slice(0, 8).map(([tag, count]) => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                {tag} <span className="opacity-60">{count}</span>
              </button>
            ))}
          </>
        )}
      </div>

      {/* Selection bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-md bg-accent px-4 py-2 text-sm">
          <span className="font-medium">
            {selectedIds.size} card{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <a
            href={`/enrich?noteIds=${Array.from(selectedIds).join(",")}`}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Enrich Selected
          </a>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <NoteTable
          notes={filteredNotes}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}
