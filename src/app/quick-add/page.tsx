"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { DistributionTargets, DistributionStatus } from "@/components/shared/DistributionTargets";
import type { DistributeResult } from "@/types/anki";

type Phase = "input" | "checking" | "duplicates" | "submitting" | "done";

/** Detect language from text: Chinese characters → Chinese, otherwise English */
function detectLang(text: string): { id: "english" | "chinese"; deck: string; noteType: string } {
  if (/[\u4e00-\u9fff]/.test(text)) {
    return { id: "chinese", deck: "Gao Chinese", noteType: "school Chinese spelling" };
  }
  return { id: "english", deck: "Gao English Spelling", noteType: "school spelling" };
}

/** Build fields for a quick-add note based on language */
function buildQuickAddFields(word: string, lang: ReturnType<typeof detectLang>): Record<string, string> {
  const base: Record<string, string> = {
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
  };

  if (lang.id === "chinese") {
    base["Main Sentence Pinyin"] = "";
    base["Stroke Order Anim"] = "";
    base["is_dictation"] = "";
    base["is_dictation_from_mem"] = "";
  } else {
    base["is_dictation_mem"] = "";
  }

  return base;
}

export default function QuickAddPage() {
  const [wordsInput, setWordsInput] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [duplicateWords, setDuplicateWords] = useState<string[]>([]);
  const [skippedWords, setSkippedWords] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{
    created: number;
    failed: number;
    noteIds: number[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distTargets, setDistTargets] = useState<string[]>([]);
  const distTargetsRef = useRef(distTargets);
  distTargetsRef.current = distTargets;
  const [distResults, setDistResults] = useState<DistributeResult[] | null>(null);
  const [distributing, setDistributing] = useState(false);

  const words = wordsInput
    .split(/[,，、\n]/)
    .map((w) => w.trim())
    .filter(Boolean);

  const wordsToAdd = words.filter((w) => !skippedWords.has(w.toLowerCase()));

  // Auto-detect language from the first word with content
  const detectedLang = useMemo(() => {
    const firstWord = words[0] || "";
    return detectLang(firstWord);
  }, [words[0] || ""]);

  const checkAndSubmit = useCallback(async () => {
    if (words.length === 0) return;
    setPhase("checking");
    setError(null);
    setDuplicateWords([]);
    setSkippedWords(new Set());

    try {
      const res = await fetch(
        `/api/anki/notes?deck=${encodeURIComponent(detectedLang.deck)}&checkDuplicates=${encodeURIComponent(words.join(","))}`
      );
      if (!res.ok) throw new Error("Duplicate check failed");
      const data = await res.json();

      if (data.duplicates.length > 0) {
        setDuplicateWords(data.duplicates);
        // Auto-skip duplicates by default
        setSkippedWords(new Set(data.duplicates.map((w: string) => w.toLowerCase())));
        setPhase("duplicates");
      } else {
        // No duplicates — submit directly
        await submitWords(words);
      }
    } catch (err) {
      // If duplicate check fails, submit anyway (non-blocking)
      await submitWords(words);
    }
  }, [words, detectedLang]);

  const submitWords = useCallback(async (wordsToSubmit: string[]) => {
    if (wordsToSubmit.length === 0) {
      setPhase("done");
      setResult({ created: 0, failed: 0, noteIds: [] });
      return;
    }
    setPhase("submitting");
    setError(null);

    // Re-detect language from words being submitted
    const lang = detectLang(wordsToSubmit[0] || "");

    try {
      const notes = wordsToSubmit.map((word) => ({
        deckName: lang.deck,
        modelName: lang.noteType,
        fields: buildQuickAddFields(word, lang),
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
      const noteIds = (data.results as (number | null)[]).filter(
        (id): id is number => id !== null
      );
      setResult({ ...data.summary, noteIds });
      setPhase("done");

      // Distribute to target profiles if any selected
      const targets = distTargetsRef.current;
      if (noteIds.length > 0 && targets.length > 0) {
        setDistributing(true);
        try {
          const distRes = await fetch("/api/anki/distribute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              noteIds,
              targetProfiles: targets,
            }),
          });
          if (distRes.ok) {
            const distData = await distRes.json();
            setDistResults(distData.results);
          }
        } catch {
          // Distribution is best-effort
        } finally {
          setDistributing(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
      setPhase("input");
    }
  }, []);

  const confirmSubmit = useCallback(() => {
    submitWords(wordsToAdd);
  }, [wordsToAdd, submitWords]);

  const toggleSkip = (word: string) => {
    setSkippedWords((prev) => {
      const next = new Set(prev);
      const key = word.toLowerCase();
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const reset = () => {
    setWordsInput("");
    setPhase("input");
    setResult(null);
    setError(null);
    setDuplicateWords([]);
    setSkippedWords(new Set());
    setDistResults(null);
    setDistributing(false);
  };

  const isDuplicate = (word: string) =>
    duplicateWords.some((d) => d.toLowerCase() === word.toLowerCase());

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Quick Add</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Add words to Anki, then use Enrich to generate sentences,
          definitions, and more
        </p>
      </div>

      {phase === "done" && result ? (
        <div className="rounded-lg border border-success/50 bg-success/5 p-6 text-center">
          <CheckCircle className="mx-auto h-10 w-10 text-success" />
          <h3 className="mt-3 text-lg font-semibold">Words Added</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {result.created} cards created
            {result.failed > 0 && (
              <>, {result.failed} failed (likely duplicates)</>
            )}
            {duplicateWords.length > 0 && (
              <>
                , {skippedWords.size} duplicate{skippedWords.size !== 1 ? "s" : ""} skipped
              </>
            )}
          </p>
          <div className="mt-2 flex justify-center">
            <DistributionStatus results={distResults} loading={distributing} />
          </div>
          <div className="mt-4 flex justify-center gap-3">
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-border"
            >
              <RotateCcw className="h-4 w-4" /> Add More
            </button>
            {result.noteIds.length > 0 && (
              <a
                href={`/enrich?noteIds=${result.noteIds.join(",")}&autoEnrich=true`}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                <Sparkles className="h-4 w-4" /> Enrich {result.noteIds.length} Cards
              </a>
            )}
            <a
              href="/enrich"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              All Cards
            </a>
          </div>
        </div>
      ) : phase === "duplicates" ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-warning/50 bg-warning/5 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-warning shrink-0" />
              <div>
                <h3 className="text-sm font-semibold">Duplicates found</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {duplicateWords.length} word{duplicateWords.length !== 1 ? "s" : ""} already
                  exist in Anki. Duplicates are skipped by default — click to toggle.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {words.map((word) => {
              const dup = isDuplicate(word);
              const skipped = skippedWords.has(word.toLowerCase());
              return (
                <button
                  key={word}
                  onClick={() => dup && toggleSkip(word)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    dup
                      ? skipped
                        ? "bg-warning/10 text-warning line-through cursor-pointer hover:bg-warning/20"
                        : "bg-warning/20 text-warning cursor-pointer hover:bg-warning/30"
                      : "bg-accent text-accent-foreground cursor-default"
                  }`}
                >
                  {word}
                  {dup && (
                    <span className="text-xs opacity-70">
                      {skipped ? "(exists — skipped)" : "(exists — will add)"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={confirmSubmit}
              disabled={wordsToAdd.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              Add {wordsToAdd.length} word{wordsToAdd.length !== 1 ? "s" : ""} to Anki
            </button>
            <button
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-md bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-border"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">Words or phrases</label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              One per line, or comma-separated. Language is auto-detected.
            </p>
            <textarea
              value={wordsInput}
              onChange={(e) => setWordsInput(e.target.value)}
              rows={8}
              placeholder={"creature\ncamouflage\ncame down with\nsharp and pointy"}
              className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              disabled={phase === "checking" || phase === "submitting"}
            />
          </div>

          {words.length > 0 && (
            <div className="mb-2 text-xs text-muted-foreground">
              Detected: <span className="font-medium text-foreground">{detectedLang.id === "chinese" ? "Chinese" : "English"}</span> — deck: {detectedLang.deck}
            </div>
          )}

          <DistributionTargets
            selected={distTargets}
            onChange={setDistTargets}
          />

          {words.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={checkAndSubmit}
                disabled={phase === "checking" || phase === "submitting"}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {phase === "checking" || phase === "submitting" ? (
                  <LoadingSpinner size="sm" className="text-primary-foreground" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {phase === "checking"
                  ? "Checking..."
                  : phase === "submitting"
                    ? "Adding..."
                    : `Add ${words.length} word${words.length !== 1 ? "s" : ""} to Anki`}
              </button>
              <span className="text-xs text-muted-foreground">
                Cards will be created with Word only — enrich them afterwards
              </span>
            </div>
          )}
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
