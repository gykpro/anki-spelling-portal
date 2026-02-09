"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import type { AnkiNote } from "@/types/anki";

function getFieldValue(note: AnkiNote, field: string): string {
  return note.fields[field]?.value || "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

function EnrichContent() {
  const searchParams = useSearchParams();
  const [notes, setNotes] = useState<AnkiNote[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotes = useCallback(async () => {
    setLoading(true);
    try {
      const noteIdsParam = searchParams.get("noteIds");
      let url = "/api/anki/notes?limit=50";
      if (noteIdsParam) {
        // fetch specific notes
        const ids = noteIdsParam.split(",");
        url = `/api/anki/notes?q=${encodeURIComponent(
          ids.map((id) => `nid:${id}`).join(" OR ")
        )}&limit=50`;
      } else {
        url = `/api/anki/notes?q=${encodeURIComponent(
          'deck:"Gao English Spelling"'
        )}&limit=50`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setNotes(data.notes || []);
    } catch (err) {
      console.error("Failed to fetch notes:", err);
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No notes to enrich. Go to Browse to select cards first.
        </div>
      ) : (
        notes.map((note) => {
          const word = getFieldValue(note, "Word");
          const sentence = stripHtml(getFieldValue(note, "Main Sentence"));
          const definition = getFieldValue(note, "Definition");
          const phonetic = getFieldValue(note, "Phonetic symbol");
          const synonyms = getFieldValue(note, "Synonyms");
          const hasAudio = !!getFieldValue(note, "Audio");
          const hasImage = !!getFieldValue(note, "Picture");

          return (
            <div
              key={note.noteId}
              className="rounded-lg border border-border p-4"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold">{word}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {sentence}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <div className="rounded-md border border-border p-2.5">
                  <p className="font-medium text-muted-foreground">
                    Definition
                  </p>
                  <p className="mt-1">
                    {definition ? stripHtml(definition) : "—"}
                  </p>
                </div>
                <div className="rounded-md border border-border p-2.5">
                  <p className="font-medium text-muted-foreground">Phonetic</p>
                  <p className="mt-1">{phonetic || "—"}</p>
                </div>
                <div className="rounded-md border border-border p-2.5">
                  <p className="font-medium text-muted-foreground">Synonyms</p>
                  <p className="mt-1">
                    {synonyms ? stripHtml(synonyms) : "—"}
                  </p>
                </div>
                <div className="rounded-md border border-border p-2.5">
                  <p className="font-medium text-muted-foreground">Media</p>
                  <p className="mt-1">
                    Audio: {hasAudio ? "Yes" : "No"} | Image:{" "}
                    {hasImage ? "Yes" : "No"}
                  </p>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground italic">
                Enrichment actions will be available in Phase 2 & 3
              </p>
            </div>
          );
        })
      )}
    </div>
  );
}

export default function EnrichPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Enrich Cards</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add definitions, audio, and images to spelling cards
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
