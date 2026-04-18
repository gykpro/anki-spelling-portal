/**
 * Factory for test Anki note field records.
 * All test notes use __test_ prefix for cleanup.
 *
 * Usage:
 *   const card = makeTestCard({ Word: "__test_apple", "Main Sentence": "I ate an apple." });
 */

export type TestFields = Record<string, { value: string; order?: number }>;

export interface MakeTestCardOptions {
  /** Override any fields. Missing fields default to empty strings. */
  [fieldName: string]: string | undefined;
}

const DEFAULT_ENGLISH_FIELDS = [
  "Word",
  "Main Sentence",
  "Cloze",
  "Phonetic symbol",
  "Audio",
  "Main Sentence Audio",
  "Definition",
  "Extra information",
  "Picture",
  "Synonyms",
  "Note ID",
  "is_dictation_mem",
] as const;

export function makeTestCard(overrides: MakeTestCardOptions = {}): TestFields {
  const fields: TestFields = {};
  for (const name of DEFAULT_ENGLISH_FIELDS) {
    fields[name] = { value: overrides[name] ?? "" };
  }
  // Allow extra fields not in defaults (e.g. Chinese-only fields)
  for (const [name, value] of Object.entries(overrides)) {
    if (!(name in fields) && value !== undefined) {
      fields[name] = { value };
    }
  }
  // Always ensure the Word has the __test_ prefix unless caller already set it.
  const current = fields["Word"]?.value ?? "";
  if (current && !current.startsWith("__test_")) {
    fields["Word"] = { value: `__test_${current}` };
  }
  return fields;
}
