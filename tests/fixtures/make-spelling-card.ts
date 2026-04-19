import type { SpellingCard } from "@/types/spelling";

/**
 * Factory for SpellingCard fixtures. All fields overridable.
 * Default is an English card with a filled sentence.
 */
export function makeSpellingCard(overrides: Partial<SpellingCard> = {}): SpellingCard {
  return {
    id: "test-card-1",
    word: "apple",
    sentence: "I ate an apple.",
    mainSentence: "",
    cloze: "",
    termWeek: "Term 1 Week 1",
    topic: "Fruit",
    edited: false,
    ...overrides,
  };
}
