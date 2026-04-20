/**
 * Deterministic AI responses for TEST_MODE.
 * Keyed by the primary English word in the prompt.
 * Extend this file when new tests need new canned data.
 */

export interface CannedEnrichment {
  sentence: string;
  cloze: string;
  definition: string;
  phonetic: string;
  synonyms: string;
  extra_info: string;
}

export const CANNED_BY_WORD: Record<string, CannedEnrichment> = {
  __test_apple: {
    sentence: "I ate a crisp red apple after lunch.",
    cloze: "I ate a crisp red {{c1::apple}} after lunch.",
    definition: "A round fruit with red or green skin.",
    phonetic: "/ˈæp.əl/",
    synonyms: "fruit, pome",
    extra_info: "<ul><li>She picked an apple from the tree.</li></ul>",
  },
  __test_banana: {
    sentence: "He peeled a yellow banana for breakfast.",
    cloze: "He peeled a yellow {{c1::banana}} for breakfast.",
    definition: "A long curved yellow tropical fruit.",
    phonetic: "/bəˈnæn.ə/",
    synonyms: "plantain, fruit",
    extra_info: "<ul><li>Monkeys love bananas.</li></ul>",
  },
};

/** Fallback used when a prompt references a word not in CANNED_BY_WORD. */
export const CANNED_DEFAULT: CannedEnrichment = {
  sentence: "This is a canned test sentence.",
  cloze: "This is a canned {{c1::test}} sentence.",
  definition: "A placeholder canned definition.",
  phonetic: "/kænd/",
  synonyms: "fake, stub",
  extra_info: "<ul><li>Canned example one.</li><li>Canned example two.</li></ul>",
};
