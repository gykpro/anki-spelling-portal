/**
 * Shared card completeness logic for stats API and browse page.
 * Determines which enrichable fields are missing for a given card.
 */

import type { LanguageConfig } from "@/lib/languages";

export type FieldCheckKey =
  | "sentence"
  | "definition"
  | "phonetic"
  | "synonyms"
  | "extra_info"
  | "sentencePinyin"
  | "audio"
  | "sentence_audio"
  | "image"
  | "strokeOrder";

interface FieldCheck {
  key: FieldCheckKey;
  ankiField: string;
  /** When set, the field only applies under certain conditions */
  conditional?: "hasSentence" | "chinese";
}

const FIELD_CHECKS: FieldCheck[] = [
  { key: "sentence", ankiField: "Main Sentence" },
  { key: "definition", ankiField: "Definition" },
  { key: "phonetic", ankiField: "Phonetic symbol" },
  { key: "synonyms", ankiField: "Synonyms" },
  { key: "extra_info", ankiField: "Extra information" },
  { key: "sentencePinyin", ankiField: "Main Sentence Pinyin", conditional: "chinese" },
  { key: "audio", ankiField: "Audio" },
  { key: "sentence_audio", ankiField: "Main Sentence Audio", conditional: "hasSentence" },
  { key: "image", ankiField: "Picture", conditional: "hasSentence" },
  { key: "strokeOrder", ankiField: "Stroke Order Anim", conditional: "chinese" },
];

export interface CardCompleteness {
  complete: boolean;
  missing: FieldCheckKey[];
}

/** Text field keys that should only be checked if present in lang.enrichFields */
const TEXT_FIELD_KEYS: Set<FieldCheckKey> = new Set([
  "sentence", "definition", "phonetic", "synonyms", "extra_info", "sentencePinyin",
]);

/**
 * Determine which enrichable fields are missing for a card.
 * A card is complete when all applicable fields are filled.
 */
export function getCardCompleteness(
  fields: Record<string, { value: string }>,
  lang: LanguageConfig
): CardCompleteness {
  const isChinese = lang.id === "chinese";
  const enrichFieldSet = new Set<string>(lang.enrichFields);
  const hasSentence = !!(fields["Main Sentence"]?.value?.trim());
  const missing: FieldCheckKey[] = [];

  for (const check of FIELD_CHECKS) {
    // Text fields: only check if the language config includes this field
    if (TEXT_FIELD_KEYS.has(check.key) && !enrichFieldSet.has(check.key)) continue;

    // Skip fields that don't apply to this card
    if (check.conditional === "chinese" && !isChinese) continue;
    if (check.conditional === "hasSentence" && !hasSentence) continue;

    // Special handling for stroke order: check completeness (partial = missing)
    if (check.key === "strokeOrder") {
      if (!isStrokeOrderComplete(fields)) {
        missing.push(check.key);
      }
      continue;
    }

    const value = fields[check.ankiField]?.value?.trim();
    if (!value) {
      missing.push(check.key);
    }
  }

  return { complete: missing.length === 0, missing };
}

/**
 * Check if stroke order is complete by comparing <img> tag count
 * to the number of CJK characters in the word.
 */
export function isStrokeOrderComplete(
  fields: Record<string, { value: string }>
): boolean {
  const strokeValue = fields["Stroke Order Anim"]?.value?.trim();
  if (!strokeValue) return false;

  const word = fields["Word"]?.value?.trim() || "";
  const cjkChars = word.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || [];
  if (cjkChars.length === 0) return true; // Non-CJK word, nothing to check

  const imgCount = (strokeValue.match(/<img/g) || []).length;
  return imgCount >= cjkChars.length;
}

/** Get all field check definitions (for iteration in UI) */
export function getFieldChecks(): readonly FieldCheck[] {
  return FIELD_CHECKS;
}
