import { getConfig, getAIBackend } from "./settings";
import { runAnthropic, runAnthropicJSON, runAnthropicVision } from "./anthropic";
import { runClaude, runClaudeJSON, runClaudeVision } from "./claude-cli";
import { runCannedAI, runCannedAIJSON, runCannedAIVision } from "./canned-ai";
import type { LanguageConfig } from "./languages";

export type ImageInput = {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf";
};

export type TextIntentResult =
  | { kind: "word_list"; words: string[] }
  | { kind: "sentence"; sentence: string };

function ensureBackend(): "sdk" | "cli" | "canned" {
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
  if (backend === "canned") return runCannedAI(prompt);
  if (backend === "sdk") return runAnthropic(prompt);
  return runClaude(prompt);
}

/** Run a text prompt and parse result as JSON. */
export async function runAIJSON<T = unknown>(prompt: string): Promise<T> {
  const backend = ensureBackend();
  if (backend === "canned") return runCannedAIJSON<T>(prompt);
  if (backend === "sdk") return runAnthropicJSON<T>(prompt);
  return runClaudeJSON<T>(prompt);
}

/**
 * Classify whether a user text message is a word list or a full sentence.
 * The model never rewrites the text — for sentences we echo the caller's
 * original `text` into the result so handlers work from ground truth.
 * Throws on any malformed response, empty word-list, or runner error so
 * the caller can fail loud.
 */
export async function classifyTextIntent(
  text: string,
  lang: LanguageConfig,
  runner: (prompt: string) => Promise<unknown> = runAIJSON,
): Promise<TextIntentResult> {
  const languageLabel = lang.id === "chinese" ? "Chinese" : "English";
  const prompt = `You are classifying a single message a student sent to their vocabulary-study bot.

Language: ${languageLabel}
Message: <<<${text}>>>

Decide whether the message is:
- "word_list" — a list of vocabulary items separated by commas, enumeration commas, or newlines. Chinese 4-character idioms (成语) are vocabulary items, not sentences. English phrasal verbs and short idioms are vocabulary items, not sentences.
- "sentence" — a complete sentence or multi-clause utterance the student wants cards extracted from.

Respond with JSON only, no commentary:
{"kind":"word_list","words":["item1","item2"]}
or
{"kind":"sentence"}

For word_list, "words" must contain each item verbatim in the order it appears, trimmed of whitespace, with no extras.`;

  const raw = await runner(prompt);
  if (!raw || typeof raw !== "object") {
    throw new TypeError(`classifyTextIntent: malformed response (not an object): ${JSON.stringify(raw)}`);
  }
  const obj = raw as { kind?: unknown; words?: unknown };
  if (obj.kind === "sentence") {
    return { kind: "sentence", sentence: text };
  }
  if (obj.kind === "word_list") {
    if (!Array.isArray(obj.words)) {
      throw new TypeError(`classifyTextIntent: word_list missing words array: ${JSON.stringify(raw)}`);
    }
    const words = obj.words
      .map((w) => (typeof w === "string" ? w.trim() : ""))
      .filter((w) => w.length > 0);
    if (words.length === 0) {
      throw new Error(`classifyTextIntent: word_list empty after filter: ${JSON.stringify(raw)}`);
    }
    return { kind: "word_list", words };
  }
  throw new TypeError(`classifyTextIntent: unknown kind: ${JSON.stringify(raw)}`);
}

/** Run a multimodal vision prompt. Uses SDK (base64) or CLI (temp files + Read tool). */
export async function runAIVision<T = unknown>(
  prompt: string,
  images: ImageInput[]
): Promise<T> {
  const backend = ensureBackend();
  if (backend === "canned") return runCannedAIVision<T>(prompt, images);
  if (backend === "cli") {
    // Prefer SDK if API key is available (faster, no temp files)
    if (getConfig("ANTHROPIC_API_KEY")) {
      return runAnthropicVision<T>(prompt, images);
    }
    return runClaudeVision<T>(prompt, images);
  }
  return runAnthropicVision<T>(prompt, images);
}
