import { describe, it, expect } from "vitest";
import { pinyinToNumbered, extractJsonArray } from "@/lib/enrichment-pipeline";

describe("pinyinToNumbered", () => {
  it("converts a single tone-marked syllable to numbered form", () => {
    expect(pinyinToNumbered("nǐ")).toBe("ni3");
  });

  it("converts a multi-syllable tone-marked pinyin string", () => {
    expect(pinyinToNumbered("nǐ hǎo")).toBe("ni3 hao3");
  });

  it("appends neutral tone 5 to syllables with no tone marks", () => {
    expect(pinyinToNumbered("hello")).toBe("hello5");
  });

  it("maps ü (no tone) to v5", () => {
    expect(pinyinToNumbered("nü")).toBe("nv5");
  });
});

describe("extractJsonArray", () => {
  it("parses a clean JSON array string", () => {
    expect(extractJsonArray('[{"a":1},{"b":2}]')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("strips ```json fences before parsing", () => {
    expect(extractJsonArray('```json\n[{"a":1}]\n```')).toEqual([{ a: 1 }]);
  });

  it("extracts the array when JSON is embedded in surrounding prose", () => {
    const input = 'Here is the result: [{"word":"apple"}] -- done.';
    expect(extractJsonArray(input)).toEqual([{ word: "apple" }]);
  });

  it("repairs trailing commas before }] when the direct parse fails", () => {
    const input = '[{"a":1,},]';
    expect(extractJsonArray(input)).toEqual([{ a: 1 }]);
  });

  it("throws when no array is present in the input", () => {
    expect(() => extractJsonArray("this has no json")).toThrow(/No JSON array found/);
  });
});
