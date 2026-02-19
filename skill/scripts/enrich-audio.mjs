#!/usr/bin/env node
/**
 * Audio generation (word + sentence TTS) for Anki spelling cards.
 *
 * Usage:
 *   node enrich-audio.mjs --noteIds 123,456
 *   node enrich-audio.mjs --words "adventure,magnificent"
 */

import { parseArgs } from "node:util";
import { checkHealth, get, post } from "./lib/api.mjs";
import {
  resolveWordsToNotes,
  mapEnrichResultToAnkiFields,
  saveToAnki,
} from "./lib/anki-fields.mjs";

const { values } = parseArgs({
  options: {
    noteIds: { type: "string" },
    words: { type: "string" },
  },
  strict: false,
});

async function main() {
  await checkHealth();

  let notes;
  if (values.words) {
    const words = values.words.split(",").map((w) => w.trim()).filter(Boolean);
    notes = await resolveWordsToNotes(words);
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

  process.stderr.write(`Generating audio for ${notes.length} card(s)\n`);

  const results = [];
  let succeeded = 0;
  let failed = 0;

  for (const note of notes) {
    const fields = ["audio"];
    if (note.sentence) {
      fields.push("sentence_audio");
    } else {
      process.stderr.write(`  Warning: "${note.word}" has no sentence — skipping sentence audio\n`);
    }

    try {
      const enrichResult = await post("/api/enrich", {
        noteId: note.noteId,
        word: note.word,
        sentence: note.sentence || undefined,
        fields,
      });

      const ankiFields = await mapEnrichResultToAnkiFields(note.noteId, note.word, enrichResult);
      await saveToAnki(note.noteId, ankiFields);

      const generated = [];
      if (ankiFields["Audio"]) generated.push("word");
      if (ankiFields["Main Sentence Audio"]) generated.push("sentence");
      results.push({ noteId: note.noteId, word: note.word, audio: generated });
      succeeded++;
      process.stderr.write(`  OK: "${note.word}" — ${generated.join(" + ")} audio\n`);
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
