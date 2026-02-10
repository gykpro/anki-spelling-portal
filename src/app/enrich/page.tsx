"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { cn } from "@/lib/utils";
import type { AnkiNote } from "@/types/anki";
import type { EnrichField } from "@/app/api/enrich/route";
import {
  RefreshCw,
  Sparkles,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Save,
} from "lucide-react";

function getFieldValue(note: AnkiNote, field: string): string {
  return note.fields[field]?.value || "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/** Determine which enrichment fields are available/needed for a note */
function getEnrichableFields(note: AnkiNote) {
  const word = getFieldValue(note, "Word");
  const sentence = getFieldValue(note, "Main Sentence");
  const hasSentence = !!sentence;

  return {
    word,
    sentence: stripHtml(sentence),
    hasSentence,
    fields: {
      sentence: { available: true, filled: hasSentence, label: "Sentence" },
      definition: {
        available: true,
        filled: !!getFieldValue(note, "Definition"),
        label: "Definition",
      },
      phonetic: {
        available: true,
        filled: !!getFieldValue(note, "Phonetic symbol"),
        label: "Phonetic",
      },
      synonyms: {
        available: true,
        filled: !!getFieldValue(note, "Synonyms"),
        label: "Synonyms",
      },
      extra_info: {
        available: true,
        filled: !!getFieldValue(note, "Extra information"),
        label: "Extra Examples",
      },
      image: {
        available: hasSentence,
        filled: !!getFieldValue(note, "Picture"),
        label: "Image",
      },
    } as Record<EnrichField, { available: boolean; filled: boolean; label: string }>,
  };
}

type NoteEnrichState = {
  enriching: boolean;
  selectedFields: Set<EnrichField>;
  results: Record<string, unknown> | null;
  saved: boolean;
  error: string | null;
  expanded: boolean;
};

function EnrichCard({
  note,
  state,
  onToggleField,
  onEnrich,
  onSave,
  onToggleExpand,
}: {
  note: AnkiNote;
  state: NoteEnrichState;
  onToggleField: (field: EnrichField) => void;
  onEnrich: () => void;
  onSave: () => void;
  onToggleExpand: () => void;
}) {
  const info = getEnrichableFields(note);
  const missingCount = Object.values(info.fields).filter(
    (f) => f.available && !f.filled
  ).length;

  return (
    <div className="rounded-lg border border-border">
      {/* Header */}
      <button
        onClick={onToggleExpand}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
      >
        {state.expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-semibold">{info.word}</span>
          {info.hasSentence && (
            <span className="ml-2 text-xs text-muted-foreground truncate">
              — {info.sentence}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {missingCount > 0 ? (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
              {missingCount} missing
            </span>
          ) : (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              Complete
            </span>
          )}
          {state.saved && (
            <Check className="h-4 w-4 text-success" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {state.expanded && (
        <div className="border-t border-border p-4 space-y-4">
          {/* Current field values */}
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
            {(Object.entries(info.fields) as [EnrichField, { available: boolean; filled: boolean; label: string }][]).map(
              ([key, f]) => (
                <div
                  key={key}
                  className={cn(
                    "rounded-md border p-2",
                    f.filled
                      ? "border-success/30 bg-success/5"
                      : f.available
                        ? "border-border"
                        : "border-border opacity-50"
                  )}
                >
                  <p className="font-medium text-muted-foreground">{f.label}</p>
                  <p className="mt-0.5 truncate">
                    {f.filled
                      ? key === "sentence"
                        ? info.sentence
                        : key === "definition"
                          ? stripHtml(getFieldValue(note, "Definition"))
                          : key === "phonetic"
                            ? getFieldValue(note, "Phonetic symbol")
                            : key === "synonyms"
                              ? stripHtml(getFieldValue(note, "Synonyms"))
                              : key === "image"
                                ? "Has image"
                                : key === "extra_info"
                                  ? "Has examples"
                                  : "—"
                      : f.available
                        ? "Empty"
                        : "Needs sentence"}
                  </p>
                </div>
              )
            )}
          </div>

          {/* Field selection */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Select fields to generate:
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(info.fields) as [EnrichField, { available: boolean; filled: boolean; label: string }][]).map(
                ([key, f]) => {
                  if (!f.available) return null;
                  const selected = state.selectedFields.has(key);
                  return (
                    <button
                      key={key}
                      onClick={() => onToggleField(key)}
                      disabled={state.enriching}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : f.filled
                            ? "border-success/50 text-success hover:bg-success/10"
                            : "border-border text-muted-foreground hover:bg-muted"
                      )}
                    >
                      {f.label}
                      {f.filled && !selected && (
                        <span className="ml-1 opacity-60">(has)</span>
                      )}
                    </button>
                  );
                }
              )}
              <button
                onClick={() => {
                  // Select all empty available fields
                  Object.entries(info.fields).forEach(([key, f]) => {
                    if (f.available && !f.filled && !state.selectedFields.has(key as EnrichField)) {
                      onToggleField(key as EnrichField);
                    }
                  });
                }}
                disabled={state.enriching}
                className="rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
              >
                Select all empty
              </button>
            </div>
          </div>

          {/* Results preview */}
          {state.results && (
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
              <p className="font-medium">Generated results:</p>
              {state.results.sentence && (
                <p>
                  <span className="text-muted-foreground">Sentence:</span>{" "}
                  {state.results.sentence as string}
                </p>
              )}
              {state.results.definition && (
                <p>
                  <span className="text-muted-foreground">Definition:</span>{" "}
                  {stripHtml(state.results.definition as string)}
                </p>
              )}
              {state.results.phonetic && (
                <p>
                  <span className="text-muted-foreground">Phonetic:</span>{" "}
                  {state.results.phonetic as string}
                </p>
              )}
              {state.results.synonyms && (
                <p>
                  <span className="text-muted-foreground">Synonyms:</span>{" "}
                  {Array.isArray(state.results.synonyms)
                    ? (state.results.synonyms as string[]).join(", ")
                    : String(state.results.synonyms)}
                </p>
              )}
              {state.results.extra_info && (
                <p>
                  <span className="text-muted-foreground">Extra:</span>{" "}
                  {stripHtml(state.results.extra_info as string)}
                </p>
              )}
              {state.results.image && (
                <p className="text-success">Image generated</p>
              )}
              {state.results.image_error && (
                <p className="text-destructive">
                  Image: {state.results.image_error as string}
                </p>
              )}
            </div>
          )}

          {/* Error */}
          {state.error && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/5 p-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {state.error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={onEnrich}
              disabled={state.enriching || state.selectedFields.size === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {state.enriching ? (
                <LoadingSpinner size="sm" className="text-primary-foreground" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {state.enriching ? "Generating..." : "Generate"}
            </button>
            {state.results && !state.saved && (
              <button
                onClick={onSave}
                className="inline-flex items-center gap-1.5 rounded-md bg-success px-4 py-1.5 text-xs font-medium text-success-foreground hover:opacity-90"
              >
                <Save className="h-3.5 w-3.5" /> Save to Anki
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EnrichContent() {
  const searchParams = useSearchParams();
  const [notes, setNotes] = useState<AnkiNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [noteStates, setNoteStates] = useState<Record<number, NoteEnrichState>>(
    {}
  );

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const noteIdsParam = searchParams.get("noteIds");
      let url: string;
      if (noteIdsParam) {
        const ids = noteIdsParam.split(",");
        url = `/api/anki/notes?q=${encodeURIComponent(
          ids.map((id) => `nid:${id}`).join(" OR ")
        )}&limit=100`;
      } else {
        url = `/api/anki/notes?q=${encodeURIComponent(
          'deck:"Gao English Spelling"'
        )}&limit=100`;
      }
      const res = await fetch(url);
      const data = await res.json();
      const fetched: AnkiNote[] = data.notes || [];
      setNotes(fetched);

      // Init states
      const states: Record<number, NoteEnrichState> = {};
      for (const note of fetched) {
        states[note.noteId] = {
          enriching: false,
          selectedFields: new Set(),
          results: null,
          saved: false,
          error: null,
          expanded: false,
        };
      }
      setNoteStates(states);
    } catch (err) {
      console.error("Failed to fetch notes:", err);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const toggleField = (noteId: number, field: EnrichField) => {
    setNoteStates((prev) => {
      const s = prev[noteId];
      const next = new Set(s.selectedFields);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return { ...prev, [noteId]: { ...s, selectedFields: next } };
    });
  };

  const toggleExpand = (noteId: number) => {
    setNoteStates((prev) => ({
      ...prev,
      [noteId]: { ...prev[noteId], expanded: !prev[noteId].expanded },
    }));
  };

  const enrich = async (noteId: number) => {
    const note = notes.find((n) => n.noteId === noteId);
    const state = noteStates[noteId];
    if (!note || !state || state.selectedFields.size === 0) return;

    setNoteStates((prev) => ({
      ...prev,
      [noteId]: { ...prev[noteId], enriching: true, error: null, saved: false },
    }));

    try {
      const word = getFieldValue(note, "Word");
      const sentence = stripHtml(getFieldValue(note, "Main Sentence")) || undefined;

      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId,
          word,
          sentence,
          fields: Array.from(state.selectedFields),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Enrichment failed");
      }

      const results = await res.json();
      setNoteStates((prev) => ({
        ...prev,
        [noteId]: { ...prev[noteId], enriching: false, results },
      }));
    } catch (err) {
      setNoteStates((prev) => ({
        ...prev,
        [noteId]: {
          ...prev[noteId],
          enriching: false,
          error: err instanceof Error ? err.message : "Failed",
        },
      }));
    }
  };

  const save = async (noteId: number) => {
    const state = noteStates[noteId];
    const note = notes.find((n) => n.noteId === noteId);
    if (!state?.results || !note) return;

    const r = state.results;
    const fields: Record<string, string> = {};

    if (r.sentence) {
      const word = getFieldValue(note, "Word");
      const sent = r.sentence as string;
      // Build Main Sentence and Cloze from generated sentence
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escaped})`, "i");
      fields["Main Sentence"] = sent.replace(
        regex,
        '<span class="nodeword">$1</span>'
      );
      fields["Cloze"] = sent.replace(regex, "{{c1::$1}}");
    }
    if (r.definition) fields["Definition"] = r.definition as string;
    if (r.phonetic) fields["Phonetic symbol"] = r.phonetic as string;
    if (r.synonyms) {
      const syns = Array.isArray(r.synonyms)
        ? (r.synonyms as string[]).join(", ")
        : String(r.synonyms);
      fields["Synonyms"] = syns;
    }
    if (r.extra_info) fields["Extra information"] = r.extra_info as string;

    // Handle image: store in Anki media, then set Picture field
    if (r.image && typeof r.image === "object") {
      const img = r.image as { base64: string; mimeType: string };
      const ext = img.mimeType.includes("png") ? "png" : "jpg";
      const word = getFieldValue(note, "Word").replace(/\s+/g, "_");
      const filename = `spelling_${word}_${noteId}.${ext}`;

      try {
        await fetch("/api/anki/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, data: img.base64 }),
        });
        fields["Picture"] = `<img src="${filename}">`;
      } catch {
        // Image save failed, skip
      }
    }

    if (Object.keys(fields).length === 0) return;

    try {
      const res = await fetch(`/api/anki/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      });

      if (!res.ok) throw new Error("Save failed");

      setNoteStates((prev) => ({
        ...prev,
        [noteId]: { ...prev[noteId], saved: true },
      }));

      // Refresh the note data
      fetchNotes();
    } catch (err) {
      setNoteStates((prev) => ({
        ...prev,
        [noteId]: {
          ...prev[noteId],
          error: err instanceof Error ? err.message : "Save failed",
        },
      }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        No notes to enrich. Go to Browse to select cards, or add words via Quick
        Add.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {notes.length} cards loaded
        </p>
        <button
          onClick={fetchNotes}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>
      {notes.map((note) => (
        <EnrichCard
          key={note.noteId}
          note={note}
          state={
            noteStates[note.noteId] || {
              enriching: false,
              selectedFields: new Set(),
              results: null,
              saved: false,
              error: null,
              expanded: false,
            }
          }
          onToggleField={(f) => toggleField(note.noteId, f)}
          onEnrich={() => enrich(note.noteId)}
          onSave={() => save(note.noteId)}
          onToggleExpand={() => toggleExpand(note.noteId)}
        />
      ))}
    </div>
  );
}

export default function EnrichPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Enrich Cards</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate sentences, definitions, phonetics, synonyms, and images for
          your cards
        </p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        }
      >
        <EnrichContent />
      </Suspense>
    </div>
  );
}
