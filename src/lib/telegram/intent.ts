/**
 * Intent detection for Telegram messages.
 * Pure function — no side effects.
 */

import { detectLanguage, isSentenceInput, type LanguageConfig } from "@/lib/languages";

export type Intent =
  | { type: "word_list"; words: string[]; lang: LanguageConfig }
  | { type: "sentence"; sentence: string; lang: LanguageConfig }
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

  // Check if the full text is a sentence BEFORE splitting by commas.
  // For Chinese text with commas, distinguish sentences from word lists:
  //   "元旦夜了，大家喜迎新年，开心极了" → sentence (clauses with >3 CJK chars)
  //   "苹果，香蕉，樱桃" → word list (parts ≤3 CJK chars each)
  if (isSentenceInput(trimmed)) {
    const hasCommas = /[，、,]/.test(trimmed);
    const hasCJK = CJK_RE.test(trimmed);
    if (hasCommas && hasCJK) {
      // Only treat as sentence if at least one comma-separated part is a clause (>3 CJK chars)
      const commaParts = trimmed.split(/[，、,]/).map((p) => p.trim()).filter(Boolean);
      const hasClauses = commaParts.some((p) => (p.match(/[\u4e00-\u9fff]/g) || []).length > 3);
      if (hasClauses) {
        return { type: "sentence", sentence: trimmed, lang };
      }
      // Otherwise fall through to word_list splitting
    } else {
      return { type: "sentence", sentence: trimmed, lang };
    }
  }

  // Split by newlines, commas, semicolons, or Chinese enumeration comma
  const parts = trimmed
    .split(/[\n,;、，]+/)
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
