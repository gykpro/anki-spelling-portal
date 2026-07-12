#!/usr/bin/env node
/**
 * Image generation (OpenAI GPT Image illustrations) for Anki spelling cards.
 *
 * Usage:
 *   node enrich-image.mjs --noteIds 123,456
 *   node enrich-image.mjs --words "adventure,magnificent"
 */

import { parseArgs } from "node:util";
import { checkHealth, get, post } from "./lib/api.mjs";
import {
  resolveWordsToNotes,
  mapEnrichResultToAnkiFields,
  saveToAnki,
} from "./lib/anki-fields.mjs";
import { resolveLanguage } from "./lib/lang-config.mjs";

const { values } = parseArgs({
  options: {
    noteIds: { type: "string" },
    words: { type: "string" },
    lang: { type: "string" },
  },
  strict: false,
});

async function main() {
  await checkHealth();

  let notes;
  if (values.words) {
    const words = values.words.split(",").map((w) => w.trim()).filter(Boolean);
    if (words.length === 0) {
      process.stderr.write("Error: provide at least one word\n");
      process.exit(2);
    }
    const lang = resolveLanguage(values.lang, words[0]);
    const resolvedNotes = await resolveWordsToNotes(words, lang);
    let resolvedIndex = 0;
    notes = words.map((word) => {
      const candidate = resolvedNotes[resolvedIndex];
      if (candidate?.word?.toLowerCase() === word.toLowerCase()) {
        resolvedIndex++;
        return candidate;
      }
      return {
        word,
        unresolvedReason: "word not found in Anki deck",
      };
    });
  } else if (values.noteIds) {
    const idTokens = values.noteIds.split(",").map((id) => id.trim()).filter(Boolean);
    const ids = idTokens.map((id) => Number(id));
    if (
      ids.length === 0 ||
      ids.some((id) => !Number.isSafeInteger(id) || id <= 0)
    ) {
      process.stderr.write("Error: --noteIds must contain positive integer note IDs\n");
      process.exit(2);
    }
    const data = await get(
      `/api/anki/notes?q=${encodeURIComponent(`nid:${ids.join(" OR nid:")}`)}&limit=${ids.length}`
    );
    const notesById = new Map(
      (data.notes || []).map((n) => [
        n.noteId,
        {
          noteId: n.noteId,
          word: n.fields?.Word?.value || "",
          sentence: n.fields?.["Main Sentence"]?.value?.replace(/<[^>]*>/g, "") || "",
        },
      ])
    );
    notes = ids.map(
      (noteId) =>
        notesById.get(noteId) || {
          noteId,
          word: "",
          unresolvedReason: "note ID not found in Anki deck",
        }
    );
  } else {
    process.stderr.write("Error: provide --noteIds or --words\n");
    process.exit(2);
  }

  process.stderr.write(`Generating images for ${notes.length} card(s)\n`);

  const results = [];
  let succeeded = 0;
  let failed = 0;
  let notAttempted = 0;

  for (const note of notes) {
    if (note.unresolvedReason) {
      process.stderr.write(
        `  SKIP: ${note.word ? `"${note.word}"` : `note ${note.noteId}`} — ${note.unresolvedReason}\n`
      );
      results.push({
        ...(note.noteId !== undefined ? { noteId: note.noteId } : {}),
        ...(note.word ? { word: note.word } : {}),
        status: "not_attempted",
        reason: note.unresolvedReason,
      });
      notAttempted++;
      continue;
    }

    if (!note.sentence) {
      process.stderr.write(`  SKIP: "${note.word}" — no sentence (required for image generation)\n`);
      results.push({
        noteId: note.noteId,
        word: note.word,
        status: "not_attempted",
        reason: "no sentence",
      });
      notAttempted++;
      continue;
    }

    try {
      const enrichResult = await post("/api/enrich", {
        noteId: note.noteId,
        word: note.word,
        sentence: note.sentence,
        fields: ["image"],
      });

      if (enrichResult.image_error) {
        throw new Error(enrichResult.image_error);
      }

      const ankiFields = await mapEnrichResultToAnkiFields(note.noteId, note.word, enrichResult);
      if (!ankiFields["Picture"]) {
        throw new Error("Image generation returned no finalized Picture");
      }
      await saveToAnki(note.noteId, ankiFields);

      results.push({
        noteId: note.noteId,
        word: note.word,
        status: "succeeded",
        image: true,
      });
      succeeded++;
      process.stderr.write(`  OK: "${note.word}" — image saved\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        noteId: note.noteId,
        word: note.word,
        status: "failed",
        error: message,
      });
      failed++;
      process.stderr.write(`  FAIL: "${note.word}" — ${message}\n`);
    }
  }

  const summary = { results, succeeded, failed, notAttempted };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  process.exit(succeeded === results.length ? 0 : succeeded > 0 ? 1 : 2);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(2);
});
