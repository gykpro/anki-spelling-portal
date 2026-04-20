import { CANNED_BY_WORD, CANNED_DEFAULT } from "./canned-enrichment";
import type { ImageInput } from "./ai";

/**
 * Return canned AI output for TEST_MODE.
 * Looks up prompt by finding a __test_* word inside it; falls back to CANNED_DEFAULT.
 */
function findCannedForPrompt(prompt: string) {
  const match = prompt.match(/__test_[a-zA-Z0-9_\u4e00-\u9fff]+/);
  if (match && CANNED_BY_WORD[match[0]]) {
    return CANNED_BY_WORD[match[0]];
  }
  return CANNED_DEFAULT;
}

/** Canned text response — returns the canned enrichment as JSON string. */
export async function runCannedAI(prompt: string): Promise<string> {
  const canned = findCannedForPrompt(prompt);
  return JSON.stringify(canned);
}

/** Canned JSON response — returns the canned enrichment as a typed object. */
export async function runCannedAIJSON<T = unknown>(prompt: string): Promise<T> {
  const canned = findCannedForPrompt(prompt);
  return canned as unknown as T;
}

/** Canned vision response — ignores images, returns a stubbed extraction result. */
export async function runCannedAIVision<T = unknown>(
  _prompt: string,
  _images: ImageInput[]
): Promise<T> {
  return {
    pages: [
      {
        term: "Test",
        week: "1",
        topic: "Canned",
        sentences: [
          { number: 1, word: "__test_canned", sentence: "This is a canned extraction result." },
        ],
      },
    ],
  } as unknown as T;
}
