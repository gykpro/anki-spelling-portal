import type { TextEnrichField } from "@/lib/enrich-prompts";

export interface LanguageConfig {
  id: "english" | "chinese";
  label: string;
  deck: string;
  noteType: string;
  tts: { voice: string; lang: string; wordRate: string; sentenceRate: string };
  enrichFields: TextEnrichField[];
  extraMediaSteps: ("strokeOrder" | "extraInfoAudio")[];
}

const ENGLISH: LanguageConfig = {
  id: "english",
  label: "English",
  deck: "Gao English Spelling",
  noteType: "school spelling",
  tts: {
    voice: "en-US-AnaNeural",
    lang: "en-US",
    wordRate: "-10%",
    sentenceRate: "0%",
  },
  enrichFields: ["sentence", "definition", "phonetic", "synonyms", "extra_info"],
  extraMediaSteps: ["extraInfoAudio"],
};

const CHINESE: LanguageConfig = {
  id: "chinese",
  label: "Chinese",
  deck: "Gao Chinese",
  noteType: "school Chinese spelling",
  tts: {
    voice: "zh-CN-XiaoxiaoNeural",
    lang: "zh-CN",
    wordRate: "-10%",
    sentenceRate: "0%",
  },
  enrichFields: [
    "sentence",
    "phonetic",
    "extra_info",
    "sentencePinyin",
  ],
  extraMediaSteps: ["strokeOrder", "extraInfoAudio"],
};

const ALL_LANGUAGES: LanguageConfig[] = [ENGLISH, CHINESE];

const NOTE_TYPE_MAP = new Map<string, LanguageConfig>(
  ALL_LANGUAGES.map((l) => [l.noteType, l])
);

const DECK_MAP = new Map<string, LanguageConfig>(
  ALL_LANGUAGES.map((l) => [l.deck, l])
);

/** Detect language from text content. Chinese chars → Chinese, otherwise English. */
export function detectLanguage(text: string): LanguageConfig {
  if (/[\u4e00-\u9fff]/.test(text)) return CHINESE;
  return ENGLISH;
}

/** Get language config by Anki note type name */
export function getLanguageByNoteType(
  noteType: string
): LanguageConfig | undefined {
  return NOTE_TYPE_MAP.get(noteType);
}

/** Get language config by Anki deck name */
export function getLanguageByDeck(
  deck: string
): LanguageConfig | undefined {
  return DECK_MAP.get(deck);
}

/** Get all configured languages */
export function getAllLanguages(): LanguageConfig[] {
  return ALL_LANGUAGES;
}

/** Get a specific language by id */
export function getLanguageById(
  id: "english" | "chinese"
): LanguageConfig {
  return id === "chinese" ? CHINESE : ENGLISH;
}

/**
 * Detect whether user input is a full sentence (vs a word/phrase).
 *
 * Rules:
 * - Contains sentence-ending punctuation (。！？.!?) → sentence
 * - Chinese (contains CJK chars): more than 5 characters → sentence
 * - English (no CJK chars): more than 3 words → sentence
 * - Otherwise → not a sentence
 */
export function isSentenceInput(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // Chinese/special sentence-ending punctuation → sentence
  if (/[。！？!?]$/.test(trimmed)) return true;
  // English period: only if at end AND has multiple words (avoids "Dr.", "3.5", etc.)
  if (/\.\s*$/.test(trimmed) && trimmed.split(/\s+/).length > 2) return true;

  const hasCJK = /[\u4e00-\u9fff]/.test(trimmed);

  if (hasCJK) {
    // Chinese: more than 5 characters → sentence
    return trimmed.length > 5;
  } else {
    // English: more than 3 words → sentence
    const words = trimmed.split(/\s+/).filter(Boolean);
    return words.length > 3;
  }
}
