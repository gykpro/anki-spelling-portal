"use client";

import { useState, useMemo } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import type { AnkiNote } from "@/types/anki";
import { cn } from "@/lib/utils";

type SortField = "word" | "sentence" | "definition" | "audio" | "image" | "tags" | "created" | "modified";
type SortDir = "asc" | "desc";

interface NoteTableProps {
  notes: AnkiNote[];
  selectedIds: Set<number>;
  onToggleSelect: (noteId: number) => void;
  onSelectAll: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

function getFieldValue(note: AnkiNote, field: string): string {
  return note.fields[field]?.value || "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function formatDate(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;

  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc" ? (
    <ChevronUp className="h-3 w-3" />
  ) : (
    <ChevronDown className="h-3 w-3" />
  );
}

export function NoteTable({
  notes,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: NoteTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sorted = useMemo(() => {
    // Default sort: newest first (by noteId, which is a timestamp)
    if (!sortField) return [...notes].sort((a, b) => b.noteId - a.noteId);
    return [...notes].sort((a, b) => {
      let va = "";
      let vb = "";
      switch (sortField) {
        case "word":
          va = getFieldValue(a, "Word").toLowerCase();
          vb = getFieldValue(b, "Word").toLowerCase();
          break;
        case "sentence":
          va = stripHtml(getFieldValue(a, "Main Sentence")).toLowerCase();
          vb = stripHtml(getFieldValue(b, "Main Sentence")).toLowerCase();
          break;
        case "definition":
          va = stripHtml(getFieldValue(a, "Definition")).toLowerCase();
          vb = stripHtml(getFieldValue(b, "Definition")).toLowerCase();
          break;
        case "audio":
          va = getFieldValue(a, "Audio") ? "1" : "0";
          vb = getFieldValue(b, "Audio") ? "1" : "0";
          break;
        case "image":
          va = getFieldValue(a, "Picture") ? "1" : "0";
          vb = getFieldValue(b, "Picture") ? "1" : "0";
          break;
        case "tags":
          va = a.tags.join(",").toLowerCase();
          vb = b.tags.join(",").toLowerCase();
          break;
        case "created": {
          const ca = a.noteId;
          const cb = b.noteId;
          return sortDir === "asc" ? ca - cb : cb - ca;
        }
        case "modified": {
          const ma = a.mod || 0;
          const mb = b.mod || 0;
          return sortDir === "asc" ? ma - mb : mb - ma;
        }
      }
      const cmp = va.localeCompare(vb);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [notes, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageAllSelected =
    paged.length > 0 && paged.every((n) => selectedIds.has(n.noteId));

  if (notes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No notes found.
      </div>
    );
  }

  const columns: { field: SortField; label: string; center?: boolean; width?: string }[] = [
    { field: "word", label: "Word" },
    { field: "sentence", label: "Sentence" },
    { field: "definition", label: "Definition" },
    { field: "audio", label: "Audio", center: true, width: "w-16" },
    { field: "image", label: "Image", center: true, width: "w-16" },
    { field: "created", label: "Created", width: "w-24" },
    { field: "modified", label: "Modified", width: "w-24" },
    { field: "tags", label: "Tags" },
  ];

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={pageAllSelected}
                  onChange={onSelectAll}
                  className="rounded"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={col.field}
                  className={cn(
                    "p-3 font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground transition-colors",
                    col.center ? "text-center" : "text-left",
                    col.width
                  )}
                  onClick={() => handleSort(col.field)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    <SortIcon
                      active={sortField === col.field}
                      dir={sortDir}
                    />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((note) => {
              const word = getFieldValue(note, "Word");
              const sentence = stripHtml(
                getFieldValue(note, "Main Sentence")
              );
              const definition = stripHtml(
                getFieldValue(note, "Definition")
              );
              const hasAudio = !!getFieldValue(note, "Audio");
              const hasImage = !!getFieldValue(note, "Picture");
              const selected = selectedIds.has(note.noteId);

              return (
                <tr
                  key={note.noteId}
                  className={cn(
                    "border-b transition-colors",
                    selected ? "bg-accent" : "hover:bg-muted/30"
                  )}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleSelect(note.noteId)}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3 font-medium">{word}</td>
                  <td className="max-w-xs truncate p-3 text-muted-foreground">
                    {sentence}
                  </td>
                  <td className="max-w-xs truncate p-3 text-muted-foreground">
                    {definition || "—"}
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        hasAudio ? "bg-success" : "bg-border"
                      )}
                    />
                  </td>
                  <td className="p-3 text-center">
                    <span
                      className={cn(
                        "inline-block h-2 w-2 rounded-full",
                        hasImage ? "bg-success" : "bg-border"
                      )}
                    />
                  </td>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap" title={new Date(note.noteId).toLocaleString()}>
                    {formatDate(note.noteId)}
                  </td>
                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap" title={note.mod ? new Date(note.mod * 1000).toLocaleString() : ""}>
                    {note.mod ? formatDate(note.mod * 1000) : "—"}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {note.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>
            Showing {(safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
          </span>
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="rounded border border-border bg-background px-2 py-1 text-xs"
          >
            {[20, 50, 100].map((s) => (
              <option key={s} value={s}>
                {s} / page
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={safePage === 1}
            className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            First
          </button>
          <button
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage === 1}
            className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span className="px-2">
            Page {safePage} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage === totalPages}
            className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={safePage === totalPages}
            className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Last
          </button>
        </div>
      </div>
    </div>
  );
}
