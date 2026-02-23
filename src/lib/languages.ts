import type { TextEnrichField } from "@/lib/enrich-prompts";

export interface LanguageConfig {
  id: "english" | "chinese";
  label: string;
  deck: string;
  noteType: string;
  tts: { voice: string; lang: string; wordRate: string; sentenceRate: string };
  enrichFields: TextEnrichField[];
  extraMediaSteps: ("strokeOrder")[];
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
  extraMediaSteps: [],
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
    "definition",
    "phonetic",
    "synonyms",
    "extra_info",
    "sentencePinyin",
  ],
  extraMediaSteps: ["strokeOrder"],
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
