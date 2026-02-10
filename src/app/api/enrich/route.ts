import { NextRequest, NextResponse } from "next/server";
import { runClaudeJSON } from "@/lib/claude-cli";

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

  const requested: string[] = [];

  if (fields.includes("sentence")) {
    requested.push(
      `"sentence": a natural example sentence using "${word}" that a 10-year-old can easily understand (10-20 words)`
    );
  }
  if (fields.includes("definition")) {
    requested.push(
      `"definition": a clear, simple definition suitable for a 10-year-old child. If the word has multiple meanings, list the most common 1-2. Format as HTML: <ul><li>meaning one</li><li>meaning two</li></ul>`
    );
  }
  if (fields.includes("phonetic")) {
    requested.push(
      `"phonetic": IPA pronunciation (e.g., /ˈkriːtʃər/). For multi-word phrases, give pronunciation of the key word.`
    );
  }
  if (fields.includes("synonyms")) {
    requested.push(
      `"synonyms": 2-4 synonyms or related words/phrases, as a JSON array of strings`
    );
  }
  if (fields.includes("extra_info")) {
    requested.push(
      `"extra_info": 2 additional example sentences using the word, formatted as HTML: <ul><li>sentence one</li><li>sentence two</li></ul>`
    );
  }

  return `${parts.join("\n")}

Generate the following for this word/phrase. Return ONLY a JSON object, no markdown, no code fences:
{
  ${requested.join(",\n  ")}
}

Important:
- Keep language simple and appropriate for a 10-year-old
- If it's a phrase (like "came down with"), treat it as a unit
- For definitions of phrases, explain the idiomatic meaning`;
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
