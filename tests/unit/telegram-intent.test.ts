import { describe, it, expect } from "vitest";
import { detectIntent } from "@/lib/telegram/intent";
import type { TextIntentResult } from "@/lib/ai";
import type { LanguageConfig } from "@/lib/languages";

/** A classifier stub that asserts it is never called. Fails the test if invoked. */
function unreachableClassifier(): never {
  throw new Error("classifier should not be called for this input");
}

/** Build a classifier stub that records calls and returns a fixed result. */
function stubClassifier(result: TextIntentResult) {
  const calls: Array<{ text: string; langId: string }> = [];
  const fn = async (text: string, lang: LanguageConfig) => {
    calls.push({ text, langId: lang.id });
    return result;
  };
  return Object.assign(fn, { calls });
}

/** Build a classifier stub that rejects. */
function errorClassifier(err: Error) {
  return async () => {
    throw err;
  };
}

describe("detectIntent — gates that skip the AI", () => {
  it("returns unknown for empty input without calling classifier", async () => {
    expect(await detectIntent("", unreachableClassifier)).toEqual({
      type: "unknown",
    });
    expect(await detectIntent("   ", unreachableClassifier)).toEqual({
      type: "unknown",
    });
  });

  it("returns unknown for slash commands without calling classifier", async () => {
    expect(await detectIntent("/start", unreachableClassifier)).toEqual({
      type: "unknown",
    });
    expect(await detectIntent("/help", unreachableClassifier)).toEqual({
      type: "unknown",
    });
  });

  it("short-circuits a single English word to word_list without calling classifier", async () => {
    const result = await detectIntent("apple", unreachableClassifier);
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["apple"]);
      expect(result.lang.id).toBe("english");
    }
  });

  it("short-circuits a short Chinese word to word_list without calling classifier", async () => {
    const result = await detectIntent("苹果", unreachableClassifier);
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["苹果"]);
      expect(result.lang.id).toBe("chinese");
    }
  });

  it("short-circuits English text ending with '.' (≥2 words) to sentence without calling classifier", async () => {
    const result = await detectIntent(
      "I saw a beautiful sunset today.",
      unreachableClassifier
    );
    expect(result.type).toBe("sentence");
    if (result.type === "sentence") {
      expect(result.sentence).toBe("I saw a beautiful sunset today.");
      expect(result.lang.id).toBe("english");
    }
  });

  it("short-circuits Chinese text ending with '。' to sentence without calling classifier", async () => {
    const result = await detectIntent("今天天气真好。", unreachableClassifier);
    expect(result.type).toBe("sentence");
  });
});

describe("detectIntent — AI-gated classifications", () => {
  it("classifies the motivating chengyu-in-list bug as word_list (regression test)", async () => {
    // Previously misclassified as sentence because "手舞足蹈" (4 CJK chars)
    // crossed the old `>3` clause threshold.
    const text = "合适，表示，安静，劝告，差不多，后悔，件，手舞足蹈，夜";
    const classifier = stubClassifier({
      kind: "word_list",
      words: [
        "合适",
        "表示",
        "安静",
        "劝告",
        "差不多",
        "后悔",
        "件",
        "手舞足蹈",
        "夜",
      ],
    });
    const result = await detectIntent(text, classifier);
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual([
        "合适",
        "表示",
        "安静",
        "劝告",
        "差不多",
        "后悔",
        "件",
        "手舞足蹈",
        "夜",
      ]);
      expect(result.lang.id).toBe("chinese");
    }
    expect(classifier.calls).toHaveLength(1);
    expect(classifier.calls[0].langId).toBe("chinese");
  });

  it("classifies a multi-clause Chinese comma string as sentence when classifier says so", async () => {
    const text = "元旦夜了，大家喜迎新年，开心极了";
    const classifier = stubClassifier({ kind: "sentence", sentence: text });
    const result = await detectIntent(text, classifier);
    expect(result.type).toBe("sentence");
    if (result.type === "sentence") {
      expect(result.sentence).toBe(text);
      expect(result.lang.id).toBe("chinese");
    }
  });

  it("routes English comma-separated input through the classifier", async () => {
    const classifier = stubClassifier({
      kind: "word_list",
      words: ["apple", "banana", "cherry"],
    });
    const result = await detectIntent("apple, banana, cherry", classifier);
    expect(result.type).toBe("word_list");
    if (result.type === "word_list") {
      expect(result.words).toEqual(["apple", "banana", "cherry"]);
    }
    expect(classifier.calls).toHaveLength(1);
  });

  it("routes long English text without end-punctuation through the classifier", async () => {
    const text = "hello how are you doing today my friend";
    const classifier = stubClassifier({ kind: "sentence", sentence: text });
    const result = await detectIntent(text, classifier);
    expect(result.type).toBe("sentence");
    expect(classifier.calls).toHaveLength(1);
  });

  it("propagates classifier errors (handler layer is responsible for user-facing retry)", async () => {
    const classifier = errorClassifier(new Error("AI unavailable"));
    await expect(
      detectIntent("合适，表示，手舞足蹈", classifier)
    ).rejects.toThrow("AI unavailable");
  });
});
