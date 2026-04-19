import { describe, it, expect } from "vitest";
import {
  buildMainSentence,
  buildCloze,
  buildSpellingCard,
  cardToAnkiNote,
} from "@/lib/card-builder";
import { makeSpellingCard } from "../fixtures/make-spelling-card";

describe("buildMainSentence", () => {
  it("wraps the word in <span class='nodeword'>", () => {
    const result = buildMainSentence("I ate an apple.", "apple");
    expect(result).toBe('I ate an <span class="nodeword">apple</span>.');
  });

  it("matches case-insensitively but preserves original case", () => {
    const result = buildMainSentence("Apple pie is great.", "apple");
    expect(result).toBe('<span class="nodeword">Apple</span> pie is great.');
  });

  it("escapes regex special characters in the word", () => {
    const result = buildMainSentence("He's at the café.", "he's");
    expect(result).toBe('<span class="nodeword">He\'s</span> at the café.');
  });
});

describe("buildCloze", () => {
  it("replaces the word with {{c1::word}}", () => {
    expect(buildCloze("I ate an apple.", "apple")).toBe("I ate an {{c1::apple}}.");
  });

  it("matches case-insensitively", () => {
    expect(buildCloze("Apple pie is great.", "apple")).toBe("{{c1::Apple}} pie is great.");
  });
});

describe("buildSpellingCard", () => {
  it("leaves mainSentence and cloze empty when sentence is empty", () => {
    const card = buildSpellingCard(
      { number: 1, word: "apple", sentence: "" },
      "Term 1 Week 1",
      "Fruit"
    );
    expect(card.mainSentence).toBe("");
    expect(card.cloze).toBe("");
    expect(card.word).toBe("apple");
    expect(card.sentence).toBe("");
  });

  it("populates mainSentence and cloze when sentence is non-empty", () => {
    const card = buildSpellingCard(
      { number: 1, word: "apple", sentence: "I ate an apple." },
      "Term 1 Week 1",
      "Fruit"
    );
    expect(card.mainSentence).toBe('I ate an <span class="nodeword">apple</span>.');
    expect(card.cloze).toBe("I ate an {{c1::apple}}.");
  });
});

describe("cardToAnkiNote (English)", () => {
  it("uses Gao English Spelling deck and school spelling note type", () => {
    const note = cardToAnkiNote(makeSpellingCard({ word: "apple" }));
    expect(note.deckName).toBe("Gao English Spelling");
    expect(note.modelName).toBe("school spelling");
  });

  it("includes is_dictation_mem field for English cards", () => {
    const note = cardToAnkiNote(makeSpellingCard({ word: "apple" }));
    expect(note.fields).toHaveProperty("is_dictation_mem");
    expect(note.fields).not.toHaveProperty("Main Sentence Pinyin");
    expect(note.fields).not.toHaveProperty("Stroke Order Anim");
  });

  it("constructs tags from termWeek and topic (lowercased, underscored)", () => {
    const note = cardToAnkiNote(
      makeSpellingCard({ termWeek: "Term 1 Week 2", topic: "Sea Life" })
    );
    expect(note.tags).toEqual(["term_1_week_2", "sea_life"]);
  });
});

describe("cardToAnkiNote (Chinese, auto-detected)", () => {
  it("uses Gao Chinese deck and school Chinese spelling note type", () => {
    const note = cardToAnkiNote(makeSpellingCard({ word: "苹果" }));
    expect(note.deckName).toBe("Gao Chinese");
    expect(note.modelName).toBe("school Chinese spelling");
  });

  it("includes Chinese-specific fields and excludes is_dictation_mem", () => {
    const note = cardToAnkiNote(makeSpellingCard({ word: "苹果" }));
    expect(note.fields).toHaveProperty("Main Sentence Pinyin");
    expect(note.fields).toHaveProperty("Stroke Order Anim");
    expect(note.fields).toHaveProperty("is_dictation");
    expect(note.fields).toHaveProperty("is_dictation_from_mem");
    expect(note.fields).not.toHaveProperty("is_dictation_mem");
  });
});
