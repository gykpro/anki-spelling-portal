# Sentence-to-Words Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Detect when user input is a full sentence, extract 1-3 key vocabulary words via AI, and create cards with the original sentence pre-filled.

**Architecture:** Add sentence detection in `languages.ts`, word extraction in `enrichment-pipeline.ts`, then wire into Telegram intent/queue/handlers and Portal Quick Add page. The existing enrichment pipeline already skips filled fields, so cards with pre-filled sentences just skip sentence generation.

**Tech Stack:** Anthropic SDK for word extraction, existing languages/pipeline infrastructure.

---

### Task 1: Sentence detection utility

**Files:**
- Modify: `src/lib/languages.ts`

**Step 1: Add `isSentenceInput()` to languages.ts**

Add after the `getLanguageById` function at the bottom of the file:

```typescript
/** Detect if input text is a sentence rather than a word/phrase */
export function isSentenceInput(text: string): boolean {
  const trimmed = text.trim();
  // Sentence-ending punctuation (Chinese or English)
  if (/[。！？.!?]/.test(trimmed)) return true;
  // Chinese: more than 5 characters
  if (/[\u4e00-\u9fff]/.test(trimmed) && trimmed.length > 5) return true;
  // English: more than 3 words
  if (!/[\u4e00-\u9fff]/.test(trimmed) && trimmed.split(/\s+/).length > 3) return true;
  return false;
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/languages.ts
git commit -m "Add isSentenceInput() detection utility"
```

---

### Task 2: AI word extraction function

**Files:**
- Modify: `src/lib/enrichment-pipeline.ts`

**Step 1: Add `extractWordsFromSentence()` function**

Add after the `extractJsonArray` function (around line 313):

```typescript
/** Extract 1-3 key vocabulary words from a sentence via AI */
export async function extractWordsFromSentence(
  sentence: string,
  lang: LanguageConfig
): Promise<string[]> {
  const langLabel = lang.id === "chinese" ? "Chinese" : "English";
  const prompt = `Extract 1-3 key vocabulary words from the following ${langLabel} sentence that would be most valuable for a Primary 4 student to learn and practice.

Sentence: "${sentence}"

Rules:
1. Pick only words that are age-appropriate but challenging for a Primary 4 student (around 10 years old)
2. Skip common/basic words that a P4 student would already know
3. Return 1-3 words maximum — only the most important ones
4. Return ONLY a JSON array of strings, nothing else. Example: ["word1", "word2"]`;

  const rawText = await runAI(prompt);
  const parsed = extractJsonArray(rawText);
  return parsed.map((item) => {
    if (typeof item === "string") return item;
    if (typeof item === "object" && item !== null) {
      // Handle case where AI returns objects instead of strings
      const val = Object.values(item)[0];
      return typeof val === "string" ? val : String(val);
    }
    return String(item);
  }).filter(Boolean);
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/enrichment-pipeline.ts
git commit -m "Add extractWordsFromSentence() AI utility"
```

---

### Task 3: Update word queue and pipeline to support source sentences

**Files:**
- Modify: `src/lib/telegram/word-queue.ts`
- Modify: `src/lib/enrichment-pipeline.ts`

**Step 1: Add `sourceSentence` to QueueEntry**

In `word-queue.ts`, update the `QueueEntry` interface (line 16-19):

```typescript
export interface QueueEntry {
  word: string;
  lang: LanguageConfig;
  sourceSentence?: string;
}
```

**Step 2: Update `runFullPipeline` to accept optional sentences per word**

Change the signature and note creation in `enrichment-pipeline.ts`.

Change `runFullPipeline` signature (line 652-655) to accept word items instead of plain strings:

```typescript
export type WordInput = string | { word: string; sentence: string };

export async function runFullPipeline(
  words: (string | WordInput)[],
  progress: PipelineProgress,
  lang?: LanguageConfig
): Promise<{ created: number; duplicates: number; errors: string[] }> {
```

Then normalize inputs at the start of the function:

```typescript
  // Normalize inputs
  const items = words.map((w) =>
    typeof w === "string" ? { word: w, sentence: "" } : { word: w.word ?? w, sentence: (w as {sentence?: string}).sentence ?? "" }
  );
  const language = lang ?? detectLanguage(items[0]?.word || "");
```

Update duplicate check, word filtering, and note creation to use `items` instead of `words`:

- Duplicate check: use `items.map(i => i.word)`
- Filter: keep items, not just strings
- `createWordNotes`: update to accept items with optional sentences
- When passing to `batchEnrichText`: include sentence from items

Update `createWordNotes` to accept optional sentences:

```typescript
export async function createWordNotes(
  items: { word: string; sentence?: string }[],
  lang?: LanguageConfig
): Promise<{ noteId: number; word: string }[]> {
  const cards: SpellingCard[] = items.map((item) => ({
    id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    word: item.word,
    sentence: item.sentence || "",
    mainSentence: item.sentence ? buildMainSentence(item.sentence, item.word) : "",
    cloze: item.sentence ? buildCloze(item.sentence, item.word) : "",
    termWeek: "telegram",
    topic: "telegram",
    edited: false,
  }));
  ...
```

**Step 3: Update drain() in word-queue.ts to pass source sentences**

In the `drain()` method, when grouping entries by language (line 178-187), also track sentences:

```typescript
const groups = new Map<string, { lang: LanguageConfig; items: { word: string; sentence?: string }[] }>();
for (const entry of entries) {
  const key = entry.lang.id;
  let group = groups.get(key);
  if (!group) {
    group = { lang: entry.lang, items: [] };
    groups.set(key, group);
  }
  group.items.push({ word: entry.word, sentence: entry.sourceSentence });
}
```

Update the `runFullPipeline` call (line 199) to pass items:

```typescript
return runFullPipeline(group.items.map(i => i.sentence ? i : i.word), progress, group.lang);
```

**Step 4: Verify build**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/lib/telegram/word-queue.ts src/lib/enrichment-pipeline.ts
git commit -m "Support source sentences in word queue and pipeline"
```

---

### Task 4: Wire sentence detection into Telegram intent + handlers

**Files:**
- Modify: `src/lib/telegram/intent.ts`
- Modify: `src/lib/telegram/handlers.ts`

**Step 1: Update intent detection to recognize sentences**

In `intent.ts`, add a new intent type and detection. Update the `Intent` type:

```typescript
export type Intent =
  | { type: "word_list"; words: string[]; lang: LanguageConfig }
  | { type: "sentence"; sentence: string; lang: LanguageConfig }
  | { type: "unknown" };
```

In `detectIntent()`, before the `>5 words` English check (line 37-41), add sentence detection:

```typescript
import { isSentenceInput } from "@/lib/languages";

// Check if input is a sentence
if (parts.length === 1 && isSentenceInput(trimmed)) {
  return { type: "sentence", sentence: trimmed, lang };
}
```

**Step 2: Handle sentence intent in handlers.ts**

In `handlers.ts`, in the `bot.on("message:text")` handler (line 208-232), add handling for the sentence intent after the `unknown` check:

```typescript
if (intent.type === "sentence") {
  await progress.update(t(uid, "extracting_words_from_sentence"));
  try {
    const extractedWords = await extractWordsFromSentence(intent.sentence, intent.lang);
    if (extractedWords.length === 0) {
      await ctx.reply(t(uid, "no_words_found_in_sentence"));
      return;
    }
    // Add extracted words to queue with source sentence
    const entries: QueueEntry[] = extractedWords.map((word) => ({
      word,
      lang: intent.lang,
      sourceSentence: intent.sentence,
    }));
    await wordQueue.add(ctx.chat.id, entries);
    // Send confirmation showing extracted words
    await ctx.reply(
      t(uid, "sentence_words_extracted", extractedWords.join(", "), intent.sentence)
    );
  } catch (err) {
    await ctx.reply(t(uid, "error_message", err instanceof Error ? err.message : String(err)));
  }
  return;
}
```

Add import for `extractWordsFromSentence` and `createProgressReporter`.

**Step 3: Add i18n strings**

In `src/lib/telegram/i18n.ts`, add the new translation keys:
- `extracting_words_from_sentence`
- `no_words_found_in_sentence`
- `sentence_words_extracted` (with %1 = words list, %2 = original sentence)

**Step 4: Verify build**

Run: `npx tsc --noEmit`

**Step 5: Commit**

```bash
git add src/lib/telegram/intent.ts src/lib/telegram/handlers.ts src/lib/telegram/i18n.ts
git commit -m "Wire sentence-to-words into Telegram bot"
```

---

### Task 5: Portal Quick Add sentence support

**Files:**
- Modify: `src/app/quick-add/page.tsx`

**Step 1: Add sentence detection and extraction flow**

Add a new phase `"extracting"` and state for extracted sentence data. When user submits and any input line is detected as a sentence:

1. Call a new API endpoint or inline fetch to extract words
2. Show extracted words with the source sentence displayed
3. Let user confirm/edit before creating cards
4. Pass source sentence to the note creation so Main Sentence is pre-filled

Update `buildQuickAddFields()` to accept optional sentence:

```typescript
function buildQuickAddFields(word: string, lang: ReturnType<typeof detectLang>, sentence?: string): Record<string, string> {
  const base: Record<string, string> = {
    Word: word,
    "Main Sentence": sentence ? sentence.replace(
      new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"),
      '<span class="nodeword">$1</span>'
    ) : "",
    Cloze: sentence ? sentence.replace(
      new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i"),
      "{{c1::$1}}"
    ) : "",
    ...
```

Add new API route `src/app/api/extract-words/route.ts` for the portal to call:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { extractWordsFromSentence } from "@/lib/enrichment-pipeline";
import { detectLanguage } from "@/lib/languages";

export async function POST(request: NextRequest) {
  const { sentence } = await request.json();
  const lang = detectLanguage(sentence);
  const words = await extractWordsFromSentence(sentence, lang);
  return NextResponse.json({ words, lang: lang.id });
}
```

**Step 2: Update Quick Add UI**

Add state for sentence extraction results. After user clicks Add:
- Detect which input lines are sentences via `isSentenceInput()`
- For sentences: call `/api/extract-words`, show results
- For regular words: proceed as before
- Show a combined view: regular words + sentence-extracted words with source sentences shown
- User confirms → cards created with pre-filled sentences where applicable

**Step 3: Verify build**

Run: `npx tsc --noEmit`

**Step 4: Commit**

```bash
git add src/app/quick-add/page.tsx src/app/api/extract-words/route.ts
git commit -m "Add sentence-to-words support in Quick Add"
```

---

### Task 6: Enrichment pipeline — skip sentence field when pre-filled

**Files:**
- Verify existing behavior in `src/lib/enrichment-pipeline.ts`

**Step 1: Verify existing behavior**

The enrichment pipeline already passes `sentence` to `batchEnrichText()` when available. In `runFullPipeline`, after creating notes, the enrichment call at line 695 passes `created` which only has `{ noteId, word }`.

Update to also pass the sentence from items so enrichment knows it exists and skips generating it:

```typescript
enrichResults = await batchEnrichText(
  created.map((c) => {
    const item = items.find(i => i.word === c.word);
    return { noteId: c.noteId, word: c.word, sentence: item?.sentence || undefined };
  }),
  undefined,
  language,
  ...
```

When `batchEnrichText` receives cards with sentences, `buildBatchPrompt` already includes context sentences. The field list from `getTextFieldsForLanguage()` includes "sentence" but since the card already has one, we should filter it out:

In `runFullPipeline`, compute enrichFields excluding "sentence" for items that have pre-filled sentences:

```typescript
const needsSentence = created.some((c) => {
  const item = items.find(i => i.word === c.word);
  return !item?.sentence;
});
const enrichFields = needsSentence
  ? getTextFieldsForLanguage(language)
  : getTextFieldsForLanguage(language).filter(f => f !== "sentence");
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/lib/enrichment-pipeline.ts
git commit -m "Skip sentence generation when source sentence is pre-filled"
```

---

### Task 7: Update todo.md and test

**Files:**
- Modify: `docs/todo.md`
- Modify: `tests/ui-test-plan.md`

**Step 1: Add to todo.md under "In Progress" then move to Completed when done**

**Step 2: Add test scenarios to ui-test-plan.md**

Test scenarios:
1. Telegram: send a Chinese sentence (>5 chars) → bot extracts words → cards created with original sentence
2. Telegram: send a short Chinese word (≤5 chars) → treated as normal word
3. Portal Quick Add: enter a sentence → extracted words shown → confirm → cards have Main Sentence filled
4. Verify enrichment skips sentence generation for cards with pre-filled sentences
5. Verify audio generation uses the pre-filled sentence

**Step 3: Run browser tests for the new scenarios**

**Step 4: Commit**

```bash
git add docs/todo.md tests/ui-test-plan.md
git commit -m "Add sentence-to-words feature to roadmap and test plan"
```
