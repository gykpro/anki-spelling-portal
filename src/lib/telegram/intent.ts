/**
 * Intent detection for Telegram messages.
 * Pure function — no side effects.
 */

export type Intent =
  | { type: "word_list"; words: string[] }
  | { type: "unknown" };

/** Detect whether a text message is a word list or unknown */
export function detectIntent(text: string): Intent {
  const trimmed = text.trim();
  if (!trimmed) return { type: "unknown" };

  // Split by newlines, commas, or semicolons
  const parts = trimmed
    .split(/[\n,;]+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length > 1) {
    return { type: "word_list", words: parts };
  }

  // Single entry: if >5 words it's probably a question/message, not a word to add
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount > 5) {
    return { type: "unknown" };
  }

  return { type: "word_list", words: [trimmed] };
}
