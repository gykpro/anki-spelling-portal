import { NextRequest, NextResponse } from "next/server";
import { runClaudeJSON } from "@/lib/claude-cli";
import {
  type TextEnrichField,
  getFieldDescriptions,
  ENRICH_SUFFIX,
} from "@/lib/enrich-prompts";

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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function generateTTS(
  text: string,
  type: "word" | "sentence"
): Promise<{ base64: string; format: string }> {
  const key = process.env.AZURE_TTS_KEY;
  const region = process.env.AZURE_TTS_REGION;
  if (!key || !region) throw new Error("Azure TTS credentials not configured");

  const rate = type === "word" ? "-10%" : "0%";
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
  <voice name='en-US-AnaNeural'>
    <prosody rate='${rate}'>${escapeXml(text)}</prosody>
  </voice>
</speak>`;

  const res = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      },
      body: ssml,
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Azure TTS error ${res.status}: ${errBody}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");
  return { base64, format: "mp3" };
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

    const nonTextFields = new Set(["image", "audio", "sentence_audio"]);
    const textFields = fields.filter((f) => !nonTextFields.has(f));
    const needsImage = fields.includes("image");
    const needsAudio = fields.includes("audio");
    const needsSentenceAudio = fields.includes("sentence_audio");

    const results: Record<string, unknown> = { noteId, word };

    // Generate text fields via Claude Code CLI (stdin piped)
    if (textFields.length > 0) {
      const prompt = buildPrompt(word, sentence, textFields);
      const parsed = await runClaudeJSON<Record<string, unknown>>(prompt, {
        timeout: 60_000,
      });
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

async function generateImage(
  word: string,
  sentence: string
): Promise<{ base64: string; mimeType: string }> {
  const apiKey = process.env.NANO_BANANA_API_KEY;
  if (!apiKey) throw new Error("NANO_BANANA_API_KEY not configured");

  const prompt = `Generate a colorful cartoon-style illustration representing this scenario. The image should be intuitive to understand for a 10-year-old child. The sentence is: "${sentence}". The key word is "${word}".`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          responseMimeType: "image/png",
        },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errBody}`);
  }

  const data = await res.json();

  for (const candidate of data.candidates || []) {
    for (const part of candidate.content?.parts || []) {
      if (part.inlineData) {
        return {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        };
      }
    }
  }

  throw new Error("No image returned from Gemini");
}
