import { describe, it, expect, vi } from "vitest";
import { splitLongPhrasesInPages } from "@/lib/enrichment-pipeline";
import type { ExtractedPage } from "@/types/spelling";
import type { LanguageConfig } from "@/lib/languages";

function makePage(overrides: Partial<ExtractedPage> = {}): ExtractedPage {
  return {
    pageNumber: 1,
    termWeek: "Term 1 Week 1",
    topic: "Test Topic",
    sentences: [],
    ...overrides,
  };
}

describe("splitLongPhrasesInPages", () => {
  it("leaves English words below 5-token threshold untouched and does not call the extractor", async () => {
    const extractor = vi.fn<(s: string, l: LanguageConfig) => Promise<string[]>>();
    const input = [
      makePage({
        sentences: [
          { number: 1, sentence: "I ate an apple.", word: "an apple" },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      { number: 1, sentence: "I ate an apple.", word: "an apple" },
    ]);
    expect(extractor).not.toHaveBeenCalled();
  });

  it("splits at exactly 5 tokens (threshold boundary)", async () => {
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockResolvedValue(["carefully", "slowly"]);
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence: "He walks carefully and slowly.",
            word: "walks carefully and slowly over",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences.map((s) => s.word)).toEqual([
      "carefully",
      "slowly",
    ]);
    expect(extractor).toHaveBeenCalledOnce();
  });

  it("splits the motivating 9-token example and preserves sentence context", async () => {
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockResolvedValue(["infinitely", "trillions"]);
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence:
              "Outer space is an infinitely huge place with trillions of stars.",
            word: "an infinitely huge place with trillions of stars",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence:
          "Outer space is an infinitely huge place with trillions of stars.",
        word: "infinitely",
      },
      {
        number: 1,
        sentence:
          "Outer space is an infinitely huge place with trillions of stars.",
        word: "trillions",
      },
    ]);
    expect(extractor).toHaveBeenCalledWith(
      "an infinitely huge place with trillions of stars",
      expect.objectContaining({ id: "english" }),
    );
  });

  it("leaves Chinese entries untouched regardless of length and does not call the extractor", async () => {
    const extractor = vi.fn<(s: string, l: LanguageConfig) => Promise<string[]>>();
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence: "长句子很长。",
            word: "无边无际的宇宙中有数万亿颗星星",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence: "长句子很长。",
        word: "无边无际的宇宙中有数万亿颗星星",
      },
    ]);
    expect(extractor).not.toHaveBeenCalled();
  });

  it("does not call the extractor for Chinese input even when whitespace-token count would exceed threshold (kills language-gate mutation)", async () => {
    const extractor = vi.fn<(s: string, l: LanguageConfig) => Promise<string[]>>();
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence: "中文句子示例。",
            // Six whitespace-separated CJK tokens. Without the language
            // gate, the length gate alone would let this reach the
            // extractor — this test locks the language gate as the first
            // line of defense.
            word: "中文 短语 有 空格 分开 符号",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence: "中文句子示例。",
        word: "中文 短语 有 空格 分开 符号",
      },
    ]);
    expect(extractor).not.toHaveBeenCalled();
  });

  it("falls back to the original entry when the extractor resolves to an empty array", async () => {
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockResolvedValue([]);
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence: "A long phrase goes here indeed.",
            word: "a long phrase goes here indeed",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence: "A long phrase goes here indeed.",
        word: "a long phrase goes here indeed",
      },
    ]);
  });

  it("falls back to the original entry when the extractor rejects and warns to the console", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockRejectedValue(new Error("boom"));
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence: "A long phrase goes here indeed.",
            word: "a long phrase goes here indeed",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence: "A long phrase goes here indeed.",
        word: "a long phrase goes here indeed",
      },
    ]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("preserves the parent entry's number and sentence on every emitted sub-word entry", async () => {
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockResolvedValue(["alpha", "beta", "gamma"]);
    const input = [
      makePage({
        sentences: [
          {
            number: 7,
            sentence: "The quick brown fox jumps over there.",
            word: "quick brown fox jumps over there",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toHaveLength(3);
    for (const entry of result[0].sentences) {
      expect(entry.number).toBe(7);
      expect(entry.sentence).toBe("The quick brown fox jumps over there.");
    }
  });

  it("dedupes hard words that already appear as words on other entries of the same page (case-insensitive)", async () => {
    const extractor = vi
      .fn<(s: string, l: LanguageConfig) => Promise<string[]>>()
      .mockResolvedValue(["Infinitely", "TRILLIONS"]);
    const input = [
      makePage({
        sentences: [
          {
            number: 1,
            sentence:
              "Outer space is an infinitely huge place with trillions of stars.",
            word: "an infinitely huge place with trillions of stars",
          },
          {
            number: 2,
            sentence: "Trillions everywhere.",
            word: "trillions",
          },
        ],
      }),
    ];

    const result = await splitLongPhrasesInPages(input, extractor);

    expect(result[0].sentences).toEqual([
      {
        number: 1,
        sentence:
          "Outer space is an infinitely huge place with trillions of stars.",
        word: "Infinitely",
      },
      {
        number: 2,
        sentence: "Trillions everywhere.",
        word: "trillions",
      },
    ]);
  });
});
