export type TextEnrichField =
  | "sentence"
  | "definition"
  | "phonetic"
  | "synonyms"
  | "extra_info"
  | "sentencePinyin";

const ENGLISH_FIELD_DESCRIPTIONS: Record<string, string> = {
  sentence: `"sentence": a natural example sentence using the word/phrase that a 10-year-old can easily understand (10-20 words)`,
  definition: `"definition": a clear, simple definition suitable for a 10-year-old child. If the word has multiple meanings, list the most common 1-2. Format as HTML: <ul><li>meaning one</li><li>meaning two</li></ul>`,
  phonetic: `"phonetic": IPA pronunciation (e.g., /ˈkriːtʃər/). For multi-word phrases, give pronunciation of the key word.`,
  synonyms: `"synonyms": 2-4 synonyms or related words/phrases, as a JSON array of strings`,
  extra_info: `"extra_info": 2 additional example sentences using the word, formatted as HTML: <ul><li>sentence one</li><li>sentence two</li></ul>`,
};

const CHINESE_FIELD_DESCRIPTIONS: Record<string, string> = {
  sentence: `"sentence": a natural Chinese example sentence using the word/phrase, suitable for a Primary 3 student (8-15 characters)`,
  definition: `"definition": a simple Chinese definition suitable for a Primary 3 child. If the word has multiple meanings, list the most common 1-2. Format as HTML: <ul><li>释义一</li><li>释义二</li></ul>`,
  phonetic: `"phonetic": pinyin with tone marks (e.g., "gǎn kuài"). For multi-character words, give pinyin for each character separated by spaces.`,
  synonyms: `"synonyms": 2-4 Chinese synonyms or related words, as a JSON array of strings`,
  extra_info: `"extra_info": 2 additional Chinese example sentences using the word, formatted as HTML: <ul><li>例句一</li><li>例句二</li></ul>`,
  sentencePinyin: `"sentencePinyin": full pinyin with tone marks for the entire sentence (e.g., "tā pǎo de hěn kuài")`,
};

export function getFieldDescription(
  field: TextEnrichField,
  languageId?: string
): string {
  const descs =
    languageId === "chinese"
      ? CHINESE_FIELD_DESCRIPTIONS
      : ENGLISH_FIELD_DESCRIPTIONS;
  return descs[field] ?? ENGLISH_FIELD_DESCRIPTIONS[field] ?? "";
}

export function getFieldDescriptions(
  fields: TextEnrichField[],
  languageId?: string
): string[] {
  return fields.map((f) => getFieldDescription(f, languageId));
}

export const ENRICH_SUFFIX = `Important:
- Keep language simple and appropriate for a 10-year-old
- If it's a phrase (like "came down with"), treat it as a unit
- For definitions of phrases, explain the idiomatic meaning`;
