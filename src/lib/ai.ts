import { getConfig, getAIBackend } from "./settings";
import { runAnthropic, runAnthropicJSON, runAnthropicVision } from "./anthropic";
import { runClaude, runClaudeJSON } from "./claude-cli";

export type ImageInput = {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf";
};

function ensureBackend(): "sdk" | "cli" {
  const backend = getAIBackend();
  if (backend === "none") {
    throw new Error(
      "No AI backend configured. Go to Settings to add an Anthropic API key (SDK mode) or Claude OAuth token (CLI mode)."
    );
  }
  return backend;
}

/** Run a text prompt via the configured AI backend. Returns raw text. */
export async function runAI(prompt: string): Promise<string> {
  const backend = ensureBackend();
  if (backend === "sdk") {
    return runAnthropic(prompt);
  }
  return runClaude(prompt);
}

/** Run a text prompt and parse result as JSON. */
export async function runAIJSON<T = unknown>(prompt: string): Promise<T> {
  const backend = ensureBackend();
  if (backend === "sdk") {
    return runAnthropicJSON<T>(prompt);
  }
  return runClaudeJSON<T>(prompt);
}

/** Run a multimodal vision prompt. SDK only — CLI falls back to SDK with error if no API key. */
export async function runAIVision<T = unknown>(
  prompt: string,
  images: ImageInput[]
): Promise<T> {
  const backend = ensureBackend();
  if (backend === "cli") {
    // Vision requires SDK — check if API key is also available
    if (getConfig("ANTHROPIC_API_KEY")) {
      return runAnthropicVision<T>(prompt, images);
    }
    throw new Error(
      "Image/PDF extraction requires an Anthropic API key. Add one in Settings (required even in CLI mode)."
    );
  }
  return runAnthropicVision<T>(prompt, images);
}
