import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai", () => ({
  runAI: vi.fn(),
  runAIVision: vi.fn(),
}));

import { runAI, runAIVision } from "@/lib/ai";
import { extractFromImages } from "@/lib/enrichment-pipeline";
import type { ExtractedPage } from "@/types/spelling";

describe("extractFromImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the Vision output verbatim and does NOT auto-split long English phrases", async () => {
    const visionPages: ExtractedPage[] = [
      {
        pageNumber: 1,
        termWeek: "Term 1 Week 1",
        topic: "Test",
        sentences: [
          {
            number: 1,
            sentence:
              "Outer space is an infinitely huge place with trillions of stars.",
            word: "an infinitely huge place with trillions of stars",
          },
        ],
      },
    ];
    vi.mocked(runAIVision).mockResolvedValue(visionPages);
    // If the splitter were called, it would invoke runAI to extract
    // sub-words. We mock runAI to resolve to a valid JSON array so the
    // splitter WOULD successfully split if invoked — that way this test
    // distinguishes "splitter disabled" (expected) from "splitter fell
    // back due to extractor error" (would also return original entry).
    vi.mocked(runAI).mockResolvedValue('["infinitely", "trillions"]');

    const result = await extractFromImages([]);

    expect(result).toEqual(visionPages);
    expect(result[0].sentences).toHaveLength(1);
    expect(result[0].sentences[0].word).toBe(
      "an infinitely huge place with trillions of stars",
    );
    // Prove the extractor wasn't called — auto-split is off, not
    // silently falling back.
    expect(runAI).not.toHaveBeenCalled();
  });
});
