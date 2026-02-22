import Anthropic from "@anthropic-ai/sdk";
import { getConfig } from "./settings";

const MODEL = "claude-sonnet-4-5-20250929";

function getClient(): Anthropic {
  const apiKey = getConfig("ANTHROPIC_API_KEY");
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured. Add it in Settings.");
  }
  return new Anthropic({ apiKey });
}

/**
 * Run a text-only prompt via the Anthropic API. Returns the text response.
 */
export async function runAnthropic(prompt: string): Promise<string> {
  const client = getClient();
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Anthropic API");
  }
  return textBlock.text;
}

/**
 * Run a text-only prompt and parse the result as JSON.
 * Strips markdown code fences if present.
 */
export async function runAnthropicJSON<T = unknown>(prompt: string): Promise<T> {
  const resultText = await runAnthropic(prompt);

  let jsonStr = resultText.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(jsonStr);
}

/**
 * Run a multimodal prompt with base64-encoded images.
 * Used for worksheet extraction where Claude needs to see the images.
 */
export async function runAnthropicVision<T = unknown>(
  prompt: string,
  images: { base64: string; mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf" }[]
): Promise<T> {
  const client = getClient();

  const content: Anthropic.MessageCreateParams["messages"][0]["content"] = [];

  for (const img of images) {
    if (img.mediaType === "application/pdf") {
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: img.base64,
        },
      });
    } else {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.mediaType,
          data: img.base64,
        },
      });
    }
  }

  content.push({ type: "text", text: prompt });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    messages: [{ role: "user", content }],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Anthropic API");
  }

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  return JSON.parse(jsonStr);
}
