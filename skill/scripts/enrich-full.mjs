#!/usr/bin/env node
/**
 * Full enrichment pipeline: text → audio → image.
 * Creates new notes for unknown words, then enriches all fields.
 *
 * Usage:
 *   node enrich-full.mjs --noteIds 123,456
 *   node enrich-full.mjs --words "adventure,magnificent"
 */

import { parseArgs } from "node:util";
import { checkHealth, get, post } from "./lib/api.mjs";
import {
  resolveWordsToNotes,
  checkDuplicates,
  createNotes,
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
  let lang;

  if (values.words) {
    const words = values.words.split(",").map((w) => w.trim()).filter(Boolean);
    lang = resolveLanguage(values.lang, words[0]);

    // Check duplicates and create new notes for unknown words
    const dupCheck = await checkDuplicates(words, lang);
    if (dupCheck.duplicates.length > 0) {
      process.stderr.write(
        `Found existing: ${dupCheck.duplicates.join(", ")}\n`
      );
    }

    if (dupCheck.newWords.length > 0) {
      process.stderr.write(`Creating notes for: ${dupCheck.newWords.join(", ")}\n`);
      await createNotes(dupCheck.newWords, lang);
    }

    // Resolve all words (existing + newly created) to note objects
    notes = await resolveWordsToNotes(words, lang);
    if (notes.length === 0) {
      process.stderr.write("Error: no notes could be resolved\n");
      process.exit(2);
    }
  } else if (values.noteIds) {
    lang = resolveLanguage(values.lang);
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

  process.stderr.write(`Language: ${lang.id} (deck: ${lang.deck})\n`);

  const results = [];
  let totalSucceeded = 0;
  let totalFailed = 0;

  // Phase 1: Batch text enrichment
  process.stderr.write(`\n=== Phase 1: Text enrichment (${notes.length} cards) ===\n`);
  const textFields = lang.textFields;
  const cards = notes.map((n) => ({
    noteId: n.noteId,
    word: n.word,
    ...(n.sentence ? { sentence: n.sentence } : {}),
  }));

  let batchResult;
  try {
    batchResult = await post("/api/enrich/batch", { cards, fields: textFields });
  } catch (err) {
    process.stderr.write(`Fatal: batch enrichment failed — ${err.message}\n`);
    process.exit(2);
  }

  // Save text results + update note objects with new sentences
  for (const item of batchResult.results) {
    if (item.error) {
      process.stderr.write(`  FAIL text: "${item.word}" — ${item.error}\n`);
      continue;
    }
    try {
      const ankiFields = await mapEnrichResultToAnkiFields(item.noteId, item.word, item);
      await saveToAnki(item.noteId, ankiFields);
      process.stderr.write(`  OK text: "${item.word}"\n`);

      // Update the note's sentence for later phases
      const noteObj = notes.find((n) => n.noteId === item.noteId);
      if (noteObj && item.sentence) {
        noteObj.sentence = item.sentence;
      }
    } catch (err) {
      process.stderr.write(`  FAIL text save: "${item.word}" — ${err.message}\n`);
    }
  }

  // Phase 2: Audio generation (per-note)
  process.stderr.write(`\n=== Phase 2: Audio generation (${notes.length} cards) ===\n`);
  for (const note of notes) {
    const audioFields = ["audio"];
    if (note.sentence) {
      audioFields.push("sentence_audio");
    } else {
      process.stderr.write(`  Warning: "${note.word}" — no sentence, word audio only\n`);
    }

    try {
      const enrichResult = await post("/api/enrich", {
        noteId: note.noteId,
        word: note.word,
        sentence: note.sentence || undefined,
        fields: audioFields,
      });
      const ankiFields = await mapEnrichResultToAnkiFields(note.noteId, note.word, enrichResult);
      await saveToAnki(note.noteId, ankiFields);
      process.stderr.write(`  OK audio: "${note.word}"\n`);
    } catch (err) {
      process.stderr.write(`  FAIL audio: "${note.word}" — ${err.message}\n`);
    }
  }

  // Phase 3: Image generation (per-note, requires sentence)
  const imageNotes = notes.filter((n) => n.sentence);
  process.stderr.write(`\n=== Phase 3: Image generation (${imageNotes.length} cards with sentences) ===\n`);
  for (const note of imageNotes) {
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
      process.stderr.write(`  OK image: "${note.word}"\n`);
    } catch (err) {
      process.stderr.write(`  FAIL image: "${note.word}" — ${err.message}\n`);
    }
  }

  // Phase 4: Stroke order (Chinese only)
  if (lang.extraMediaSteps.includes("strokeOrder")) {
    process.stderr.write(`\n=== Phase 4: Stroke order (${notes.length} cards) ===\n`);
    for (const note of notes) {
      try {
        const enrichResult = await post("/api/enrich", {
          noteId: note.noteId,
          word: note.word,
          fields: ["strokeOrder"],
        });
        if (enrichResult.strokeOrder_error) {
          throw new Error(enrichResult.strokeOrder_error);
        }
        process.stderr.write(`  OK stroke: "${note.word}"\n`);
      } catch (err) {
        process.stderr.write(`  FAIL stroke: "${note.word}" — ${err.message}\n`);
      }
    }
  }

  // Summary
  for (const note of notes) {
    const batchItem = batchResult.results.find((r) => r.noteId === note.noteId);
    if (batchItem?.error) {
      results.push({ noteId: note.noteId, word: note.word, error: batchItem.error });
      totalFailed++;
    } else {
      results.push({ noteId: note.noteId, word: note.word, enriched: true });
      totalSucceeded++;
    }
  }

  const summary = { results, succeeded: totalSucceeded, failed: totalFailed };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  process.exit(totalFailed === notes.length ? 2 : totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(2);
});
