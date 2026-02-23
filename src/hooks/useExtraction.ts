"use client";

import { useState, useCallback } from "react";
import type { ExtractedPage, SpellingCard } from "@/types/spelling";
import {
  buildMainSentence,
  buildCloze,
  buildSpellingCard,
} from "@/lib/card-builder";

type ExtractionStep =
  | "idle"
  | "extracting"
  | "review"
  | "submitting"
  | "done"
  | "error";

interface ExtractionState {
  step: ExtractionStep;
  files: File[];
  pages: ExtractedPage[];
  cards: SpellingCard[];
  error: string | null;
  submitResult: { created: number; failed: number } | null;
}

export function useExtraction() {
  const [state, setState] = useState<ExtractionState>({
    step: "idle",
    files: [],
    pages: [],
    cards: [],
    error: null,
    submitResult: null,
  });

  const setFiles = useCallback((files: File[]) => {
    setState((s) => ({ ...s, files, step: "idle", error: null }));
  }, []);

  /** Upload files and extract via Claude Code CLI in the background */
  const extract = useCallback(async () => {
    if (state.files.length === 0) return;

    setState((s) => ({ ...s, step: "extracting", error: null }));

    try {
      const formData = new FormData();
      state.files.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Extraction failed");
      }

      const data = await res.json();
      const pages: ExtractedPage[] = data.pages;

      const cards: SpellingCard[] = [];
      for (const page of pages) {
        for (const sentence of page.sentences) {
          cards.push(buildSpellingCard(sentence, page.termWeek, page.topic));
        }
      }

      // Check for duplicates (non-blocking)
      try {
        const wordList = cards.map((c) => c.word).join(",");
        const dupRes = await fetch(
          `/api/anki/notes?checkDuplicates=${encodeURIComponent(wordList)}`
        );
        if (dupRes.ok) {
          const dupData = await dupRes.json();
          const dupSet = new Set(
            (dupData.duplicates as string[]).map((w) => w.toLowerCase())
          );
          for (const card of cards) {
            if (dupSet.has(card.word.toLowerCase())) {
              card.isDuplicate = true;
            }
          }
        }
      } catch {
        // Duplicate check failed — skip silently
      }

      setState((s) => ({
        ...s,
        step: "review",
        pages,
        cards,
      }));
    } catch (error) {
      setState((s) => ({
        ...s,
        step: "error",
        error: error instanceof Error ? error.message : "Extraction failed",
      }));
    }
  }, [state.files]);

  const updateCard = useCallback(
    (cardId: string, updates: { word?: string; sentence?: string }) => {
      setState((s) => ({
        ...s,
        cards: s.cards.map((card) => {
          if (card.id !== cardId) return card;
          const newWord = updates.word ?? card.word;
          const newSentence = updates.sentence ?? card.sentence;
          return {
            ...card,
            word: newWord,
            sentence: newSentence,
            mainSentence: buildMainSentence(newSentence, newWord),
            cloze: buildCloze(newSentence, newWord),
            edited: true,
          };
        }),
      }));
    },
    []
  );

  const removeCard = useCallback((cardId: string) => {
    setState((s) => ({
      ...s,
      cards: s.cards.filter((c) => c.id !== cardId),
    }));
  }, []);

  const submit = useCallback(async () => {
    if (state.cards.length === 0) return;

    setState((s) => ({ ...s, step: "submitting", error: null }));

    try {
      const { cardToAnkiNote } = await import("@/lib/card-builder");
      const notes = state.cards.map((c) => cardToAnkiNote(c));

      const res = await fetch("/api/anki/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Submit failed");
      }

      const data = await res.json();
      setState((s) => ({
        ...s,
        step: "done",
        submitResult: data.summary,
      }));
    } catch (error) {
      setState((s) => ({
        ...s,
        step: "error",
        error: error instanceof Error ? error.message : "Submit failed",
      }));
    }
  }, [state.cards]);

  const reset = useCallback(() => {
    setState({
      step: "idle",
      files: [],
      pages: [],
      cards: [],
      error: null,
      submitResult: null,
    });
  }, []);

  return {
    ...state,
    setFiles,
    extract,
    updateCard,
    removeCard,
    submit,
    reset,
  };
}
