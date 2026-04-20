# AI Text-Intent Classifier — Design

**Date:** 2026-04-20
**Status:** Draft, pending user review
**Scope:** Replace the brittle CJK-char-count heuristic in Telegram `detectIntent` with an AI classifier, generalised so future English idiom-vs-word-run decisions can reuse the same seam.

## Problem

The Telegram bot misclassifies multi-item Chinese input containing a 4-character idiom (成语) as a sentence instead of a word list.

Reproducer:

```
Input:  "合适，表示，安静，劝告，差不多，后悔，件，手舞足蹈，夜"
Expected: word list of 9 entries
Actual:   classified as a single sentence
```

Root cause — `src/lib/telegram/intent.ts:36`. The heuristic `commaParts.some(p => CJK count > 3)` is meant to identify clause-length parts. But `手舞足蹈` is a 4-character chengyu — a whole vocabulary word, not a clause — and it trips the threshold. Any Chinese word list containing even one 4-character idiom misfires.

This is the second instance of the same anti-pattern. The first was the long-underlined English phrase auto-splitter (PRs #1/#2, eventually deleted): a length-threshold heuristic that couldn't tell idioms from word runs and fired on legitimate phrases. Both failures share a root cause — natural-language structure doesn't respect character/word count thresholds.

## Goals

- **Goal 1 — correctness.** The motivating input resolves to a word list of 9 entries.
- **Goal 2 — reusable seam.** Expose a single `classifyTextIntent(text, lang)` in `src/lib/ai.ts` so future callers (Quick Add, English phrase disambiguation) can share the same classifier rather than re-implementing per surface.
- **Goal 3 — fail loud.** If the AI call fails or times out during intent classification, the bot replies with a retry prompt. No silent fallback to the old heuristic.
- **Goal 4 — cheap for trivial inputs.** Empty strings, slash commands, single words, and text ending in sentence punctuation skip the AI round-trip.

## Non-goals

- Changing Quick Add behavior. Quick Add has its own submission path and is out of scope; it can adopt `classifyTextIntent` in a later change.
- Changing worksheet extraction (`extractFromImages`). The long-underline work is deliberately deleted; it's not part of this spec.
- Reviving English long-phrase splitting. The classifier is built in a way that would *support* it if needed, but no English-worksheet behavior changes here.
- Replacing the existing `isSentenceInput` length utility. It is still used elsewhere (Quick Add); we narrow its usage in `detectIntent` only.
- Caching classifier responses. Inputs are rarely repeated; caching can be added later if cost/latency shows up as an issue.
- A formal retry/backoff inside the classifier. "Fail loud" means one call, one answer; the user retries by re-sending.

## User-facing behavior

### Telegram bot flow after the change

| Input | Behavior |
|---|---|
| `合适，表示，安静，劝告，差不多，后悔，件，手舞足蹈，夜` | AI classifies as `word_list`, returns 9 entries; each enters the queue as an individual word (motivating bug fix). |
| `元旦夜了，大家喜迎新年，开心极了` | AI classifies as `sentence`; existing `extractWordsFromSentence` path runs. |
| `苹果，香蕉，樱桃` | AI classifies as `word_list`; 3 entries queued. |
| `apple, banana, cherry` | AI classifies as `word_list`; 3 entries queued. |
| `I saw a beautiful sunset today.` | **Skips AI** (ends in `.` with ≥2 words) → treated as sentence. |
| `好` or `apple` | **Skips AI** (single token, short) → single-entry word list. |
| `/start`, `/help`, `/lang` | **Skips AI** (command path) — unchanged. |
| (empty / whitespace) | **Skips AI** → `unknown` — unchanged. |
| AI call fails (network/timeout/parse error) | Bot replies `intent_classify_failed` i18n message asking the user to resend. No card is created, no entry is queued. |

### Messages the user sees

One new i18n key pair added to `src/lib/telegram/i18n.ts`:

- `intent_classify_failed` (EN): "Sorry, I couldn't classify your message. Please try again in a moment."
- `intent_classify_failed` (ZH): "抱歉，我暂时无法理解你的消息，请稍后再试。"

All other user-facing messages unchanged.

## Ambiguity gate (when the AI is called)

`detectIntent` first runs deterministic gates. Only messages that survive all gates reach the AI.

1. **Empty / whitespace** → `unknown`. No AI.
2. **Slash command** (`/…`) → `unknown`. No AI.
3. **Ends with sentence-ending punctuation** (`。！？.!?` at end of trimmed text, English `.` requires ≥2 whitespace-separated tokens — same rule as existing `isSentenceInput`) → `sentence` with full text. No AI.
4. **No separators** (no comma/Chinese-comma/enumeration-comma/newline/semicolon) AND short (English: ≤3 whitespace tokens; Chinese: ≤5 CJK chars) → `word_list` with `[trimmed]`. No AI.
5. **Everything else** → call `classifyTextIntent(trimmed, lang)`.

Gate 3 is a deliberate false-positive-tolerant shortcut: text ending in `。！？!?` is overwhelmingly a sentence in this app's real traffic. If a user's word list ends in `!` (e.g. "加油！, 冲！") they'll get classified as sentence — acceptable corner case; they can rephrase.

Gate 4 mirrors the current "single short entry" behavior and avoids an AI call for the 90% of messages that are one-word spellings.

## Architecture

### New primitive — `classifyTextIntent`

In `src/lib/ai.ts`, co-located with `runAI` / `runAIJSON`:

```ts
export type TextIntentResult =
  | { kind: "word_list"; words: string[] }
  | { kind: "sentence"; sentence: string };

export async function classifyTextIntent(
  text: string,
  lang: LanguageConfig,
): Promise<TextIntentResult>;
```

Implementation:

1. Build a short language-aware prompt (see "Prompt" below).
2. Call `runAIJSON<{ kind: "word_list" | "sentence"; words?: string[] }>(prompt)`.
3. Validate the shape. If `kind === "word_list"`:
   - `words` must be a non-empty array of strings; trim each, drop blanks.
   - If the resulting array is empty, throw — caller handles as AI failure.
   - Return `{ kind: "word_list", words }`.
4. If `kind === "sentence"`, return `{ kind: "sentence", sentence: text }` (we pass back the caller's original text — the model never rewrites it).
5. Any other shape → throw a `TypeError` with the offending payload.
6. Errors from `runAIJSON` (network, JSON parse, timeout) propagate unchanged.

### `detectIntent` becomes async

`src/lib/telegram/intent.ts`:

```ts
export type Intent =
  | { type: "word_list"; words: string[]; lang: LanguageConfig }
  | { type: "sentence"; sentence: string; lang: LanguageConfig }
  | { type: "unknown" };

export async function detectIntent(
  text: string,
  classifier: typeof classifyTextIntent = classifyTextIntent,
): Promise<Intent>;
```

- `classifier` is a dependency-injection seam for tests. Default in production is the real AI call.
- Gates 1–4 short-circuit with no `await`.
- Gate 5 awaits `classifier(trimmed, lang)` and maps the result to the `Intent` shape.
- Errors propagate; the handler catches.

The existing synchronous call sites are only in `src/lib/telegram/handlers.ts` (one caller) and the unit test. Both can become async trivially.

### Handler changes

`src/lib/telegram/handlers.ts :: bot.on("message:text", …)`:

```ts
let intent: Intent;
try {
  intent = await detectIntent(text);
} catch (err) {
  console.warn("[telegram] intent classifier failed", err);
  await ctx.reply(t(uid, "intent_classify_failed"));
  return;
}
// rest unchanged
```

No other handlers change.

### Prompt

Kept in `src/lib/ai.ts` (short enough; no new prompts file needed).

```
You are classifying a single message a student sent to their vocabulary-study bot.

Language: {Chinese | English}
Message: <<<{text}>>>

Decide whether the message is:
- "word_list" — a list of vocabulary items separated by commas, enumeration commas, or newlines. Chinese 4-character idioms (成语) are vocabulary items, not sentences. English phrasal verbs and short idioms are vocabulary items, not sentences.
- "sentence" — a complete sentence or multi-clause utterance the student wants cards extracted from.

Respond with JSON only, no commentary:
{"kind":"word_list","words":["item1","item2"]}
or
{"kind":"sentence"}

For word_list, "words" must contain each item verbatim in the order it appears, trimmed of whitespace, with no extras.
```

Prompt specifics:

- The `Language` line is `"Chinese"` or `"English"` based on `lang.id`, so the model's ambiguity heuristics are language-appropriate.
- Double-angle `<<<...>>>` bracketing isolates the user's text from the prompt template to reduce injection risk (a student-typed `"}` token can't break JSON parsing).
- We explicitly call out chengyu + phrasal verbs in the prompt since those are the two historical misclassification cases.
- Response is JSON-only; `runAIJSON`'s existing multi-stage repair handles trailing commas / control chars.

### Data types

No changes to existing Anki, queue, or card types. `Intent` gains no new variant. One new exported type `TextIntentResult` in `src/lib/ai.ts`.

## Testing plan

Follows CLAUDE.md's three hard rules and the mandatory mutation spot-check at the test-review gate.

### Vitest — `tests/unit/ai-text-intent.test.ts` (new)

Tests `classifyTextIntent` against a stubbed `runAIJSON`. Six tests:

1. Returns `{ kind: "word_list", words: [...] }` when model responds with a word list; trims whitespace in items.
2. Returns `{ kind: "sentence", sentence: <original text> }` when model responds with `{ kind: "sentence" }` (text echo comes from caller, not model).
3. Drops blank entries after trimming (e.g. model returned `["apple","","banana"]` → `["apple","banana"]`).
4. Throws if model responds `{ kind: "word_list", words: [] }` (after trim/filter) — callers treat this as failure.
5. Throws on malformed shape (`{ kind: "other" }`, missing `kind`, etc.).
6. Propagates errors from `runAIJSON` unchanged (network error, JSON parse error).

Uses `vi.mock("@/lib/ai")` to stub `runAIJSON` within the test file, or refactors `classifyTextIntent` to take an injected JSON runner. Implementation choice made when writing the test; both satisfy the behavior contract.

### Vitest — `tests/unit/telegram-intent.test.ts` (update existing)

The existing 9 tests stay but are rewritten to `await detectIntent(...)`. Nothing else about their assertions changes for the gate-1–4 paths (empty, slash, short single word, comma-less Chinese word, English ending with `.`). Gate-5 tests now pass an injected classifier stub.

New tests added for the AI-gate path:

7. **Motivating bug fix.** Input `"合适，表示，安静，劝告，差不多，后悔，件，手舞足蹈，夜"`. Injected classifier returns `{ kind: "word_list", words: [9 items] }`. `detectIntent` returns `word_list` with the 9 words and `lang.id === "chinese"`.
8. **Sentence path preserved.** Input `"元旦夜了，大家喜迎新年，开心极了"`. Injected classifier returns `{ kind: "sentence", sentence: <text> }`. `detectIntent` returns `sentence`.
9. **English multi-word still reaches AI.** Input `"hello how are you doing today my friend"`. Injected classifier returns `{ kind: "sentence", sentence: <text> }`. Asserts the classifier was called once. (Replaces the existing "unreachable branch" test documented in the file today.)
10. **Classifier error propagates.** Input that reaches gate 5; injected classifier throws. `detectIntent` re-throws (handler catches).
11. **Short CJK single token skips AI.** Input `"苹果"`. Injected classifier assertion: not called. Returns `word_list` with `["苹果"]`.
12. **Sentence-ending punctuation skips AI.** Input `"I saw a beautiful sunset today."`. Injected classifier assertion: not called. Returns `sentence`.

### Vitest — handler-level error path

No new handler test at first — `handlers.ts` isn't covered by unit tests today and changing that scope is out of this spec. The error branch is covered by integration (user retries sending).

### Mutation spot-check (mandatory at test-review gate)

Before presenting the test diffs for review, mutate production in 4 ways, confirm each is killed, revert. Report in commit body.

- **M1: remove gate 4 (short-single-token short-circuit).** Always call AI for any input reaching that branch. Expect test #11 (asserts classifier not called for `"苹果"`) to fail.
- **M2: remove gate 3 (sentence-end punctuation short-circuit).** Expect test #12 (asserts classifier not called for `"I saw a beautiful sunset today."`) to fail.
- **M3: swallow classifier errors in `detectIntent`.** Return `{ type: "unknown" }` instead of propagating. Expect test #10 to fail (expected `toThrow`).
- **M4: return empty `words` array as success in `classifyTextIntent`.** Expect test #4 to fail.

### Playwright

No new e2e. The bug path is Telegram-only and Playwright doesn't exercise the bot today. Coverage via Vitest is sufficient given `detectIntent` is pure modulo the injected classifier.

## Error handling — fail loud contract

- `classifyTextIntent` throws on: `runAIJSON` rejection, malformed model response, empty word list after filter.
- `detectIntent` does not catch; it propagates.
- `handlers.ts` catches, logs `console.warn`, replies with `intent_classify_failed` i18n key, returns early. **No queue entry is created, no card is built, no AI enrichment runs.**
- This is the explicit user decision ("Fail loud — tell user to retry") from the 2026-04-20 design Q&A.

## Rollout

- No schema, no database, no Anki template change.
- After merge, `npm run dev` restart required so the Telegram bot picks up the new `detectIntent` and i18n strings (per standard project convention).
- First production traffic that hits gate 5 will consume AI tokens; expected volume is small (only messages containing separators, or long English messages without end-punctuation). Watch for budget surprises in the first few days; if cost is an issue, add caching or a local `lru-cache` — explicitly out of scope here.
- Existing queued words are unaffected (they're per-chat in-memory state).

## Open questions

None blocking. The three design decisions (trigger policy, failure behavior, scope) were resolved via `AskUserQuestion` on 2026-04-20.

Flagged for later (not blocking this change):

- **Quick Add parity.** The portal's `/quick-add` page currently has its own sentence-vs-word detection via `isSentenceInput`. It's not in this spec but is a natural next step. Track as a separate item in `docs/todo.md`.
- **Cost monitoring.** No observability is added here; if classifier misfires or bills climb, we'll learn from user reports and add instrumentation then.
