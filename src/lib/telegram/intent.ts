/**
 * Intent detection for Telegram messages.
 *
 * Deterministic gates handle the common unambiguous cases synchronously;
 * everything else is delegated to an AI classifier. Errors from the
 * classifier propagate — the handler layer replies with a retry message.
 */

import { detectLanguage, type LanguageConfig } from "@/lib/languages";
import { classifyTextIntent } from "@/lib/ai";

export type Intent =
  | { type: "word_list"; words: string[]; lang: LanguageConfig }
  | { type: "sentence"; sentence: string; lang: LanguageConfig }
  | { type: "unknown" };

const CJK_RE = /[\u4e00-\u9fff]/;
const SEPARATOR_RE = /[,，、;\n]/;
const END_PUNCT_CJK_RE = /[。！？!?]$/;
const END_PUNCT_EN_PERIOD_RE = /\.\s*$/;

/**
 * Detect whether a text message is a word list, a sentence, or unknown.
 *
 * `classifier` is injected for tests; the production default is the real
 * AI-backed classifier in `src/lib/ai.ts`.
 */
export async function detectIntent(
  text: string,
  classifier: typeof classifyTextIntent = classifyTextIntent,
): Promise<Intent> {
  const trimmed = text.trim();

  // Gate 1 — empty / whitespace
  if (!trimmed) return { type: "unknown" };

  // Gate 2 — slash commands (handled separately by bot.command())
  if (trimmed.startsWith("/")) return { type: "unknown" };

  const lang = detectLanguage(trimmed);

  // Gate 3 — ends with sentence-ending punctuation
  if (END_PUNCT_CJK_RE.test(trimmed)) {
    return { type: "sentence", sentence: trimmed, lang };
  }
  if (
    END_PUNCT_EN_PERIOD_RE.test(trimmed) &&
    trimmed.split(/\s+/).length > 2
  ) {
    return { type: "sentence", sentence: trimmed, lang };
  }

  // Gate 4 — short single token, no separators → single-item word list
  if (!SEPARATOR_RE.test(trimmed) && !/\s/.test(trimmed)) {
    // No internal whitespace or separators at all: one token.
    const cjkCount = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;
    const isShortChinese = CJK_RE.test(trimmed) && cjkCount <= 5;
    const isShortEnglish = !CJK_RE.test(trimmed);
    if (isShortChinese || isShortEnglish) {
      return { type: "word_list", words: [trimmed], lang };
    }
  } else if (!SEPARATOR_RE.test(trimmed)) {
    // English multi-word phrase without separators: if ≤3 words, treat as word list.
    if (!CJK_RE.test(trimmed)) {
      const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
      if (wordCount <= 3) {
        return { type: "word_list", words: [trimmed], lang };
      }
    }
  }

  // Gate 5 — everything else goes to AI
  const result = await classifier(trimmed, lang);
  if (result.kind === "word_list") {
    return { type: "word_list", words: result.words, lang };
  }
  return { type: "sentence", sentence: result.sentence, lang };
}
