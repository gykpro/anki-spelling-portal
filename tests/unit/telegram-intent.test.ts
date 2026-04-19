import { describe, it, expect } from "vitest";
import { detectIntent } from "@/lib/telegram/intent";

describe("detectIntent", () => {
  it("returns unknown for empty input", () => {
    expect(detectIntent("")).toEqual({ type: "unknown" });
    expect(detectIntent("   ")).toEqual({ type: "unknown" });
  });

  it("returns unknown for slash commands", () => {
    expect(detectIntent("/start")).toEqual({ type: "unknown" });
    expect(detectIntent("/help")).toEqual({ type: "unknown" });
  });

  it("returns a single-word word_list for a single English word", () => {
    const result = detectIntent("apple");
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["apple"]);
      expect(result.lang.id).toBe("english");
    }
  });

  it("splits English comma-separated input into a word_list", () => {
    const result = detectIntent("apple, banana, cherry");
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["apple", "banana", "cherry"]);
    }
  });

  it("classifies a multi-word English sentence ending with '.' as a sentence", () => {
    const result = detectIntent("I saw a beautiful sunset today.");
    expect(result.type).toBe("sentence");
    if (result.type === "sentence") {
      expect(result.sentence).toBe("I saw a beautiful sunset today.");
      expect(result.lang.id).toBe("english");
    }
  });

  it("classifies a single short Chinese word as word_list", () => {
    const result = detectIntent("苹果");
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["苹果"]);
      expect(result.lang.id).toBe("chinese");
    }
  });

  it("classifies Chinese comma list with short parts as word_list", () => {
    const result = detectIntent("苹果，香蕉，樱桃");
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["苹果", "香蕉", "樱桃"]);
    }
  });

  it("classifies Chinese with commas where at least one part is a clause (>3 CJK) as sentence", () => {
    const result = detectIntent("元旦夜了，大家喜迎新年，开心极了");
    expect(result.type).toBe("sentence");
    if (result.type === "sentence") {
      expect(result.sentence).toBe("元旦夜了，大家喜迎新年，开心极了");
      expect(result.lang.id).toBe("chinese");
    }
  });

  it("classifies long English chitchat as sentence (current behavior; see note)", () => {
    // Note (2026-04-19): src/lib/telegram/intent.ts contains an `unknown`
    // branch for English >5 words that is currently UNREACHABLE because
    // isSentenceInput returns true for English >3 words first, short-circuiting
    // detectIntent to "sentence" before the unknown check runs. The author's
    // comment ("probably a question/message") suggests they wanted long
    // chitchat → unknown, but in practice it becomes a sentence and
    // gets fed to extractWordsFromSentence. Intentional fix (re-ordering
    // the checks) requires a user-facing decision; flagged for follow-up.
    const result = detectIntent("hello how are you doing today my friend");
    expect(result.type).toBe("sentence");
  });
});
