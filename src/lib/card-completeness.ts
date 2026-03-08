/**
 * Shared card completeness logic for stats API and browse page.
 * Determines which enrichable fields are missing for a given card.
 */

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

/**
 * Determine which enrichable fields are missing for a card.
 * A card is complete when all applicable fields are filled.
 */
export function getCardCompleteness(
  fields: Record<string, { value: string }>,
  isChinese: boolean
): CardCompleteness {
  const hasSentence = !!(fields["Main Sentence"]?.value?.trim());
  const missing: FieldCheckKey[] = [];

  for (const check of FIELD_CHECKS) {
    // Skip fields that don't apply to this card
    if (check.conditional === "chinese" && !isChinese) continue;
    if (check.conditional === "hasSentence" && !hasSentence) continue;

    const value = fields[check.ankiField]?.value?.trim();
    if (!value) {
      missing.push(check.key);
    }
  }

  return { complete: missing.length === 0, missing };
}

/** Get all field check definitions (for iteration in UI) */
export function getFieldChecks(): readonly FieldCheck[] {
  return FIELD_CHECKS;
}
