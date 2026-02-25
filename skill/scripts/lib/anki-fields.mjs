/**
 * Field mapping + save-to-Anki logic.
 * Replicates the save logic from src/app/enrich/page.tsx:484-596
 * to map enrichment API results to Anki note fields.
 */

import { get, post, put } from "./api.mjs";

/**
 * Map an enrichment result to Anki field key-value pairs.
 * Handles text fields inline, stores media via the portal API.
 *
 * @param {number} noteId
 * @param {string} word
 * @param {object} result - enrichment API response
 * @returns {Promise<Record<string, string>>} Anki fields to update
 */
export async function mapEnrichResultToAnkiFields(noteId, word, result) {
  const fields = {};

  if (result.sentence) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`, "i");
    fields["Main Sentence"] = result.sentence.replace(
      regex,
      '<span class="nodeword">$1</span>'
    );
    fields["Cloze"] = result.sentence.replace(regex, "{{c1::$1}}");
  }

  if (result.definition) fields["Definition"] = String(result.definition);
  if (result.phonetic) fields["Phonetic symbol"] = String(result.phonetic);

  if (result.synonyms) {
    fields["Synonyms"] = Array.isArray(result.synonyms)
      ? result.synonyms.join(", ")
      : String(result.synonyms);
  }

  if (result.extra_info) fields["Extra information"] = String(result.extra_info);
  if (result.sentencePinyin) fields["Main Sentence Pinyin"] = String(result.sentencePinyin);

  // Store image media
  if (result.image && typeof result.image === "object") {
    const img = result.image;
    const ext = img.mimeType?.includes("png") ? "png" : "jpg";
    const safeWord = word.replace(/\s+/g, "_");
    const filename = `spelling_${safeWord}_${noteId}.${ext}`;
    try {
      await post("/api/anki/media", { filename, data: img.base64 });
      fields["Picture"] = `<img src="${filename}">`;
    } catch (err) {
      process.stderr.write(`  Warning: failed to save image for "${word}": ${err.message}\n`);
    }
  }

  // Store word audio
  if (result.audio && typeof result.audio === "object") {
    const audio = result.audio;
    const safeWord = word.replace(/\s+/g, "_");
    const filename = `spelling_${safeWord}_${noteId}.mp3`;
    try {
      await post("/api/anki/media", { filename, data: audio.base64 });
      fields["Audio"] = `[sound:${filename}]`;
    } catch (err) {
      process.stderr.write(`  Warning: failed to save audio for "${word}": ${err.message}\n`);
    }
  }

  // Store sentence audio
  if (result.sentence_audio && typeof result.sentence_audio === "object") {
    const audio = result.sentence_audio;
    const safeWord = word.replace(/\s+/g, "_");
    const filename = `spelling_${safeWord}_${noteId}_sentence.mp3`;
    try {
      await post("/api/anki/media", { filename, data: audio.base64 });
      fields["Main Sentence Audio"] = `[sound:${filename}]`;
    } catch (err) {
      process.stderr.write(`  Warning: failed to save sentence audio for "${word}": ${err.message}\n`);
    }
  }

  return fields;
}

/**
 * Save fields to an Anki note via the portal API.
 *
 * @param {number} noteId
 * @param {Record<string, string>} fields
 */
export async function saveToAnki(noteId, fields) {
  if (Object.keys(fields).length === 0) return;
  await put(`/api/anki/notes/${noteId}`, { fields });
}

/**
 * Resolve a list of words to their Anki note IDs.
 * Returns an array of { noteId, word, sentence } objects.
 *
 * @param {string[]} words
 * @returns {Promise<Array<{noteId: number, word: string, sentence: string}>>}
 */
export async function resolveWordsToNotes(words, lang) {
  const deck = lang?.deck || "Gao English Spelling";
  const data = await get(
    `/api/anki/notes?q=${encodeURIComponent(`deck:"${deck}"`)}&limit=5000`
  );
  const notes = data.notes || [];
  const results = [];

  for (const targetWord of words) {
    const note = notes.find(
      (n) => n.fields?.Word?.value?.toLowerCase() === targetWord.toLowerCase()
    );
    if (note) {
      results.push({
        noteId: note.noteId,
        word: note.fields.Word.value,
        sentence: note.fields["Main Sentence"]?.value
          ? stripHtml(note.fields["Main Sentence"].value)
          : "",
      });
    } else {
      process.stderr.write(`  Warning: word "${targetWord}" not found in Anki deck\n`);
    }
  }
  return results;
}

/**
 * Check which words already exist in Anki.
 * Returns { duplicates: string[], newWords: string[] }
 */
export async function checkDuplicates(words, lang) {
  const deck = lang?.deck || "Gao English Spelling";
  const param = words.map((w) => w.trim()).join(",");
  return get(`/api/anki/notes?checkDuplicates=${encodeURIComponent(param)}&deck=${encodeURIComponent(deck)}`);
}

/**
 * Create new notes in Anki for the given words.
 * Returns array of created note IDs (null for failures).
 */
export async function createNotes(words, lang) {
  const deckName = lang?.deck || "Gao English Spelling";
  const modelName = lang?.noteType || "school spelling";
  const templateFields = lang?.noteFields || {
    Word: "", "Main Sentence": "", Cloze: "", "Phonetic symbol": "",
    Audio: "", "Main Sentence Audio": "", Definition: "", "Extra information": "",
    Picture: "", Synonyms: "", "Note ID": "", is_dictation_mem: "",
  };

  const notes = words.map((word) => ({
    deckName,
    modelName,
    fields: { ...templateFields, Word: word, "Note ID": crypto.randomUUID() },
    tags: ["skill_add"],
  }));
  const data = await post("/api/anki/notes", { notes });
  return data.results || [];
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, "");
}
