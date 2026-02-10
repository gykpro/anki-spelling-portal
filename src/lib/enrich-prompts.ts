export type TextEnrichField =
  | "sentence"
  | "definition"
  | "phonetic"
  | "synonyms"
  | "extra_info";

const FIELD_DESCRIPTIONS: Record<TextEnrichField, string> = {
  sentence: `"sentence": a natural example sentence using the word/phrase that a 10-year-old can easily understand (10-20 words)`,
  definition: `"definition": a clear, simple definition suitable for a 10-year-old child. If the word has multiple meanings, list the most common 1-2. Format as HTML: <ul><li>meaning one</li><li>meaning two</li></ul>`,
  phonetic: `"phonetic": IPA pronunciation (e.g., /ˈkriːtʃər/). For multi-word phrases, give pronunciation of the key word.`,
  synonyms: `"synonyms": 2-4 synonyms or related words/phrases, as a JSON array of strings`,
  extra_info: `"extra_info": 2 additional example sentences using the word, formatted as HTML: <ul><li>sentence one</li><li>sentence two</li></ul>`,
};

export function getFieldDescription(field: TextEnrichField): string {
  return FIELD_DESCRIPTIONS[field];
}

export function getFieldDescriptions(fields: TextEnrichField[]): string[] {
  return fields.map((f) => FIELD_DESCRIPTIONS[f]);
}

export const ENRICH_SUFFIX = `Important:
- Keep language simple and appropriate for a 10-year-old
- If it's a phrase (like "came down with"), treat it as a unit
- For definitions of phrases, explain the idiomatic meaning`;
