import { NextRequest, NextResponse } from "next/server";
import { runAnthropic } from "@/lib/anthropic";
import {
  type TextEnrichField,
  getFieldDescriptions,
  ENRICH_SUFFIX,
} from "@/lib/enrich-prompts";
import type {
  BatchEnrichRequest,
  BatchEnrichResultItem,
  BatchEnrichResponse,
} from "@/types/enrichment";

const MAX_BATCH_SIZE = 20;

/** Extract a JSON array from text that may contain preamble or code fences */
function extractJsonArray(text: string): Record<string, unknown>[] {
  let s = text.trim();
  // Strip markdown code fences
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  // Try direct parse first
  try {
    const result = JSON.parse(s);
    if (Array.isArray(result)) return result;
  } catch {
    // Fall through to extraction
  }
  // Find the first '[' and last ']' to extract the array
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON array found in response");
  }
  return JSON.parse(s.slice(start, end + 1));
}

function buildBatchPrompt(
  cards: BatchEnrichRequest["cards"],
  fields: TextEnrichField[]
): string {
  const fieldDescs = getFieldDescriptions(fields);

  const wordList = cards
    .map((c, i) => {
      let line = `${i + 1}. Word/phrase: "${c.word}"`;
      if (c.sentence) line += ` | Context sentence: "${c.sentence}"`;
      return line;
    })
    .join("\n");

  return `I have ${cards.length} words/phrases. For EACH word, generate these fields:
{
  ${fieldDescs.join(",\n  ")}
}

Words:
${wordList}

Return ONLY a JSON array with exactly ${cards.length} objects, one per word in the same order. Each object must include a "word" field matching the input. No markdown, no code fences.

${ENRICH_SUFFIX}`;
}

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

    // Process in chunks of MAX_BATCH_SIZE
    const allResults: BatchEnrichResultItem[] = [];

    for (let i = 0; i < cards.length; i += MAX_BATCH_SIZE) {
      const chunk = cards.slice(i, i + MAX_BATCH_SIZE);
      const prompt = buildBatchPrompt(chunk, fields);

      try {
        const rawText = await runAnthropic(prompt);
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
