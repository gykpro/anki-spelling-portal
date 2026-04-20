import { describe, it, expect } from "vitest";
import { classifyTextIntent, type TextIntentResult } from "@/lib/ai";
import { getLanguageById } from "@/lib/languages";

const chinese = getLanguageById("chinese");
const english = getLanguageById("english");

/** Build a stub runner that returns a pre-baked JSON payload. */
function jsonRunner<T>(payload: T) {
  return async () => payload as unknown as T;
}

/** Build a stub runner that rejects with the given error. */
function errorRunner(err: Error) {
  return async () => {
    throw err;
  };
}

describe("classifyTextIntent", () => {
  it("returns word_list with trimmed words when model responds word_list", async () => {
    const runner = jsonRunner({
      kind: "word_list",
      words: [" apple ", "banana", "  cherry"],
    });
    const result = await classifyTextIntent(
      "apple, banana, cherry",
      english,
      runner
    );
    expect(result).toEqual<TextIntentResult>({
      kind: "word_list",
      words: ["apple", "banana", "cherry"],
    });
  });

  it("returns sentence with the caller's original text when model responds sentence", async () => {
    // The model returns only { kind: "sentence" }; the caller echoes the text back.
    // This protects against the model rewriting user input.
    const text = "元旦夜了，大家喜迎新年，开心极了";
    const runner = jsonRunner({ kind: "sentence" });
    const result = await classifyTextIntent(text, chinese, runner);
    expect(result).toEqual<TextIntentResult>({
      kind: "sentence",
      sentence: text,
    });
  });

  it("drops blank entries in word_list after trimming", async () => {
    const runner = jsonRunner({
      kind: "word_list",
      words: ["apple", "   ", "", "banana"],
    });
    const result = await classifyTextIntent("apple, banana", english, runner);
    expect(result).toEqual<TextIntentResult>({
      kind: "word_list",
      words: ["apple", "banana"],
    });
  });

  it("throws when word_list is empty after filter (treated as AI failure)", async () => {
    const runner = jsonRunner({ kind: "word_list", words: ["  ", ""] });
    await expect(
      classifyTextIntent("apple", english, runner)
    ).rejects.toThrow();
  });

  it("throws on malformed shape (kind missing or unknown)", async () => {
    const missingKind = jsonRunner({ words: ["apple"] });
    await expect(
      classifyTextIntent("apple", english, missingKind)
    ).rejects.toThrow();

    const unknownKind = jsonRunner({ kind: "other" });
    await expect(
      classifyTextIntent("apple", english, unknownKind)
    ).rejects.toThrow();
  });

  it("propagates errors thrown by the runner", async () => {
    const runner = errorRunner(new Error("network down"));
    await expect(
      classifyTextIntent("anything", english, runner)
    ).rejects.toThrow("network down");
  });
});
