import type { ExtractedSentence, SpellingCard } from "@/types/spelling";
import type { CreateNoteParams } from "@/types/anki";
import {
  type LanguageConfig,
  detectLanguage,
  getLanguageById,
} from "@/lib/languages";

/**
 * Build the Main Sentence field: sentence with the word wrapped in
 * <span class="nodeword"> tags (matches existing Anki card template styling).
 */
export function buildMainSentence(sentence: string, word: string): string {
  const regex = new RegExp(
    `(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "i"
  );
  return sentence.replace(regex, '<span class="nodeword">$1</span>');
}

/**
 * Build the Cloze field: sentence with the word replaced by {{c1::word}}.
 */
export function buildCloze(sentence: string, word: string): string {
  const regex = new RegExp(
    `(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "i"
  );
  return sentence.replace(regex, "{{c1::$1}}");
}

/**
 * Generate a UUID v4 Note ID (matches existing note ID format in Anki).
 */
function generateNoteId(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Convert an extracted sentence into a SpellingCard for review.
 */
export function buildSpellingCard(
  extracted: ExtractedSentence,
  termWeek: string,
  topic: string
): SpellingCard {
  const hasSentence = extracted.sentence !== "";
  return {
    id: `card_${Date.now()}_${extracted.number}_${Math.random().toString(36).slice(2, 6)}`,
    word: extracted.word,
    sentence: extracted.sentence,
    mainSentence: hasSentence ? buildMainSentence(extracted.sentence, extracted.word) : "",
    cloze: hasSentence ? buildCloze(extracted.sentence, extracted.word) : "",
    termWeek,
    topic,
    edited: false,
  };
}

/**
 * Build the base fields shared by both English and Chinese note types.
 */
function buildBaseFields(
  card: SpellingCard,
  noteId: string
): Record<string, string> {
  return {
    Word: card.word,
    "Main Sentence": card.mainSentence,
    Cloze: card.cloze,
    "Note ID": noteId,
    "Phonetic symbol": "",
    Audio: "",
    "Main Sentence Audio": "",
    Definition: "",
    "Extra information": "",
    Picture: "",
    Synonyms: "",
  };
}

/**
 * Convert a reviewed SpellingCard into Anki note creation params.
 * Language is auto-detected from the word if not provided.
 */
export function cardToAnkiNote(
  card: SpellingCard,
  lang?: LanguageConfig
): CreateNoteParams {
  const noteId = generateNoteId();
  const tag = card.termWeek.toLowerCase().replace(/\s+/g, "_");
  const language = lang ?? detectLanguage(card.word);

  const fields = buildBaseFields(card, noteId);

  if (language.id === "chinese") {
    fields["Main Sentence Pinyin"] = "";
    fields["Stroke Order Anim"] = "";
    fields["is_dictation"] = "";
    fields["is_dictation_from_mem"] = "";
  } else {
    fields["is_dictation_mem"] = "";
  }

  return {
    deckName: language.deck,
    modelName: language.noteType,
    fields,
    tags: [tag, card.topic.toLowerCase().replace(/\s+/g, "_")],
  };
}
