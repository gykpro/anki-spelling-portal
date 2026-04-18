import { describe, it, expect } from "vitest";
import { getCardCompleteness } from "@/lib/card-completeness";
import { getLanguageById } from "@/lib/languages";
import { makeTestCard } from "../fixtures/make-test-card";

const ENGLISH = getLanguageById("english");

describe("getCardCompleteness (English)", () => {
  it("reports all enrichable text fields missing for a bare word", () => {
    const fields = makeTestCard({ Word: "apple" });
    const result = getCardCompleteness(fields, ENGLISH);
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining(["sentence", "definition", "phonetic", "synonyms", "extra_info", "audio"])
    );
  });

  it("does not flag sentence_audio or image when sentence is empty", () => {
    const fields = makeTestCard({ Word: "apple" });
    const result = getCardCompleteness(fields, ENGLISH);
    expect(result.missing).not.toContain("sentence_audio");
    expect(result.missing).not.toContain("image");
  });

  it("flags sentence_audio and image once a sentence is filled", () => {
    const fields = makeTestCard({
      Word: "apple",
      "Main Sentence": "I ate an apple.",
    });
    const result = getCardCompleteness(fields, ENGLISH);
    expect(result.missing).toContain("sentence_audio");
    expect(result.missing).toContain("image");
  });
});
