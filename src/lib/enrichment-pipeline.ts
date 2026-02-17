/**
 * Shared enrichment pipeline functions.
 * Used by both API routes and Telegram bot.
 */
import { runAI, runAIVision, type ImageInput } from "@/lib/ai";
import { ankiConnect } from "@/lib/anki-connect";
import { getConfig } from "@/lib/settings";
import {
  type TextEnrichField,
  getFieldDescriptions,
  ENRICH_SUFFIX,
} from "@/lib/enrich-prompts";
import {
  buildMainSentence,
  buildCloze,
  cardToAnkiNote,
} from "@/lib/card-builder";
import type { ExtractedPage, SpellingCard } from "@/types/spelling";
import type { BatchEnrichResultItem } from "@/types/enrichment";

// ─── Extraction prompt (shared with extract route) ───

export const EXTRACTION_PROMPT = `You are extracting spelling worksheet data from the provided images.

Return ONLY a JSON array (no markdown, no code fences) with this structure:
[
  {
    "pageNumber": 1,
    "termWeek": "Term X Week Y",
    "topic": "The topic title",
    "sentences": [
      { "number": 1, "sentence": "Full sentence exactly as written.", "word": "the underlined word or phrase" }
    ]
  }
]

Rules:
1. Extract term/week from the header "SPELLING LIST (Term X Week Y)"
2. Extract the topic from the subtitle
3. For each numbered sentence (1-10), copy it EXACTLY and identify the bold/underlined word or phrase
4. The underlined text may be a single word or a multi-word phrase - extract the ENTIRE underlined portion
5. Return ONLY valid JSON, nothing else
`;

// ─── TTS generation ───

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function generateTTS(
  text: string,
  type: "word" | "sentence"
): Promise<{ base64: string; format: string }> {
  const key = getConfig("AZURE_TTS_KEY");
  const region = getConfig("AZURE_TTS_REGION");
  if (!key || !region) throw new Error("Azure TTS credentials not configured");

  const rate = type === "word" ? "-10%" : "0%";
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
  <voice name='en-US-AnaNeural'>
    <prosody rate='${rate}'>${escapeXml(text)}</prosody>
  </voice>
</speak>`;

  const res = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      },
      body: ssml,
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Azure TTS error ${res.status}: ${errBody}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return { base64, format: "mp3" };
}

// ─── Image generation ───

export async function generateImage(
  word: string,
  sentence: string
): Promise<{ base64: string; mimeType: string }> {
  const apiKey = getConfig("NANO_BANANA_API_KEY");
  if (!apiKey) throw new Error("NANO_BANANA_API_KEY not configured");

  const prompt = `Create a simple, clear cartoon illustration for a children's vocabulary flashcard.

The illustration must accurately and literally depict this sentence: "${sentence}"
The key vocabulary word is: "${word}"

Requirements:
- Create a scene, but do not literally put the sentence in the result picture
- Show exactly what the sentence describes — do not add extra characters, objects, or actions not mentioned
- Real-world objects must look physically correct (right number of limbs, fingers, wheels, handles, etc.) — no anatomical or structural errors
- Use bright, friendly colors
- Keep the composition simple and uncluttered — one clear focal point
- The illustration should help a 10-year-old understand and remember the word "${word}"`;

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();

  for (const candidate of data.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        return {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        };
      }
    }
  }

  throw new Error("No image returned from Gemini");
}

// ─── Batch text enrichment ───

export function extractJsonArray(text: string): Record<string, unknown>[] {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  try {
    const result = JSON.parse(s);
    if (Array.isArray(result)) return result;
  } catch {
    // Fall through to extraction
  }
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in response");
  }
  return JSON.parse(s.slice(start, end + 1));
}

export function buildBatchPrompt(
  cards: { word: string; sentence?: string }[],
  fields: TextEnrichField[]
): string {
  const fieldDescs = getFieldDescriptions(fields);

  const wordList = cards
    .map((c, i) => {
      let line = `${i + 1}. Word/phrase: "${c.word}"`;
      if (c.sentence) line += ` | Context sentence: "${c.sentence}"`;
      return line;
    })
    .join("\n");

  return `I have ${cards.length} words/phrases. For EACH word, generate these fields:
{
  ${fieldDescs.join(",\n  ")}
}

Words:
${wordList}

Return ONLY a JSON array with exactly ${cards.length} objects, one per word in the same order. Each object must include a "word" field matching the input. No markdown, no code fences.

${ENRICH_SUFFIX}`;
}

// ─── Full pipeline functions (for Telegram bot) ───

export interface PipelineProgress {
  send: (text: string) => Promise<void>;
  update: (text: string) => Promise<void>;
}

const ALL_TEXT_FIELDS: TextEnrichField[] = [
  "sentence",
  "definition",
  "phonetic",
  "synonyms",
  "extra_info",
];

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/** Check which words already exist in Anki, returns set of existing words (lowercased) */
export async function checkDuplicates(words: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  for (const word of words) {
    const noteIds = await ankiConnect.findNotes(
      `deck:"Gao English Spelling" Word:"${word}"`
    );
    if (noteIds.length > 0) {
      existing.add(word.toLowerCase());
    }
  }
  return existing;
}

/** Create notes in Anki for given words. Returns array of created note IDs. */
export async function createWordNotes(
  words: string[]
): Promise<{ noteId: number; word: string }[]> {
  const cards: SpellingCard[] = words.map((word) => ({
    id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    word,
    sentence: "",
    mainSentence: "",
    cloze: "",
    termWeek: "telegram",
    topic: "telegram",
    edited: false,
  }));

  const noteParams = cards.map((c) => cardToAnkiNote(c));
  const noteIds = await ankiConnect.addNotes(noteParams);

  const created: { noteId: number; word: string }[] = [];
  for (let i = 0; i < noteIds.length; i++) {
    if (noteIds[i] !== null) {
      created.push({ noteId: noteIds[i]!, word: words[i] });
    }
  }
  return created;
}

/** Batch enrich text fields for given notes via AI */
export async function batchEnrichText(
  cards: { noteId: number; word: string; sentence?: string }[],
  fields: TextEnrichField[] = ALL_TEXT_FIELDS
): Promise<BatchEnrichResultItem[]> {
  const prompt = buildBatchPrompt(cards, fields);
  const rawText = await runAI(prompt);
  const parsed = extractJsonArray(rawText);

  const results: BatchEnrichResultItem[] = [];
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const result =
      parsed[i] ||
      parsed.find(
        (r) =>
          r.word && String(r.word).toLowerCase() === card.word.toLowerCase()
      );

    if (result) {
      results.push({
        noteId: card.noteId,
        word: card.word,
        sentence: result.sentence as string | undefined,
        definition: result.definition as string | undefined,
        phonetic: result.phonetic as string | undefined,
        synonyms: result.synonyms as string[] | undefined,
        extra_info: result.extra_info as string | undefined,
      });
    } else {
      results.push({
        noteId: card.noteId,
        word: card.word,
        error: "No result returned for this word",
      });
    }
  }
  return results;
}

/** Save enriched text fields to Anki for a single note */
export async function saveTextToAnki(
  noteId: number,
  word: string,
  enrichResult: BatchEnrichResultItem
): Promise<void> {
  const fields: Record<string, string> = {};

  if (enrichResult.sentence) {
    fields["Main Sentence"] = buildMainSentence(
      enrichResult.sentence,
      word
    );
    fields["Cloze"] = buildCloze(enrichResult.sentence, word);
  }
  if (enrichResult.definition) {
    fields["Definition"] = enrichResult.definition;
  }
  if (enrichResult.phonetic) {
    fields["Phonetic symbol"] = enrichResult.phonetic;
  }
  if (enrichResult.synonyms) {
    fields["Synonyms"] = Array.isArray(enrichResult.synonyms)
      ? enrichResult.synonyms.join(", ")
      : String(enrichResult.synonyms);
  }
  if (enrichResult.extra_info) {
    fields["Extra information"] = enrichResult.extra_info;
  }

  if (Object.keys(fields).length > 0) {
    await ankiConnect.updateNoteFields({ id: noteId, fields });
  }
}

/** Generate and save audio (word + sentence) for a single note */
export async function generateAndSaveAudio(
  noteId: number,
  word: string,
  sentence?: string
): Promise<void> {
  // Word audio
  const wordTts = await generateTTS(word, "word");
  const wordFilename = `spelling_${word.replace(/[^a-zA-Z0-9]/g, "_")}_${noteId}.mp3`;
  await ankiConnect.storeMediaFile(wordFilename, wordTts.base64);
  await ankiConnect.updateNoteFields({
    id: noteId,
    fields: { Audio: `[sound:${wordFilename}]` },
  });

  // Sentence audio (if sentence available)
  if (sentence) {
    const plainSentence = stripHtml(sentence);
    const sentenceTts = await generateTTS(plainSentence, "sentence");
    const sentenceFilename = `spelling_sentence_${word.replace(/[^a-zA-Z0-9]/g, "_")}_${noteId}.mp3`;
    await ankiConnect.storeMediaFile(sentenceFilename, sentenceTts.base64);
    await ankiConnect.updateNoteFields({
      id: noteId,
      fields: { "Main Sentence Audio": `[sound:${sentenceFilename}]` },
    });
  }
}

/** Generate and save image for a single note */
export async function generateAndSaveImage(
  noteId: number,
  word: string,
  sentence: string
): Promise<void> {
  const imgResult = await generateImage(word, stripHtml(sentence));
  const ext = imgResult.mimeType.includes("png") ? "png" : "jpg";
  const filename = `spelling_img_${word.replace(/[^a-zA-Z0-9]/g, "_")}_${noteId}.${ext}`;
  await ankiConnect.storeMediaFile(filename, imgResult.base64);
  await ankiConnect.updateNoteFields({
    id: noteId,
    fields: { Picture: `<img src="${filename}">` },
  });
}

/** Run the full enrichment pipeline for a list of words */
export async function runFullPipeline(
  words: string[],
  progress: PipelineProgress
): Promise<{ created: number; duplicates: number; errors: string[] }> {
  const errors: string[] = [];

  // 1. Check duplicates
  await progress.update(`Checking duplicates for ${words.length} words...`);
  const dupes = await checkDuplicates(words);
  const newWords = words.filter((w) => !dupes.has(w.toLowerCase()));

  if (newWords.length === 0) {
    return { created: 0, duplicates: dupes.size, errors };
  }

  await progress.update(
    `${dupes.size} duplicate(s) skipped. Creating ${newWords.length} notes...`
  );

  // 2. Create notes
  const created = await createWordNotes(newWords);
  if (created.length === 0) {
    return { created: 0, duplicates: dupes.size, errors: ["Failed to create any notes"] };
  }

  // 3. Enrich text fields
  await progress.update(
    `Enriching text fields for ${created.length} words...`
  );
  let enrichResults: BatchEnrichResultItem[];
  try {
    enrichResults = await batchEnrichText(created);
  } catch (err) {
    errors.push(`Text enrichment failed: ${err instanceof Error ? err.message : String(err)}`);
    return { created: created.length, duplicates: dupes.size, errors };
  }

  // 4. Save text to Anki
  await progress.update("Saving text fields to Anki...");
  for (const result of enrichResults) {
    if (!result.error) {
      try {
        await saveTextToAnki(result.noteId, result.word, result);
      } catch (err) {
        errors.push(`Save text for "${result.word}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 5. Generate and save audio
  for (let i = 0; i < enrichResults.length; i++) {
    const result = enrichResults[i];
    if (result.error) continue;
    await progress.update(
      `Generating audio... ${i + 1}/${enrichResults.length}: ${result.word}`
    );
    try {
      await generateAndSaveAudio(
        result.noteId,
        result.word,
        result.sentence
      );
    } catch (err) {
      errors.push(`Audio for "${result.word}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 6. Generate and save images
  for (let i = 0; i < enrichResults.length; i++) {
    const result = enrichResults[i];
    if (result.error || !result.sentence) continue;
    await progress.update(
      `Generating images... ${i + 1}/${enrichResults.length}: ${result.word}`
    );
    try {
      await generateAndSaveImage(
        result.noteId,
        result.word,
        result.sentence
      );
    } catch (err) {
      errors.push(`Image for "${result.word}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { created: created.length, duplicates: dupes.size, errors };
}

/** Run the full pipeline from extracted worksheet pages */
export async function runFullPipelineFromExtraction(
  pages: ExtractedPage[],
  progress: PipelineProgress
): Promise<{ created: number; duplicates: number; errors: string[] }> {
  const errors: string[] = [];

  // Flatten all words from pages
  const allItems = pages.flatMap((page) =>
    page.sentences.map((s) => ({
      word: s.word,
      sentence: s.sentence,
      termWeek: page.termWeek,
      topic: page.topic,
    }))
  );

  if (allItems.length === 0) {
    return { created: 0, duplicates: 0, errors: ["No words extracted"] };
  }

  // 1. Check duplicates
  await progress.update(
    `Checking duplicates for ${allItems.length} extracted words...`
  );
  const dupes = await checkDuplicates(allItems.map((i) => i.word));
  const newItems = allItems.filter((i) => !dupes.has(i.word.toLowerCase()));

  if (newItems.length === 0) {
    return { created: 0, duplicates: dupes.size, errors };
  }

  await progress.update(
    `${dupes.size} duplicate(s) skipped. Creating ${newItems.length} notes...`
  );

  // 2. Create notes (with proper sentence/cloze from worksheet)
  const cards: SpellingCard[] = newItems.map((item) => ({
    id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    word: item.word,
    sentence: item.sentence,
    mainSentence: buildMainSentence(item.sentence, item.word),
    cloze: buildCloze(item.sentence, item.word),
    termWeek: item.termWeek,
    topic: item.topic,
    edited: false,
  }));

  const noteParams = cards.map((c) => cardToAnkiNote(c));
  const noteIds = await ankiConnect.addNotes(noteParams);

  const created: { noteId: number; word: string; sentence: string }[] = [];
  for (let i = 0; i < noteIds.length; i++) {
    if (noteIds[i] !== null) {
      created.push({
        noteId: noteIds[i]!,
        word: newItems[i].word,
        sentence: newItems[i].sentence,
      });
    }
  }

  if (created.length === 0) {
    return {
      created: 0,
      duplicates: dupes.size,
      errors: ["Failed to create any notes"],
    };
  }

  // 3. Enrich text fields (worksheet already has sentences, so enrich remaining)
  await progress.update(
    `Enriching text fields for ${created.length} words...`
  );
  const enrichFields: TextEnrichField[] = [
    "definition",
    "phonetic",
    "synonyms",
    "extra_info",
  ];
  let enrichResults: BatchEnrichResultItem[];
  try {
    enrichResults = await batchEnrichText(
      created.map((c) => ({
        noteId: c.noteId,
        word: c.word,
        sentence: c.sentence,
      })),
      enrichFields
    );
  } catch (err) {
    errors.push(`Text enrichment failed: ${err instanceof Error ? err.message : String(err)}`);
    return { created: created.length, duplicates: dupes.size, errors };
  }

  // 4. Save text to Anki
  await progress.update("Saving text fields to Anki...");
  for (const result of enrichResults) {
    if (!result.error) {
      try {
        // Don't overwrite sentence from worksheet
        await ankiConnect.updateNoteFields({
          id: result.noteId,
          fields: {
            ...(result.definition ? { Definition: result.definition } : {}),
            ...(result.phonetic
              ? { "Phonetic symbol": result.phonetic }
              : {}),
            ...(result.synonyms
              ? {
                  Synonyms: Array.isArray(result.synonyms)
                    ? result.synonyms.join(", ")
                    : String(result.synonyms),
                }
              : {}),
            ...(result.extra_info
              ? { "Extra information": result.extra_info }
              : {}),
          },
        });
      } catch (err) {
        errors.push(`Save text for "${result.word}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 5. Generate and save audio
  for (let i = 0; i < created.length; i++) {
    const c = created[i];
    await progress.update(
      `Generating audio... ${i + 1}/${created.length}: ${c.word}`
    );
    try {
      await generateAndSaveAudio(c.noteId, c.word, c.sentence);
    } catch (err) {
      errors.push(`Audio for "${c.word}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 6. Generate and save images
  for (let i = 0; i < created.length; i++) {
    const c = created[i];
    await progress.update(
      `Generating images... ${i + 1}/${created.length}: ${c.word}`
    );
    try {
      await generateAndSaveImage(c.noteId, c.word, c.sentence);
    } catch (err) {
      errors.push(`Image for "${c.word}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { created: created.length, duplicates: dupes.size, errors };
}

/** Extract worksheet data from images using AI Vision */
export async function extractFromImages(
  images: ImageInput[]
): Promise<ExtractedPage[]> {
  return runAIVision<ExtractedPage[]>(EXTRACTION_PROMPT, images);
}
