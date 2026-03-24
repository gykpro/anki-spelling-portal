"use client";

import { Suspense, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Search, RefreshCw, Filter, Trash2, Eraser } from "lucide-react";
import { NoteTable } from "@/components/browse/NoteTable";
import { NoteDetailDrawer } from "@/components/browse/NoteDetailDrawer";
import { DeleteConfirmModal } from "@/components/browse/DeleteConfirmModal";
import { ClearFieldsModal } from "@/components/browse/ClearFieldsModal";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { cn } from "@/lib/utils";
import { getAllLanguages, getLanguageByDeck, getLanguageById } from "@/lib/languages";
import { getCardCompleteness, isStrokeOrderComplete, isExtraInfoComplete } from "@/lib/card-completeness";
import type { AnkiNote } from "@/types/anki";

type QuickFilter =
  | "all"
  | "missing_definition"
  | "missing_audio"
  | "missing_image"
  | "has_all"
  | "missing_sentence"
  | "missing_phonetic"
  | "missing_sentence_audio"
  | "missing_stroke_order"
  | "missing_example_audio";

interface FilterDef {
  key: QuickFilter;
  label: string;
  row: 1 | 2;
  chineseOnly?: boolean;
}

const QUICK_FILTERS: FilterDef[] = [
  { key: "all", label: "All", row: 1 },
  { key: "missing_definition", label: "No Definition", row: 1 },
  { key: "missing_audio", label: "No Audio", row: 1 },
  { key: "missing_image", label: "No Image", row: 1 },
  { key: "has_all", label: "Complete", row: 1 },
  { key: "missing_sentence", label: "No Sentence", row: 2 },
  { key: "missing_phonetic", label: "No Phonetic", row: 2 },
  { key: "missing_sentence_audio", label: "No Sentence Audio", row: 2 },
  { key: "missing_example_audio", label: "No Example Audio", row: 2 },
  { key: "missing_stroke_order", label: "No Stroke Order", row: 2, chineseOnly: true },
];

const DEFAULT_DECK = getAllLanguages()[0].deck;

function getFieldValue(note: AnkiNote, field: string): string {
  return note.fields[field]?.value || "";
}

export default function BrowsePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-12"><LoadingSpinner /></div>}>
      <BrowseContent />
    </Suspense>
  );
}

function BrowseContent() {
  const searchParams = useSearchParams();
  const selectedDeck = searchParams.get("deck") || DEFAULT_DECK;
  const lang = getLanguageByDeck(selectedDeck) ?? getLanguageById("english");
  const isChinese = lang.id === "chinese";

  const [allNotes, setAllNotes] = useState<AnkiNote[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const initialFilter = searchParams.get("filter") as QuickFilter | null;
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(
    initialFilter && QUICK_FILTERS.some((f) => f.key === initialFilter)
      ? initialFilter
      : "all"
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedNote, setSelectedNote] = useState<AnkiNote | null>(null);
  const [showSuspended, setShowSuspended] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showClearFieldsModal, setShowClearFieldsModal] = useState(false);

  const fetchNotes = useCallback(async (query?: string) => {
    setLoading(true);
    try {
      let q = query
        ? `deck:"${selectedDeck}" ${query}`
        : `deck:"${selectedDeck}"`;
      if (!showSuspended) q += " -is:suspended";
      const res = await fetch(
        `/api/anki/notes?q=${encodeURIComponent(q)}&limit=2000`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      let notes: AnkiNote[] = data.notes || [];
      // When searching, sort word-field matches first
      if (query && !query.startsWith("tag:")) {
        const q = query.toLowerCase();
        notes = [...notes].sort((a, b) => {
          const aWord = (a.fields.Word?.value || "").toLowerCase();
          const bWord = (b.fields.Word?.value || "").toLowerCase();
          const aMatch = aWord.includes(q) ? 1 : 0;
          const bMatch = bWord.includes(q) ? 1 : 0;
          if (aMatch !== bMatch) return bMatch - aMatch;
          // Among word matches, exact match first
          const aExact = aWord === q ? 1 : 0;
          const bExact = bWord === q ? 1 : 0;
          return bExact - aExact;
        });
      }
      setAllNotes(notes);
      setTotal(data.total || 0);
      setPage(1);
    } catch (err) {
      console.error("Failed to fetch notes:", err);
      setAllNotes([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDeck, showSuspended]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  // Reset state when deck changes via URL (skip initial mount)
  const prevDeck = useRef(selectedDeck);
  useEffect(() => {
    if (prevDeck.current !== selectedDeck) {
      prevDeck.current = selectedDeck;
      setSearch("");
      setSelectedIds(new Set());
      setQuickFilter("all");
    }
  }, [selectedDeck]);

  // Apply quick filter client-side
  const filteredNotes = useMemo(() => {
    if (quickFilter === "all") return allNotes;
    return allNotes.filter((note) => {
      switch (quickFilter) {
        case "missing_definition":
          return !getFieldValue(note, "Definition");
        case "missing_audio":
          return !getFieldValue(note, "Audio");
        case "missing_image":
          return !getFieldValue(note, "Picture");
        case "missing_sentence":
          return !getFieldValue(note, "Main Sentence");
        case "missing_phonetic":
          return !getFieldValue(note, "Phonetic symbol");
        case "missing_sentence_audio": {
          const hasSentence = !!getFieldValue(note, "Main Sentence");
          const hasSentenceAudio = !!getFieldValue(note, "Main Sentence Audio");
          return hasSentence && !hasSentenceAudio;
        }
        case "missing_example_audio":
          return !isExtraInfoComplete(note.fields);
        case "missing_stroke_order":
          return !isStrokeOrderComplete(note.fields);
        case "has_all": {
          const result = getCardCompleteness(note.fields, lang);
          return result.complete;
        }
        default:
          return true;
      }
    });
  }, [allNotes, quickFilter, lang]);

  // Count notes matching each filter for chip badges
  const filterCounts = useMemo(() => {
    const counts: Record<QuickFilter, number> = {
      all: allNotes.length,
      missing_definition: 0,
      missing_audio: 0,
      missing_image: 0,
      missing_sentence: 0,
      missing_phonetic: 0,
      missing_sentence_audio: 0,
      missing_example_audio: 0,
      missing_stroke_order: 0,
      has_all: 0,
    };
    for (const note of allNotes) {
      if (!getFieldValue(note, "Definition")) counts.missing_definition++;
      if (!getFieldValue(note, "Audio")) counts.missing_audio++;
      if (!getFieldValue(note, "Picture")) counts.missing_image++;
      if (!getFieldValue(note, "Main Sentence")) counts.missing_sentence++;
      if (!getFieldValue(note, "Phonetic symbol")) counts.missing_phonetic++;
      if (!isExtraInfoComplete(note.fields)) counts.missing_example_audio++;
      if (!isStrokeOrderComplete(note.fields)) counts.missing_stroke_order++;
      const hasSentence = !!getFieldValue(note, "Main Sentence");
      if (hasSentence && !getFieldValue(note, "Main Sentence Audio")) counts.missing_sentence_audio++;
      const result = getCardCompleteness(note.fields, lang);
      if (result.complete) counts.has_all++;
    }
    return counts;
  }, [allNotes, lang]);

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

  const selectAll = (pageNoteIds: number[]) => {
    if (pageNoteIds.every((id) => selectedIds.has(id))) {
      // Deselect page notes
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageNoteIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      // Select page notes
      setSelectedIds((prev) => {
        const next = new Set(prev);
        pageNoteIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const selectedWords = useMemo(() => {
    return allNotes
      .filter((n) => selectedIds.has(n.noteId))
      .map((n) => n.fields.Word?.value || "unknown");
  }, [allNotes, selectedIds]);

  const handleDelete = async () => {
    const res = await fetch("/api/anki/notes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteIds: Array.from(selectedIds) }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setShowDeleteModal(false);
    setSelectedIds(new Set());
    fetchNotes(search || undefined);
  };

  const handleClearFields = async (fields: string[]) => {
    const res = await fetch("/api/anki/notes/clear-fields", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteIds: Array.from(selectedIds), fields }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setShowClearFieldsModal(false);
    fetchNotes(search || undefined);
  };

  const visibleFilters = QUICK_FILTERS.filter(
    (f) => !f.chineseOnly || isChinese
  );
  const row1 = visibleFilters.filter((f) => f.row === 1);
  const row2 = visibleFilters.filter((f) => f.row === 2);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Browse Cards</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {selectedDeck}
          {total > 0 && ` — ${total} cards`}
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

      {/* Quick filters — Row 1 (essential) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {row1.map((f) => (
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
                  ({filterCounts[f.key]})
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

        {/* Row 2 (extended filters) */}
        {row2.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pl-5.5">
            {row2.map((f) => (
              <button
                key={f.key}
                onClick={() => { setQuickFilter(f.key); setPage(1); }}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  quickFilter === f.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/60 text-muted-foreground/80 hover:bg-muted"
                )}
              >
                {f.label}
                <span className="ml-1 opacity-70">
                  ({filterCounts[f.key]})
                </span>
              </button>
            ))}
            <span className="mx-1 text-border">|</span>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground/80 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSuspended}
                onChange={(e) => setShowSuspended(e.target.checked)}
                className="rounded"
              />
              Show Suspended
            </label>
          </div>
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
            onClick={() => setShowClearFieldsModal(true)}
            className="flex items-center gap-1 rounded bg-warning px-3 py-1 text-xs font-medium text-warning-foreground hover:opacity-90"
          >
            <Eraser className="h-3 w-3" />
            Clear Fields
          </button>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="flex items-center gap-1 rounded bg-destructive px-3 py-1 text-xs font-medium text-destructive-foreground hover:opacity-90"
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear Selection
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
          onNoteClick={setSelectedNote}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}

      {/* Word detail drawer */}
      <NoteDetailDrawer
        note={selectedNote}
        onClose={() => setSelectedNote(null)}
      />

      {/* Delete confirmation modal */}
      {showDeleteModal && (
        <DeleteConfirmModal
          words={selectedWords}
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {/* Clear fields modal */}
      {showClearFieldsModal && (
        <ClearFieldsModal
          noteCount={selectedIds.size}
          lang={lang}
          onConfirm={handleClearFields}
          onCancel={() => setShowClearFieldsModal(false)}
        />
      )}
    </div>
  );
}
