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
  let requestedItems;
  let lang;

  if (values.words) {
    const words = values.words.split(",").map((w) => w.trim()).filter(Boolean);
    if (words.length === 0) {
      process.stderr.write("Error: provide at least one word\n");
      process.exit(2);
    }
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
    const resolvedNotes = await resolveWordsToNotes(words, lang);
    let resolvedIndex = 0;
    requestedItems = words.map((word, requestIndex) => {
      const candidate = resolvedNotes[resolvedIndex];
      if (candidate?.word?.toLowerCase() === word.toLowerCase()) {
        resolvedIndex++;
        return { ...candidate, requestIndex };
      }
      return {
        word,
        requestIndex,
        unresolvedReason: "word could not be resolved after note creation",
      };
    });
    notes = requestedItems.filter((item) => !item.unresolvedReason);
  } else if (values.noteIds) {
    lang = resolveLanguage(values.lang);
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
    requestedItems = ids.map((noteId, requestIndex) => {
      const resolved = notesById.get(noteId);
      return resolved
        ? { ...resolved, requestIndex }
        : {
            noteId,
            word: "",
            requestIndex,
            unresolvedReason: "note ID not found in Anki deck",
          };
    });
    notes = requestedItems.filter((item) => !item.unresolvedReason);
  } else {
    process.stderr.write("Error: provide --noteIds or --words\n");
    process.exit(2);
  }

  process.stderr.write(`Language: ${lang.id} (deck: ${lang.deck})\n`);

  const results = [];
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalNotAttempted = 0;

  if (notes.length === 0) {
    for (const item of requestedItems) {
      results.push({
        ...(item.noteId !== undefined ? { noteId: item.noteId } : {}),
        ...(item.word ? { word: item.word } : {}),
        status: "not_attempted",
        reason: item.unresolvedReason,
      });
      totalNotAttempted++;
    }
    process.stdout.write(
      JSON.stringify(
        {
          results,
          succeeded: 0,
          failed: 0,
          notAttempted: totalNotAttempted,
        },
        null,
        2
      ) + "\n"
    );
    process.exit(2);
  }

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

  // Save text results and retain per-request occurrence identity. Duplicate
  // note IDs are valid requested items and must not collapse into one result.
  const textOutcomes = new Map();
  for (let index = 0; index < notes.length; index++) {
    const note = notes[index];
    const item = batchResult.results[index] || {
      noteId: note.noteId,
      word: note.word,
      error: "Text enrichment returned no result",
    };
    textOutcomes.set(note.requestIndex, item);
    if (item.error) {
      process.stderr.write(`  FAIL text: "${item.word}" — ${item.error}\n`);
      continue;
    }
    try {
      const ankiFields = await mapEnrichResultToAnkiFields(item.noteId, item.word, item);
      await saveToAnki(item.noteId, ankiFields);
      process.stderr.write(`  OK text: "${item.word}"\n`);

      // Update the note's sentence for later phases
      if (item.sentence) {
        note.sentence = item.sentence;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      textOutcomes.set(note.requestIndex, {
        ...item,
        error: `Text save failed: ${message}`,
      });
      process.stderr.write(`  FAIL text save: "${item.word}" — ${message}\n`);
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
  const imageOutcomes = new Map(
    notes
      .filter((n) => !n.sentence)
      .map((n) => [
        n.requestIndex,
        { status: "not_attempted", reason: "no sentence" },
      ])
  );
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
      if (!ankiFields["Picture"]) {
        throw new Error("Image generation returned no finalized Picture");
      }
      await saveToAnki(note.noteId, ankiFields);
      imageOutcomes.set(note.requestIndex, { status: "succeeded" });
      process.stderr.write(`  OK image: "${note.word}"\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      imageOutcomes.set(note.requestIndex, { status: "failed", error: message });
      process.stderr.write(`  FAIL image: "${note.word}" — ${message}\n`);
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
  for (const note of requestedItems) {
    if (note.unresolvedReason) {
      results.push({
        ...(note.noteId !== undefined ? { noteId: note.noteId } : {}),
        ...(note.word ? { word: note.word } : {}),
        status: "not_attempted",
        reason: note.unresolvedReason,
      });
      totalNotAttempted++;
      continue;
    }

    const batchItem = textOutcomes.get(note.requestIndex);
    const imageOutcome = imageOutcomes.get(note.requestIndex);
    const errors = [batchItem?.error, imageOutcome?.error].filter(Boolean);

    if (errors.length > 0) {
      results.push({
        noteId: note.noteId,
        word: note.word,
        status: "failed",
        error: errors.join("; "),
      });
      totalFailed++;
    } else if (imageOutcome?.status === "not_attempted") {
      results.push({
        noteId: note.noteId,
        word: note.word,
        status: "not_attempted",
        reason: imageOutcome.reason,
      });
      totalNotAttempted++;
    } else {
      results.push({
        noteId: note.noteId,
        word: note.word,
        status: "succeeded",
        enriched: true,
      });
      totalSucceeded++;
    }
  }

  const summary = {
    results,
    succeeded: totalSucceeded,
    failed: totalFailed,
    notAttempted: totalNotAttempted,
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
  process.exit(
    totalSucceeded === results.length ? 0 : totalSucceeded > 0 ? 1 : 2
  );
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(2);
});
