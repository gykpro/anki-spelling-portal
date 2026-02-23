/**
 * Intent detection for Telegram messages.
 * Pure function — no side effects.
 */

import { detectLanguage, type LanguageConfig } from "@/lib/languages";

export type Intent =
  | { type: "word_list"; words: string[]; lang: LanguageConfig }
  | { type: "unknown" };

const CJK_RE = /[\u4e00-\u9fff]/;

/** Detect whether a text message is a word list or unknown */
export function detectIntent(text: string): Intent {
  const trimmed = text.trim();
  if (!trimmed) return { type: "unknown" };

  // Ignore commands (handled separately by bot.command())
  if (trimmed.startsWith("/")) return { type: "unknown" };

  // Detect language from text content
  const lang = detectLanguage(trimmed);

  // Split by newlines, commas, semicolons, or Chinese enumeration comma
  const parts = trimmed
    .split(/[\n,;、]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length > 1) {
    return { type: "word_list", words: parts, lang };
  }

  // Single entry: for English, >5 words is probably a question/message.
  // For Chinese, characters aren't space-separated so skip this heuristic.
  if (!CJK_RE.test(trimmed)) {
    const wordCount = trimmed.split(/\s+/).length;
    if (wordCount > 5) {
      return { type: "unknown" };
    }
  }

  return { type: "word_list", words: [trimmed], lang };
}
