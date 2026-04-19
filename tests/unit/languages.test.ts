import { describe, it, expect } from "vitest";
import { detectLanguage, isSentenceInput, getLanguageById } from "@/lib/languages";

describe("detectLanguage", () => {
  it("returns English config for English-only text", () => {
    expect(detectLanguage("apple").id).toBe("english");
  });

  it("returns Chinese config for text containing CJK characters", () => {
    expect(detectLanguage("苹果").id).toBe("chinese");
  });

  it("returns Chinese config for mixed text containing at least one CJK char", () => {
    expect(detectLanguage("apple 苹果").id).toBe("chinese");
  });

  it("returns English config for empty string (default fallback)", () => {
    expect(detectLanguage("").id).toBe("english");
  });

  it("returns the same object as getLanguageById for each id", () => {
    expect(detectLanguage("apple")).toBe(getLanguageById("english"));
    expect(detectLanguage("苹果")).toBe(getLanguageById("chinese"));
  });
});

describe("isSentenceInput", () => {
  it("returns false for a single English word", () => {
    expect(isSentenceInput("apple")).toBe(false);
  });

  it("returns true for an English sentence with 4+ words ending in '.'", () => {
    expect(isSentenceInput("I ate an apple yesterday.")).toBe(true);
  });

  it("returns false for a short Chinese word (≤5 chars)", () => {
    expect(isSentenceInput("苹果")).toBe(false);
    expect(isSentenceInput("美丽世界")).toBe(false);
  });

  it("returns true for long Chinese text (>5 chars) without punctuation", () => {
    expect(isSentenceInput("今天天气非常好我们出去玩吧")).toBe(true);
  });

  it("returns true for Chinese text ending with '？' or '。'", () => {
    expect(isSentenceInput("你好吗？")).toBe(true);
    expect(isSentenceInput("很好。")).toBe(true);
  });

  it("returns true for English text ending with '!'", () => {
    expect(isSentenceInput("What a great day!")).toBe(true);
  });
});
