"use client";

import { useState, useCallback } from "react";
import {
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Send,
} from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

export default function QuickAddPage() {
  const [wordsInput, setWordsInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    created: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const words = wordsInput
    .split(/[,\n]/)
    .map((w) => w.trim())
    .filter(Boolean);

  const submit = useCallback(async () => {
    if (words.length === 0) return;
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const notes = words.map((word) => ({
        deckName: "Gao English Spelling",
        modelName: "school spelling+",
        fields: {
          Word: word,
          "Main Sentence": "",
          Cloze: "",
          "Phonetic symbol": "",
          Audio: "",
          "Main Sentence Audio": "",
          Definition: "",
          "Extra information": "",
          Picture: "",
          Synonyms: "",
          "Note ID": crypto.randomUUID(),
          is_dictation_mem: "",
        },
        tags: ["quick_add"],
      }));

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
      setResult(data.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }, [words]);

  const reset = () => {
    setWordsInput("");
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Quick Add</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add words to Anki, then use Enrich to generate sentences,
          definitions, and more
        </p>
      </div>

      {!result ? (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Words or phrases</label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              One per line, or comma-separated
            </p>
            <textarea
              value={wordsInput}
              onChange={(e) => setWordsInput(e.target.value)}
              rows={8}
              placeholder={"creature\ncamouflage\ncame down with\nsharp and pointy"}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              disabled={submitting}
            />
          </div>

          {words.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {submitting ? (
                  <LoadingSpinner size="sm" className="text-primary-foreground" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Add {words.length} word{words.length !== 1 ? "s" : ""} to Anki
              </button>
              <span className="text-xs text-muted-foreground">
                Cards will be created with Word only — enrich them afterwards
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-success/50 bg-success/5 p-6 text-center">
          <CheckCircle className="mx-auto h-10 w-10 text-success" />
          <h3 className="mt-3 text-lg font-semibold">Words Added</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.created} cards created
            {result.failed > 0 && (
              <>, {result.failed} failed (likely duplicates)</>
            )}
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-border"
            >
              <RotateCcw className="h-4 w-4" /> Add More
            </button>
            <a
              href="/enrich"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Enrich Cards
            </a>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
