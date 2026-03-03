import { NextRequest, NextResponse } from "next/server";
import { runAIJSON } from "@/lib/ai";
import { ankiConnect } from "@/lib/anki-connect";
import { writeQueue } from "@/lib/write-queue";
import {
  type TextEnrichField,
  getFieldDescriptions,
  ENRICH_SUFFIX,
  CHINESE_ENRICH_SUFFIX,
} from "@/lib/enrich-prompts";
import { generateTTS, generateImage, generateAndSaveStrokeOrder } from "@/lib/enrichment-pipeline";
import { getLanguageByNoteType, type LanguageConfig } from "@/lib/languages";

export type EnrichField =
  | "sentence"
  | "definition"
  | "phonetic"
  | "synonyms"
  | "extra_info"
  | "sentencePinyin"
  | "image"
  | "audio"
  | "sentence_audio"
  | "strokeOrder";

interface EnrichRequest {
  noteId: number;
  word: string;
  sentence?: string;
  fields: EnrichField[];
}

function buildPrompt(
  word: string,
  sentence: string | undefined,
  fields: EnrichField[],
  lang?: LanguageConfig
): string {
  const parts: string[] = [];
  parts.push(`Word/phrase: "${word}"`);
  if (sentence) {
    parts.push(`Context sentence: "${sentence}"`);
  }

  const nonTextFieldSet = new Set(["image", "audio", "sentence_audio", "strokeOrder"]);
  const textFields = fields.filter(
    (f): f is TextEnrichField => !nonTextFieldSet.has(f)
  );
  const requested = getFieldDescriptions(textFields, lang?.id);

  const suffix = lang?.id === "chinese" ? CHINESE_ENRICH_SUFFIX : ENRICH_SUFFIX;

  return `${parts.join("\n")}

Generate the following for this word/phrase. Return ONLY a JSON object, no markdown, no code fences:
{
  ${requested.join(",\n  ")}
}

${suffix}`;
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

    // Detect language from noteId's note type
    let lang: LanguageConfig | undefined;
    if (noteId) {
      try {
        const notesInfo = await ankiConnect.notesInfo([noteId]);
        if (notesInfo.length > 0) {
          lang = getLanguageByNoteType(notesInfo[0].modelName);
        }
      } catch {
        // Fall through — use default (English)
      }
    }

    const results = await writeQueue.enqueue(async () => {
      await ankiConnect.syncBeforeWrite();

      const nonTextFields = new Set(["image", "audio", "sentence_audio", "strokeOrder"]);
      const textFields = fields.filter((f) => !nonTextFields.has(f));
      const needsImage = fields.includes("image");
      const needsAudio = fields.includes("audio");
      const needsSentenceAudio = fields.includes("sentence_audio");
      const needsStrokeOrder = fields.includes("strokeOrder");

      const r: Record<string, unknown> = { noteId, word };

      // Generate text fields via AI backend
      if (textFields.length > 0) {
        const prompt = buildPrompt(word, sentence, textFields as EnrichField[], lang);
        const parsed = await runAIJSON<Record<string, unknown>>(prompt);
        Object.assign(r, parsed);
      }

      // Generate image via Gemini API (requires sentence)
      if (needsImage) {
        const imgSentence = sentence || (r.sentence as string);
        if (!imgSentence) {
          r.image_error = "Sentence required for image generation";
        } else {
          try {
            const imageResult = await generateImage(word, imgSentence);
            r.image = imageResult;
          } catch (err) {
            r.image_error =
              err instanceof Error ? err.message : "Image generation failed";
          }
        }
      }

      // Generate stroke order GIFs (Chinese only)
      if (needsStrokeOrder && noteId) {
        try {
          const strokeMedia = await generateAndSaveStrokeOrder(noteId, word);
          r.strokeOrder = { count: strokeMedia.length };
        } catch (err) {
          r.strokeOrder_error =
            err instanceof Error ? err.message : "Stroke order generation failed";
        }
      }

      // Generate audio via Azure TTS (parallel when both requested)
      const wordPinyin = lang?.id === "chinese"
        ? (r.phonetic as string | undefined) || undefined
        : undefined;
      const sentPinyin = lang?.id === "chinese"
        ? (r.sentencePinyin as string | undefined) || undefined
        : undefined;

      const audioPromises: Promise<void>[] = [];

      if (needsAudio) {
        audioPromises.push(
          generateTTS(word, "word", lang, wordPinyin)
            .then((tts) => { r.audio = tts; })
            .catch((err) => {
              r.audio_error =
                err instanceof Error ? err.message : "Audio generation failed";
            })
        );
      }

      if (needsSentenceAudio) {
        const ttsText = sentence || (r.sentence as string);
        if (!ttsText) {
          r.sentence_audio_error = "Sentence required for sentence audio";
        } else {
          audioPromises.push(
            generateTTS(stripHtmlServer(ttsText), "sentence", lang, sentPinyin)
              .then((tts) => { r.sentence_audio = tts; })
              .catch((err) => {
                r.sentence_audio_error =
                  err instanceof Error ? err.message : "Sentence audio generation failed";
              })
          );
        }
      }

      if (audioPromises.length > 0) {
        await Promise.all(audioPromises);
      }

      return r;
    });

    return NextResponse.json(results);
  } catch (error) {
    console.error("Enrich error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Enrichment failed" },
      { status: 500 }
    );
  }
}
