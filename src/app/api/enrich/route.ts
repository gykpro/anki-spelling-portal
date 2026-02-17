import { NextRequest, NextResponse } from "next/server";
import { runAIJSON } from "@/lib/ai";
import { ankiConnect } from "@/lib/anki-connect";
import {
  type TextEnrichField,
  getFieldDescriptions,
  ENRICH_SUFFIX,
} from "@/lib/enrich-prompts";
import { generateTTS, generateImage } from "@/lib/enrichment-pipeline";

export type EnrichField =
  | "sentence"
  | "definition"
  | "phonetic"
  | "synonyms"
  | "extra_info"
  | "image"
  | "audio"
  | "sentence_audio";

interface EnrichRequest {
  noteId: number;
  word: string;
  sentence?: string;
  fields: EnrichField[];
}

function buildPrompt(word: string, sentence: string | undefined, fields: EnrichField[]): string {
  const parts: string[] = [];
  parts.push(`Word/phrase: "${word}"`);
  if (sentence) {
    parts.push(`Context sentence: "${sentence}"`);
  }

  const textFields = fields.filter(
    (f): f is TextEnrichField =>
      !["image", "audio", "sentence_audio"].includes(f)
  );
  const requested = getFieldDescriptions(textFields);

  return `${parts.join("\n")}

Generate the following for this word/phrase. Return ONLY a JSON object, no markdown, no code fences:
{
  ${requested.join(",\n  ")}
}

${ENRICH_SUFFIX}`;
}

function stripHtmlServer(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

export async function POST(request: NextRequest) {
  try {
    const body: EnrichRequest = await request.json();
    const { noteId, word, sentence, fields } = body;

    if (!word || !fields || fields.length === 0) {
      return NextResponse.json(
        { error: "word and fields are required" },
        { status: 400 }
      );
    }

    await ankiConnect.syncBeforeWrite();

    const nonTextFields = new Set(["image", "audio", "sentence_audio"]);
    const textFields = fields.filter((f) => !nonTextFields.has(f));
    const needsImage = fields.includes("image");
    const needsAudio = fields.includes("audio");
    const needsSentenceAudio = fields.includes("sentence_audio");

    const results: Record<string, unknown> = { noteId, word };

    // Generate text fields via AI backend
    if (textFields.length > 0) {
      const prompt = buildPrompt(word, sentence, textFields);
      const parsed = await runAIJSON<Record<string, unknown>>(prompt);
      Object.assign(results, parsed);
    }

    // Generate image via Gemini API (requires sentence)
    if (needsImage) {
      const imgSentence = sentence || (results.sentence as string);
      if (!imgSentence) {
        results.image_error = "Sentence required for image generation";
      } else {
        try {
          const imageResult = await generateImage(word, imgSentence);
          results.image = imageResult;
        } catch (err) {
          results.image_error =
            err instanceof Error ? err.message : "Image generation failed";
        }
      }
    }

    // Generate audio via Azure TTS (parallel when both requested)
    const audioPromises: Promise<void>[] = [];

    if (needsAudio) {
      audioPromises.push(
        generateTTS(word, "word")
          .then((tts) => { results.audio = tts; })
          .catch((err) => {
            results.audio_error =
              err instanceof Error ? err.message : "Audio generation failed";
          })
      );
    }

    if (needsSentenceAudio) {
      const ttsText = sentence || (results.sentence as string);
      if (!ttsText) {
        results.sentence_audio_error = "Sentence required for sentence audio";
      } else {
        audioPromises.push(
          generateTTS(stripHtmlServer(ttsText), "sentence")
            .then((tts) => { results.sentence_audio = tts; })
            .catch((err) => {
              results.sentence_audio_error =
                err instanceof Error ? err.message : "Sentence audio generation failed";
            })
        );
      }
    }

    if (audioPromises.length > 0) {
      await Promise.all(audioPromises);
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("Enrich error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}

