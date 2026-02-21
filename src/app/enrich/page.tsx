"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { cn } from "@/lib/utils";
import type { AnkiNote } from "@/types/anki";
import type { EnrichField } from "@/app/api/enrich/route";
import type { BatchEnrichResponse, BatchEnrichResultItem } from "@/types/enrichment";
import {
  RefreshCw,
  Sparkles,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Save,
  Volume2,
  Zap,
  ImageIcon,
} from "lucide-react";
import { DistributionTargets, DistributionStatus } from "@/components/shared/DistributionTargets";
import type { DistributeResult } from "@/types/anki";

function getFieldValue(note: AnkiNote, field: string): string {
  return note.fields[field]?.value || "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function AudioPreview({ base64, label }: { base64: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Volume2 className="h-3.5 w-3.5 text-success shrink-0" />
      <span className="text-muted-foreground">{label}:</span>
      <audio controls className="h-8" preload="none">
        <source src={`data:audio/mp3;base64,${base64}`} type="audio/mpeg" />
      </audio>
    </div>
  );
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
      audio: {
        available: true,
        filled: !!getFieldValue(note, "Audio"),
        label: "Word Audio",
      },
      sentence_audio: {
        available: hasSentence,
        filled: !!getFieldValue(note, "Main Sentence Audio"),
        label: "Sentence Audio",
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
  batchEnriching,
}: {
  note: AnkiNote;
  state: NoteEnrichState;
  onToggleField: (field: EnrichField) => void;
  onEnrich: () => void;
  onSave: () => void;
  onToggleExpand: () => void;
  batchEnriching?: boolean;
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
                                  : key === "audio"
                                    ? "Has audio"
                                    : key === "sentence_audio"
                                      ? "Has audio"
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
                      disabled={state.enriching || !!batchEnriching}
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
              {!!state.results.sentence && (
                <p>
                  <span className="text-muted-foreground">Sentence:</span>{" "}
                  {state.results.sentence as string}
                </p>
              )}
              {!!state.results.definition && (
                <p>
                  <span className="text-muted-foreground">Definition:</span>{" "}
                  {stripHtml(state.results.definition as string)}
                </p>
              )}
              {!!state.results.phonetic && (
                <p>
                  <span className="text-muted-foreground">Phonetic:</span>{" "}
                  {state.results.phonetic as string}
                </p>
              )}
              {!!state.results.synonyms && (
                <p>
                  <span className="text-muted-foreground">Synonyms:</span>{" "}
                  {Array.isArray(state.results.synonyms)
                    ? (state.results.synonyms as string[]).join(", ")
                    : String(state.results.synonyms)}
                </p>
              )}
              {!!state.results.extra_info && (
                <p>
                  <span className="text-muted-foreground">Extra:</span>{" "}
                  {stripHtml(state.results.extra_info as string)}
                </p>
              )}
              {!!state.results.image && (
                <p className="text-success">Image generated</p>
              )}
              {!!state.results.image_error && (
                <p className="text-destructive">
                  Image: {state.results.image_error as string}
                </p>
              )}
              {!!state.results.audio && (
                <AudioPreview
                  base64={(state.results.audio as { base64: string }).base64}
                  label="Word Audio"
                />
              )}
              {!!state.results.audio_error && (
                <p className="text-destructive">
                  Word Audio: {state.results.audio_error as string}
                </p>
              )}
              {!!state.results.sentence_audio && (
                <AudioPreview
                  base64={(state.results.sentence_audio as { base64: string }).base64}
                  label="Sentence Audio"
                />
              )}
              {!!state.results.sentence_audio_error && (
                <p className="text-destructive">
                  Sentence Audio: {state.results.sentence_audio_error as string}
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
              disabled={state.enriching || batchEnriching || state.selectedFields.size === 0}
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
  const [batchEnriching, setBatchEnriching] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [batchProgress, setBatchProgress] = useState("");
  const [autoEnrichPhase, setAutoEnrichPhase] = useState<string | null>(null);
  const autoEnrichTriggered = useRef(false);
  const [distTargets, setDistTargets] = useState<string[]>([]);
  const distTargetsRef = useRef(distTargets);
  distTargetsRef.current = distTargets;
  const [distResults, setDistResults] = useState<DistributeResult[] | null>(null);
  const [distributing, setDistributing] = useState(false);

  const distribute = useCallback(async (noteIds: number[], targets: string[], mediaFiles?: { filename: string; data: string }[]) => {
    if (noteIds.length === 0 || targets.length === 0) return;
    setDistributing(true);
    setDistResults(null);
    try {
      const body: Record<string, unknown> = { noteIds, targetProfiles: targets };
      if (mediaFiles && mediaFiles.length > 0) {
        body.mediaFiles = mediaFiles;
      }
      const res = await fetch("/api/anki/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setDistResults(data.results);
      }
    } catch {
      // best-effort
    } finally {
      setDistributing(false);
    }
  }, []);

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

    // Handle audio: store MP3 in Anki media, set [sound:filename] format
    if (r.audio && typeof r.audio === "object") {
      const audio = r.audio as { base64: string; format: string };
      const word = getFieldValue(note, "Word").replace(/\s+/g, "_");
      const filename = `spelling_${word}_${noteId}.mp3`;

      try {
        await fetch("/api/anki/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, data: audio.base64 }),
        });
        fields["Audio"] = `[sound:${filename}]`;
      } catch {
        // Audio save failed, skip
      }
    }

    // Handle sentence audio
    if (r.sentence_audio && typeof r.sentence_audio === "object") {
      const audio = r.sentence_audio as { base64: string; format: string };
      const word = getFieldValue(note, "Word").replace(/\s+/g, "_");
      const filename = `spelling_${word}_${noteId}_sentence.mp3`;

      try {
        await fetch("/api/anki/media", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename, data: audio.base64 }),
        });
        fields["Main Sentence Audio"] = `[sound:${filename}]`;
      } catch {
        // Sentence audio save failed, skip
      }
    }

    if (Object.keys(fields).length === 0) return;

    // Collect media files for distribution
    const mediaFiles: { filename: string; data: string }[] = [];

    if (r.image && typeof r.image === "object") {
      const img = r.image as { base64: string; mimeType: string };
      const ext = img.mimeType.includes("png") ? "png" : "jpg";
      const cleanWord = getFieldValue(note, "Word").replace(/\s+/g, "_");
      const imgFilename = `spelling_${cleanWord}_${noteId}.${ext}`;
      mediaFiles.push({ filename: imgFilename, data: img.base64 });
    }
    if (r.audio && typeof r.audio === "object") {
      const audio = r.audio as { base64: string };
      const cleanWord = getFieldValue(note, "Word").replace(/\s+/g, "_");
      const audioFilename = `spelling_${cleanWord}_${noteId}.mp3`;
      mediaFiles.push({ filename: audioFilename, data: audio.base64 });
    }
    if (r.sentence_audio && typeof r.sentence_audio === "object") {
      const audio = r.sentence_audio as { base64: string };
      const cleanWord = getFieldValue(note, "Word").replace(/\s+/g, "_");
      const sentAudioFilename = `spelling_${cleanWord}_${noteId}_sentence.mp3`;
      mediaFiles.push({ filename: sentAudioFilename, data: audio.base64 });
    }

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

      // Distribute to target profiles (with media)
      if (distTargets.length > 0) {
        distribute([noteId], distTargets, mediaFiles.length > 0 ? mediaFiles : undefined);
      }

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

  const enrichAllEmpty = async () => {
    // Collect cards with any empty text fields
    const textFieldKeys: EnrichField[] = [
      "sentence", "definition", "phonetic", "synonyms", "extra_info",
    ];

    const cardsToEnrich: { noteId: number; word: string; sentence?: string; emptyFields: EnrichField[] }[] = [];

    for (const note of notes) {
      const info = getEnrichableFields(note);
      const emptyTextFields = textFieldKeys.filter(
        (f) => info.fields[f]?.available && !info.fields[f]?.filled
      );
      if (emptyTextFields.length > 0) {
        cardsToEnrich.push({
          noteId: note.noteId,
          word: info.word,
          sentence: info.hasSentence ? info.sentence : undefined,
          emptyFields: emptyTextFields,
        });
      }
    }

    if (cardsToEnrich.length === 0) return;

    setBatchEnriching(true);
    setBatchProgress(`Enriching ${cardsToEnrich.length} cards...`);

    // Mark all batch cards as enriching
    setNoteStates((prev) => {
      const next = { ...prev };
      for (const c of cardsToEnrich) {
        next[c.noteId] = { ...next[c.noteId], enriching: true, error: null, saved: false };
      }
      return next;
    });

    try {
      // Determine which fields are needed (union of all empty fields)
      const allFields = [...new Set(cardsToEnrich.flatMap((c) => c.emptyFields))];

      const res = await fetch("/api/enrich/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: cardsToEnrich.map((c) => ({
            noteId: c.noteId,
            word: c.word,
            sentence: c.sentence,
          })),
          fields: allFields,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Batch enrichment failed");
      }

      const data: BatchEnrichResponse = await res.json();
      setBatchProgress(`Done: ${data.succeeded} succeeded, ${data.failed} failed`);

      // Distribute results to per-card state
      setNoteStates((prev) => {
        const next = { ...prev };
        for (const item of data.results) {
          const existing = next[item.noteId];
          if (!existing) continue;

          if (item.error) {
            next[item.noteId] = {
              ...existing,
              enriching: false,
              error: item.error,
            };
          } else {
            // Build results object compatible with single-card format
            const results: Record<string, unknown> = { noteId: item.noteId, word: item.word };
            if (item.sentence) results.sentence = item.sentence;
            if (item.definition) results.definition = item.definition;
            if (item.phonetic) results.phonetic = item.phonetic;
            if (item.synonyms) results.synonyms = item.synonyms;
            if (item.extra_info) results.extra_info = item.extra_info;

            next[item.noteId] = {
              ...existing,
              enriching: false,
              results: existing.results
                ? { ...existing.results, ...results }
                : results,
              expanded: true,
            };
          }
        }
        return next;
      });
    } catch (err) {
      // Mark all batch cards with error
      setNoteStates((prev) => {
        const next = { ...prev };
        for (const c of cardsToEnrich) {
          next[c.noteId] = {
            ...next[c.noteId],
            enriching: false,
            error: err instanceof Error ? err.message : "Batch failed",
          };
        }
        return next;
      });
      setBatchProgress("");
    } finally {
      setBatchEnriching(false);
    }
  };

  const saveAll = async () => {
    const unsavedNoteIds = notes
      .filter((n) => noteStates[n.noteId]?.results && !noteStates[n.noteId]?.saved)
      .map((n) => n.noteId);

    if (unsavedNoteIds.length === 0) return;

    setSavingAll(true);
    setBatchProgress(`Saving ${unsavedNoteIds.length} cards...`);

    let savedCount = 0;
    for (const noteId of unsavedNoteIds) {
      await save(noteId);
      savedCount++;
      setBatchProgress(`Saved ${savedCount}/${unsavedNoteIds.length}...`);
    }

    setBatchProgress(`All ${savedCount} cards saved`);
    setSavingAll(false);
  };

  const generateAllAudio = async () => {
    // Collect cards missing audio
    const cardsNeedingAudio: { noteId: number; word: string; sentence?: string; fields: EnrichField[] }[] = [];

    for (const note of notes) {
      const info = getEnrichableFields(note);
      const audioFields: EnrichField[] = [];
      if (!info.fields.audio.filled) audioFields.push("audio");
      if (info.fields.sentence_audio.available && !info.fields.sentence_audio.filled) audioFields.push("sentence_audio");
      if (audioFields.length > 0) {
        cardsNeedingAudio.push({
          noteId: note.noteId,
          word: info.word,
          sentence: info.hasSentence ? info.sentence : undefined,
          fields: audioFields,
        });
      }
    }

    if (cardsNeedingAudio.length === 0) return;

    setBatchEnriching(true);
    setBatchProgress(`Audio 0/${cardsNeedingAudio.length}...`);

    // Mark all cards as enriching
    setNoteStates((prev) => {
      const next = { ...prev };
      for (const c of cardsNeedingAudio) {
        next[c.noteId] = { ...next[c.noteId], enriching: true, error: null };
      }
      return next;
    });

    for (let i = 0; i < cardsNeedingAudio.length; i++) {
      const card = cardsNeedingAudio[i];
      setBatchProgress(`Audio ${i + 1}/${cardsNeedingAudio.length}: ${card.word}...`);

      try {
        const res = await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: card.noteId,
            word: card.word,
            sentence: card.sentence,
            fields: card.fields,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Audio generation failed");
        }

        const results = await res.json();
        setNoteStates((prev) => ({
          ...prev,
          [card.noteId]: {
            ...prev[card.noteId],
            enriching: false,
            results: prev[card.noteId].results
              ? { ...prev[card.noteId].results, ...results }
              : results,
            expanded: true,
          },
        }));
      } catch (err) {
        setNoteStates((prev) => ({
          ...prev,
          [card.noteId]: {
            ...prev[card.noteId],
            enriching: false,
            error: err instanceof Error ? err.message : "Audio failed",
          },
        }));
      }
    }

    setBatchProgress(`Audio done for ${cardsNeedingAudio.length} cards`);
    setBatchEnriching(false);
  };

  const generateAllImages = async () => {
    // Collect cards where image is available (has sentence) AND not filled
    const cardsNeedingImages: { noteId: number; word: string; sentence: string }[] = [];

    for (const note of notes) {
      const info = getEnrichableFields(note);
      if (info.fields.image.available && !info.fields.image.filled) {
        cardsNeedingImages.push({
          noteId: note.noteId,
          word: info.word,
          sentence: info.sentence,
        });
      }
    }

    if (cardsNeedingImages.length === 0) return;

    setBatchEnriching(true);
    setBatchProgress(`Images 0/${cardsNeedingImages.length}...`);

    // Mark all cards as enriching
    setNoteStates((prev) => {
      const next = { ...prev };
      for (const c of cardsNeedingImages) {
        next[c.noteId] = { ...next[c.noteId], enriching: true, error: null };
      }
      return next;
    });

    for (let i = 0; i < cardsNeedingImages.length; i++) {
      const card = cardsNeedingImages[i];
      setBatchProgress(`Images ${i + 1}/${cardsNeedingImages.length}: ${card.word}...`);

      try {
        const res = await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: card.noteId,
            word: card.word,
            sentence: card.sentence,
            fields: ["image"],
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Image generation failed");
        }

        const results = await res.json();
        setNoteStates((prev) => ({
          ...prev,
          [card.noteId]: {
            ...prev[card.noteId],
            enriching: false,
            results: prev[card.noteId].results
              ? { ...prev[card.noteId].results, ...results }
              : results,
            expanded: true,
          },
        }));
      } catch (err) {
        setNoteStates((prev) => ({
          ...prev,
          [card.noteId]: {
            ...prev[card.noteId],
            enriching: false,
            error: err instanceof Error ? err.message : "Image failed",
          },
        }));
      }
    }

    setBatchProgress(`Images done for ${cardsNeedingImages.length} cards`);
    setBatchEnriching(false);
  };

  // Auto-enrich pipeline: text → save → audio → save
  const runAutoEnrichPipeline = useCallback(async (currentNotes: AnkiNote[]) => {
    const textFieldKeys: EnrichField[] = [
      "sentence", "definition", "phonetic", "synonyms", "extra_info",
    ];

    // Phase 1: Batch text enrichment
    setAutoEnrichPhase("Generating text fields...");
    setBatchEnriching(true);

    const cardsToEnrich = currentNotes.map((note) => {
      const info = getEnrichableFields(note);
      const emptyFields = textFieldKeys.filter(
        (f) => info.fields[f]?.available && !info.fields[f]?.filled
      );
      return {
        noteId: note.noteId,
        word: info.word,
        sentence: info.hasSentence ? info.sentence : undefined,
        emptyFields,
      };
    }).filter((c) => c.emptyFields.length > 0);

    let batchResults: BatchEnrichResultItem[] = [];

    if (cardsToEnrich.length > 0) {
      const allFields = [...new Set(cardsToEnrich.flatMap((c) => c.emptyFields))];

      try {
        setBatchProgress(`Enriching ${cardsToEnrich.length} cards...`);
        const res = await fetch("/api/enrich/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cards: cardsToEnrich.map((c) => ({
              noteId: c.noteId,
              word: c.word,
              sentence: c.sentence,
            })),
            fields: allFields,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Batch enrichment failed");
        }

        const data: BatchEnrichResponse = await res.json();
        batchResults = data.results;
        setBatchProgress(`Text: ${data.succeeded} succeeded, ${data.failed} failed`);
      } catch (err) {
        setAutoEnrichPhase(`Text enrichment failed: ${err instanceof Error ? err.message : "Unknown error"}`);
        setBatchEnriching(false);
        return;
      }
    }

    // Phase 2: Save text results to Anki
    setAutoEnrichPhase("Saving text to Anki...");
    const successResults = batchResults.filter((r) => !r.error);
    let savedCount = 0;

    for (const item of successResults) {
      const fields: Record<string, string> = {};
      if (item.sentence) {
        const escaped = item.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(${escaped})`, "i");
        fields["Main Sentence"] = item.sentence.replace(
          regex,
          '<span class="nodeword">$1</span>'
        );
        fields["Cloze"] = item.sentence.replace(regex, "{{c1::$1}}");
      }
      if (item.definition) fields["Definition"] = item.definition;
      if (item.phonetic) fields["Phonetic symbol"] = item.phonetic;
      if (item.synonyms) {
        fields["Synonyms"] = Array.isArray(item.synonyms)
          ? item.synonyms.join(", ")
          : String(item.synonyms);
      }
      if (item.extra_info) fields["Extra information"] = item.extra_info;

      if (Object.keys(fields).length > 0) {
        try {
          await fetch(`/api/anki/notes/${item.noteId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields }),
          });
          savedCount++;
          setBatchProgress(`Saved text ${savedCount}/${successResults.length}...`);
        } catch {
          // Continue saving other cards
        }
      }
    }

    // Phase 3: Generate audio for each card
    setAutoEnrichPhase("Generating audio...");
    const audioResults: { noteId: number; word: string; data: Record<string, unknown> }[] = [];

    for (let i = 0; i < currentNotes.length; i++) {
      const note = currentNotes[i];
      const word = getFieldValue(note, "Word");
      // Use sentence from batch results if available, or existing sentence
      const batchItem = batchResults.find((r) => r.noteId === note.noteId);
      const sentence = batchItem?.sentence || stripHtml(getFieldValue(note, "Main Sentence")) || undefined;

      const audioFields: EnrichField[] = ["audio"];
      if (sentence) audioFields.push("sentence_audio");

      setBatchProgress(`Audio ${i + 1}/${currentNotes.length}: ${word}...`);

      try {
        const res = await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: note.noteId,
            word,
            sentence,
            fields: audioFields,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          audioResults.push({ noteId: note.noteId, word, data });
        }
      } catch {
        // Continue with other cards
      }
    }

    // Phase 4: Save audio to Anki (collect media for distribution)
    setAutoEnrichPhase("Saving audio...");
    let audioSaved = 0;
    const collectedMedia: { filename: string; data: string }[] = [];

    for (const { noteId, word, data } of audioResults) {
      const fields: Record<string, string> = {};
      const cleanWord = word.replace(/\s+/g, "_");

      if (data.audio && typeof data.audio === "object") {
        const audio = data.audio as { base64: string };
        const filename = `spelling_${cleanWord}_${noteId}.mp3`;
        try {
          await fetch("/api/anki/media", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, data: audio.base64 }),
          });
          fields["Audio"] = `[sound:${filename}]`;
          collectedMedia.push({ filename, data: audio.base64 });
        } catch { /* skip */ }
      }

      if (data.sentence_audio && typeof data.sentence_audio === "object") {
        const audio = data.sentence_audio as { base64: string };
        const filename = `spelling_${cleanWord}_${noteId}_sentence.mp3`;
        try {
          await fetch("/api/anki/media", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename, data: audio.base64 }),
          });
          fields["Main Sentence Audio"] = `[sound:${filename}]`;
          collectedMedia.push({ filename, data: audio.base64 });
        } catch { /* skip */ }
      }

      if (Object.keys(fields).length > 0) {
        try {
          await fetch(`/api/anki/notes/${noteId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fields }),
          });
          audioSaved++;
          setBatchProgress(`Saved audio ${audioSaved}/${audioResults.length}...`);
        } catch { /* skip */ }
      }
    }

    // Distribute to target profiles (with media)
    const targets = distTargetsRef.current;
    if (targets.length > 0) {
      setAutoEnrichPhase("Distributing to other profiles...");
      const allNoteIds = currentNotes.map((n) => n.noteId);
      await distribute(allNoteIds, targets, collectedMedia.length > 0 ? collectedMedia : undefined);
    }

    // Done — build summary
    const textFailed = batchResults.filter((r) => r.error).length;
    const audioFailed = currentNotes.length - audioResults.length;
    if (textFailed === 0 && audioFailed === 0) {
      setAutoEnrichPhase("Done! All cards enriched.");
    } else {
      const parts: string[] = ["Done!"];
      if (textFailed > 0) parts.push(`${textFailed} text failed`);
      if (audioFailed > 0) parts.push(`${audioFailed} audio failed`);
      setAutoEnrichPhase(parts.join(" "));
    }
    setBatchEnriching(false);
    setBatchProgress("");
    fetchNotes();
  }, [fetchNotes, distribute]);

  // Trigger auto-enrich when notes loaded and autoEnrich param present
  useEffect(() => {
    const shouldAutoEnrich = searchParams.get("autoEnrich") === "true";
    if (
      !shouldAutoEnrich ||
      notes.length === 0 ||
      loading ||
      autoEnrichTriggered.current
    )
      return;

    autoEnrichTriggered.current = true;

    // Remove autoEnrich param from URL to prevent re-trigger on refresh
    const url = new URL(window.location.href);
    url.searchParams.delete("autoEnrich");
    window.history.replaceState({}, "", url.toString());

    runAutoEnrichPipeline(notes);
  }, [notes, loading, searchParams, runAutoEnrichPipeline]);

  // Count cards with empty text fields
  const cardsWithEmptyText = notes.filter((note) => {
    const info = getEnrichableFields(note);
    return ["sentence", "definition", "phonetic", "synonyms", "extra_info"].some(
      (f) => info.fields[f as EnrichField]?.available && !info.fields[f as EnrichField]?.filled
    );
  }).length;

  // Count cards with missing audio
  const cardsWithMissingAudio = notes.filter((note) => {
    const info = getEnrichableFields(note);
    return (
      !info.fields.audio.filled ||
      (info.fields.sentence_audio.available && !info.fields.sentence_audio.filled)
    );
  }).length;

  // Count cards with missing images (available = has sentence, not filled)
  const cardsWithMissingImages = notes.filter((note) => {
    const info = getEnrichableFields(note);
    return info.fields.image.available && !info.fields.image.filled;
  }).length;

  // Count unsaved results
  const unsavedCount = notes.filter(
    (n) => noteStates[n.noteId]?.results && !noteStates[n.noteId]?.saved
  ).length;

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
          disabled={batchEnriching || savingAll}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-40"
        >
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* Distribution targets */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <DistributionTargets
          selected={distTargets}
          onChange={setDistTargets}
        />
        <DistributionStatus results={distResults} loading={distributing} />
      </div>

      {/* Batch toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <button
          onClick={enrichAllEmpty}
          disabled={batchEnriching || savingAll || cardsWithEmptyText === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {batchEnriching ? (
            <LoadingSpinner size="sm" className="text-primary-foreground" />
          ) : (
            <Zap className="h-3.5 w-3.5" />
          )}
          {batchEnriching
            ? "Enriching..."
            : `Enrich All Empty (${cardsWithEmptyText})`}
        </button>

        <button
          onClick={generateAllAudio}
          disabled={batchEnriching || savingAll || cardsWithMissingAudio === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/80 px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {batchEnriching ? (
            <LoadingSpinner size="sm" className="text-primary-foreground" />
          ) : (
            <Volume2 className="h-3.5 w-3.5" />
          )}
          {batchEnriching
            ? "Generating..."
            : `Generate All Audio (${cardsWithMissingAudio})`}
        </button>

        <button
          onClick={generateAllImages}
          disabled={batchEnriching || savingAll || cardsWithMissingImages === 0}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/80 px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
        >
          {batchEnriching ? (
            <LoadingSpinner size="sm" className="text-primary-foreground" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
          {batchEnriching
            ? "Generating..."
            : `Generate All Images (${cardsWithMissingImages})`}
        </button>

        {unsavedCount > 0 && (
          <button
            onClick={saveAll}
            disabled={batchEnriching || savingAll}
            className="inline-flex items-center gap-1.5 rounded-md bg-success px-4 py-1.5 text-xs font-medium text-success-foreground hover:opacity-90 disabled:opacity-40"
          >
            {savingAll ? (
              <LoadingSpinner size="sm" className="text-success-foreground" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {savingAll ? "Saving..." : `Save All (${unsavedCount})`}
          </button>
        )}

        {batchProgress && (
          <span className="text-xs text-muted-foreground">{batchProgress}</span>
        )}
      </div>

      {/* Auto-enrich progress banner */}
      {autoEnrichPhase && (
        <div className={cn(
          "rounded-lg border p-4 text-sm",
          autoEnrichPhase === "Done! All cards enriched."
            ? "border-success/50 bg-success/5 text-success"
            : autoEnrichPhase.startsWith("Done!")
              ? "border-warning/50 bg-warning/5 text-warning"
              : autoEnrichPhase.includes("failed")
                ? "border-destructive/50 bg-destructive/5 text-destructive"
                : "border-primary/50 bg-primary/5 text-primary"
        )}>
          <div className="flex items-center gap-2">
            {!autoEnrichPhase.startsWith("Done") && !autoEnrichPhase.includes("failed") && (
              <LoadingSpinner size="sm" />
            )}
            {autoEnrichPhase.startsWith("Done") && (
              <Check className="h-4 w-4" />
            )}
            {autoEnrichPhase.includes("failed") && !autoEnrichPhase.startsWith("Done") && (
              <AlertCircle className="h-4 w-4" />
            )}
            <span className="font-medium">{autoEnrichPhase}</span>
          </div>
          {batchProgress && !autoEnrichPhase.startsWith("Done") && (
            <p className="mt-1 text-xs opacity-70">{batchProgress}</p>
          )}
        </div>
      )}

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
          batchEnriching={batchEnriching}
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
          Generate sentences, definitions, phonetics, synonyms, images, and audio
          for your cards
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
