"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw } from "lucide-react";
import { NoteTable } from "@/components/browse/NoteTable";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import type { AnkiNote } from "@/types/anki";

export default function BrowsePage() {
  const [notes, setNotes] = useState<AnkiNote[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const fetchNotes = useCallback(async (query?: string) => {
    setLoading(true);
    try {
      const q = query
        ? `deck:"Gao English Spelling" ${query}`
        : 'deck:"Gao English Spelling"';
      const res = await fetch(
        `/api/anki/notes?q=${encodeURIComponent(q)}&limit=200`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNotes(data.notes || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error("Failed to fetch notes:", err);
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchNotes(search || undefined);
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
    if (notes.every((n) => selectedIds.has(n.noteId))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(notes.map((n) => n.noteId)));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Browse Cards</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          View and manage spelling cards in Anki
          {total > 0 && ` (${total} total)`}
        </p>
      </div>

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
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

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
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : (
        <NoteTable
          notes={notes}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
        />
      )}
    </div>
  );
}
