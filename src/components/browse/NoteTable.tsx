"use client";

import type { AnkiNote } from "@/types/anki";
import { cn } from "@/lib/utils";

interface NoteTableProps {
  notes: AnkiNote[];
  selectedIds: Set<number>;
  onToggleSelect: (noteId: number) => void;
  onSelectAll: () => void;
}

function getFieldValue(note: AnkiNote, field: string): string {
  return note.fields[field]?.value || "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

export function NoteTable({
  notes,
  selectedIds,
  onToggleSelect,
  onSelectAll,
}: NoteTableProps) {
  if (notes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No notes found.
      </div>
    );
  }

  const allSelected = notes.every((n) => selectedIds.has(n.noteId));

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="w-10 p-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onSelectAll}
                className="rounded"
              />
            </th>
            <th className="p-3 text-left font-medium text-muted-foreground">
              Word
            </th>
            <th className="p-3 text-left font-medium text-muted-foreground">
              Sentence
            </th>
            <th className="p-3 text-left font-medium text-muted-foreground">
              Definition
            </th>
            <th className="w-20 p-3 text-center font-medium text-muted-foreground">
              Audio
            </th>
            <th className="w-20 p-3 text-center font-medium text-muted-foreground">
              Image
            </th>
            <th className="p-3 text-left font-medium text-muted-foreground">
              Tags
            </th>
          </tr>
        </thead>
        <tbody>
          {notes.map((note) => {
            const word = getFieldValue(note, "Word");
            const sentence = stripHtml(getFieldValue(note, "Main Sentence"));
            const definition = stripHtml(getFieldValue(note, "Definition"));
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
  );
}
