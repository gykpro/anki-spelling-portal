#!/usr/bin/env node
/**
 * Image generation (Gemini illustrations) for Anki spelling cards.
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
    const lang = resolveLanguage(values.lang, words[0]);
    notes = await resolveWordsToNotes(words, lang);
    if (notes.length === 0) {
      process.stderr.write("Error: none of the specified words were found in Anki\n");
      process.exit(2);
    }
  } else if (values.noteIds) {
    const ids = values.noteIds.split(",").map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id));
    const data = await get(
      `/api/anki/notes?q=${encodeURIComponent(`nid:${ids.join(" OR nid:")}`)}&limit=${ids.length}`
    );
    notes = (data.notes || []).map((n) => ({
      noteId: n.noteId,
      word: n.fields?.Word?.value || "",
      sentence: n.fields?.["Main Sentence"]?.value?.replace(/<[^>]*>/g, "") || "",
    }));
  } else {
    process.stderr.write("Error: provide --noteIds or --words\n");
    process.exit(2);
  }

  process.stderr.write(`Generating images for ${notes.length} card(s)\n`);

  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (const note of notes) {
    if (!note.sentence) {
      process.stderr.write(`  SKIP: "${note.word}" — no sentence (required for image generation)\n`);
      results.push({ noteId: note.noteId, word: note.word, skipped: "no sentence" });
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
      await saveToAnki(note.noteId, ankiFields);

      results.push({ noteId: note.noteId, word: note.word, image: !!ankiFields["Picture"] });
      succeeded++;
      process.stderr.write(`  OK: "${note.word}" — image saved\n`);
    } catch (err) {
      results.push({ noteId: note.noteId, word: note.word, error: err.message });
      failed++;
      process.stderr.write(`  FAIL: "${note.word}" — ${err.message}\n`);
    }
  }

  const summary = { results, succeeded, failed };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  process.exit(failed === notes.length ? 2 : failed > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(2);
});
