import { NextRequest, NextResponse } from "next/server";
import { runAI } from "@/lib/ai";
import { ankiConnect } from "@/lib/anki-connect";
import { extractJsonArray, buildBatchPrompt } from "@/lib/enrichment-pipeline";
import type {
  BatchEnrichRequest,
  BatchEnrichResultItem,
  BatchEnrichResponse,
} from "@/types/enrichment";
import { getLanguageByNoteType, type LanguageConfig } from "@/lib/languages";

const MAX_BATCH_SIZE = 20;

export async function POST(request: NextRequest) {
  try {
    const body: BatchEnrichRequest = await request.json();
    const { cards, fields } = body;

    if (!cards || cards.length === 0 || !fields || fields.length === 0) {
      return NextResponse.json(
        { error: "cards and fields are required" },
        { status: 400 }
      );
    }

    // Detect language from first card's note type
    let lang: LanguageConfig | undefined;
    try {
      const notesInfo = await ankiConnect.notesInfo([cards[0].noteId]);
      if (notesInfo.length > 0) {
        lang = getLanguageByNoteType(notesInfo[0].modelName);
      }
    } catch {
      // Fall through — use default (English)
    }

    await ankiConnect.syncBeforeWrite();

    // Process in chunks of MAX_BATCH_SIZE
    const allResults: BatchEnrichResultItem[] = [];

    for (let i = 0; i < cards.length; i += MAX_BATCH_SIZE) {
      const chunk = cards.slice(i, i + MAX_BATCH_SIZE);
      const prompt = buildBatchPrompt(chunk, fields, lang);

      try {
        const rawText = await runAI(prompt);
        const parsed = extractJsonArray(rawText);

        // Match results back to cards by index (primary) or word (fallback)
        for (let j = 0; j < chunk.length; j++) {
          const card = chunk[j];
          const result = parsed[j] || parsed.find(
            (r) => r.word && String(r.word).toLowerCase() === card.word.toLowerCase()
          );

          if (result) {
            allResults.push({
              noteId: card.noteId,
              word: card.word,
              sentence: result.sentence as string | undefined,
              definition: result.definition as string | undefined,
              phonetic: result.phonetic as string | undefined,
              synonyms: result.synonyms as string[] | undefined,
              extra_info: result.extra_info as string | undefined,
              sentencePinyin: result.sentencePinyin as string | undefined,
            });
          } else {
            allResults.push({
              noteId: card.noteId,
              word: card.word,
              error: "No result returned for this word",
            });
          }
        }
      } catch (err) {
        // Entire chunk failed — mark all cards in chunk with error
        for (const card of chunk) {
          allResults.push({
            noteId: card.noteId,
            word: card.word,
            error: err instanceof Error ? err.message : "Batch enrichment failed",
          });
        }
      }
    }

    const succeeded = allResults.filter((r) => !r.error).length;
    const failed = allResults.filter((r) => !!r.error).length;

    const response: BatchEnrichResponse = { results: allResults, succeeded, failed };
    return NextResponse.json(response);
  } catch (error) {
    console.error("Batch enrich error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Batch enrichment failed" },
      { status: 500 }
    );
  }
}
