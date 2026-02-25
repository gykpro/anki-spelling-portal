#!/usr/bin/env node
/**
 * Batch text enrichment for Anki spelling cards.
 *
 * Usage:
 *   node enrich-text.mjs --noteIds 123,456
 *   node enrich-text.mjs --words "adventure,magnificent"
 *   node enrich-text.mjs --words "adventure" --fields definition,phonetic
 *
 * Default fields: sentence, definition, phonetic, synonyms, extra_info
 */

import { parseArgs } from "node:util";
import { checkHealth, post } from "./lib/api.mjs";
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
    fields: { type: "string" },
    lang: { type: "string" },
  },
  strict: false,
});

async function main() {
  await checkHealth();

  // Resolve targets
  let notes;
  let lang;
  if (values.words) {
    const words = values.words.split(",").map((w) => w.trim()).filter(Boolean);
    lang = resolveLanguage(values.lang, words[0]);
    notes = await resolveWordsToNotes(words, lang);
    if (notes.length === 0) {
      process.stderr.write("Error: none of the specified words were found in Anki\n");
      process.exit(2);
    }
  } else if (values.noteIds) {
    lang = resolveLanguage(values.lang);
    const ids = values.noteIds.split(",").map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id));
    // Fetch note info for these IDs
    const data = await import("./lib/api.mjs").then((m) =>
      m.get(`/api/anki/notes?q=${encodeURIComponent(`nid:${ids.join(" OR nid:")}`)}&limit=${ids.length}`)
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

  const fields = values.fields
    ? values.fields.split(",").map((f) => f.trim())
    : lang.textFields;

  process.stderr.write(`Enriching ${notes.length} card(s) with fields: ${fields.join(", ")}\n`);

  // Build batch request
  const cards = notes.map((n) => ({
    noteId: n.noteId,
    word: n.word,
    ...(n.sentence ? { sentence: n.sentence } : {}),
  }));

  const batchResult = await post("/api/enrich/batch", { cards, fields });
  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (const item of batchResult.results) {
    if (item.error) {
      results.push({ noteId: item.noteId, word: item.word, error: item.error });
      failed++;
      process.stderr.write(`  FAIL: "${item.word}" — ${item.error}\n`);
      continue;
    }

    try {
      const ankiFields = await mapEnrichResultToAnkiFields(item.noteId, item.word, item);
      await saveToAnki(item.noteId, ankiFields);
      results.push({
        noteId: item.noteId,
        word: item.word,
        fields: Object.keys(ankiFields),
      });
      succeeded++;
      process.stderr.write(`  OK: "${item.word}" — saved ${Object.keys(ankiFields).length} field(s)\n`);
    } catch (err) {
      results.push({ noteId: item.noteId, word: item.word, error: err.message });
      failed++;
      process.stderr.write(`  FAIL: "${item.word}" — ${err.message}\n`);
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
