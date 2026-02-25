/**
 * Language configuration for skill scripts.
 * Mirrors src/lib/languages.ts — kept in sync manually.
 */

const ENGLISH = {
  id: "english",
  deck: "Gao English Spelling",
  noteType: "school spelling",
  textFields: ["sentence", "definition", "phonetic", "synonyms", "extra_info"],
  extraMediaSteps: [],
  noteFields: {
    Word: "",
    "Main Sentence": "",
    Cloze: "",
    "Phonetic symbol": "",
    Audio: "",
    "Main Sentence Audio": "",
    Definition: "",
    "Extra information": "",
    Picture: "",
    Synonyms: "",
    "Note ID": "",
    is_dictation_mem: "",
  },
};

const CHINESE = {
  id: "chinese",
  deck: "Gao Chinese",
  noteType: "school Chinese spelling",
  textFields: [
    "sentence",
    "definition",
    "phonetic",
    "synonyms",
    "extra_info",
    "sentencePinyin",
  ],
  extraMediaSteps: ["strokeOrder"],
  noteFields: {
    Word: "",
    "Main Sentence": "",
    Cloze: "",
    "Phonetic symbol": "",
    Audio: "",
    "Main Sentence Audio": "",
    Definition: "",
    "Extra information": "",
    Picture: "",
    Synonyms: "",
    "Note ID": "",
    "Main Sentence Pinyin": "",
    "Stroke Order Anim": "",
    is_dictation: "",
    is_dictation_from_mem: "",
  },
};

/** Detect language from text: CJK chars → Chinese, otherwise English */
export function detectLanguage(text) {
  if (/[\u4e00-\u9fff]/.test(text)) return CHINESE;
  return ENGLISH;
}

/** Resolve language: explicit --lang flag > auto-detect from word text > default English */
export function resolveLanguage(langFlag, wordText) {
  if (langFlag === "chinese") return CHINESE;
  if (langFlag === "english") return ENGLISH;
  if (wordText) return detectLanguage(wordText);
  return ENGLISH;
}
