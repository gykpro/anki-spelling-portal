# Pipeline Unification & Language-Driven Field Config — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `LanguageConfig` the single source of truth for enrichment fields, remove definition/synonyms from Chinese enrichment, unify the two pipeline functions, and change the dev server port.

**Architecture:** Remove "definition" and "synonyms" from `CHINESE.enrichFields`. Make card-completeness, enrich page, and stats API language-aware by reading `LanguageConfig.enrichFields`. Merge `runFullPipeline` and `runFullPipelineFromExtraction` into a single `runPipeline()`. Change dev port to 3001.

**Tech Stack:** TypeScript, Next.js, AnkiConnect

---

### Task 1: Update Chinese enrichFields

**Files:**
- Modify: `src/lib/languages.ts:39-46`

**Step 1: Update CHINESE config**

Change `enrichFields` from:
```typescript
enrichFields: [
  "sentence",
  "definition",
  "phonetic",
  "synonyms",
  "extra_info",
  "sentencePinyin",
],
```
To:
```typescript
enrichFields: [
  "sentence",
  "phonetic",
  "extra_info",
  "sentencePinyin",
],
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/languages.ts
git commit -m "feat: remove definition and synonyms from Chinese enrichFields"
```

---

### Task 2: Make card-completeness language-aware

**Files:**
- Modify: `src/lib/card-completeness.ts`
- Modify: `src/app/api/stats/route.ts:88`
- Modify: `src/app/browse/page.tsx:154,185`

Currently `getCardCompleteness(fields, isChinese)` treats definition and synonyms as required for all languages. After Task 1, Chinese cards would always be "incomplete".

**Step 1: Add language-aware conditional to FIELD_CHECKS**

In `src/lib/card-completeness.ts`, change the `conditional` type and add conditions:

```typescript
/** When set, the field only applies under certain conditions */
conditional?: "hasSentence" | "chinese" | "enrichField";
/** For enrichField conditional: the enrichField key to check */
enrichFieldKey?: string;
```

Actually, simpler approach — change `getCardCompleteness` signature to accept a `LanguageConfig` and filter fields based on `enrichFields`:

In `src/lib/card-completeness.ts`:

```typescript
import type { LanguageConfig } from "@/lib/languages";

// Add a set of "text enrichment" keys (not media)
const TEXT_FIELD_KEYS = new Set<FieldCheckKey>([
  "sentence", "definition", "phonetic", "synonyms", "extra_info", "sentencePinyin",
]);

export function getCardCompleteness(
  fields: Record<string, { value: string }>,
  lang: LanguageConfig
): CardCompleteness {
  const isChinese = lang.id === "chinese";
  const hasSentence = !!(fields["Main Sentence"]?.value?.trim());
  const enrichFieldSet = new Set(lang.enrichFields);
  const missing: FieldCheckKey[] = [];

  for (const check of FIELD_CHECKS) {
    // Skip text fields not in this language's enrichFields
    if (TEXT_FIELD_KEYS.has(check.key) && !enrichFieldSet.has(check.key as any)) continue;

    // Skip fields that don't apply to this card
    if (check.conditional === "chinese" && !isChinese) continue;
    if (check.conditional === "hasSentence" && !hasSentence) continue;

    // Special handling for stroke order
    if (check.key === "strokeOrder") {
      if (!isStrokeOrderComplete(fields)) {
        missing.push(check.key);
      }
      continue;
    }

    const value = fields[check.ankiField]?.value?.trim();
    if (!value) {
      missing.push(check.key);
    }
  }

  return { complete: missing.length === 0, missing };
}
```

**Step 2: Update callers — stats API**

In `src/app/api/stats/route.ts:88`, change:
```typescript
// Before:
const result = getCardCompleteness(note.fields, isChinese);
// After:
import { getLanguageByNoteType, getLanguageById } from "@/lib/languages";
// ... detect lang from note.modelName ...
const lang = getLanguageByNoteType(note.modelName) ?? getLanguageById("english");
const result = getCardCompleteness(note.fields, lang);
```

**Step 3: Update callers — browse page**

In `src/app/browse/page.tsx:154,185`, same change — pass `LanguageConfig` instead of boolean.

**Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 5: Commit**

```bash
git add src/lib/card-completeness.ts src/app/api/stats/route.ts src/app/browse/page.tsx
git commit -m "feat: make card-completeness language-aware via LanguageConfig"
```

---

### Task 3: Make Enrich page field availability language-driven

**Files:**
- Modify: `src/app/enrich/page.tsx:52-115`

**Step 1: Update getEnrichableFields to use LanguageConfig**

In `src/app/enrich/page.tsx`, change `getEnrichableFields(note)`:

```typescript
function getEnrichableFields(note: AnkiNote) {
  const word = getFieldValue(note, "Word");
  const sentence = getFieldValue(note, "Main Sentence");
  const hasSentence = !!sentence;
  const chinese = isChinese(note);
  const lang = getLanguageByNoteType(note.modelName) ?? getLanguageById(chinese ? "chinese" : "english");
  const enrichFieldSet = new Set(lang.enrichFields);

  const fields: Record<EnrichField, { available: boolean; filled: boolean; label: string }> = {
    sentence: { available: enrichFieldSet.has("sentence"), filled: hasSentence, label: "Sentence" },
    definition: {
      available: enrichFieldSet.has("definition"),
      filled: !!getFieldValue(note, "Definition"),
      label: "Definition",
    },
    phonetic: {
      available: enrichFieldSet.has("phonetic"),
      filled: !!getFieldValue(note, "Phonetic symbol"),
      label: chinese ? "Pinyin" : "Phonetic",
    },
    synonyms: {
      available: enrichFieldSet.has("synonyms"),
      filled: !!getFieldValue(note, "Synonyms"),
      label: "Synonyms",
    },
    extra_info: {
      available: enrichFieldSet.has("extra_info"),
      filled: !!getFieldValue(note, "Extra information"),
      label: "Extra Examples",
    },
    sentencePinyin: {
      available: enrichFieldSet.has("sentencePinyin"),
      filled: !!getFieldValue(note, "Main Sentence Pinyin"),
      label: "Sentence Pinyin",
    },
    image: {
      available: hasSentence,
      filled: !!getFieldValue(note, "Picture"),
      label: "Image",
    },
    audio: {
      available: true,
      filled: !!getFieldValue(note, "Audio"),
      label: "Word Audio",
    },
    sentence_audio: {
      available: hasSentence,
      filled: !!getFieldValue(note, "Main Sentence Audio"),
      label: "Sentence Audio",
    },
    strokeOrder: {
      available: lang.extraMediaSteps.includes("strokeOrder"),
      filled: !!getFieldValue(note, "Stroke Order Anim"),
      label: "Stroke Order",
    },
  };

  return { word, sentence: stripHtml(sentence), hasSentence, chinese, fields };
}
```

**Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/app/enrich/page.tsx
git commit -m "feat: enrich page field availability driven by LanguageConfig"
```

---

### Task 4: Unify pipeline functions

**Files:**
- Modify: `src/lib/enrichment-pipeline.ts`
- Modify: `src/lib/telegram/word-queue.ts:12,200`
- Modify: `src/lib/telegram/handlers.ts:8,338,424`

This is the largest task. The two functions share ~90% code. The differences:

1. **Input shape**: `runFullPipeline` takes `{word, sentence?}[]`; extraction takes `ExtractedPage[]` (flattened to `{word, sentence, termWeek, topic}[]`)
2. **Note creation**: extraction passes `termWeek` and `topic` to cards; word pipeline uses `"telegram"` defaults
3. **Sentence handling in enrichment**: extraction items always have sentences; word pipeline may not

**Step 1: Define unified PipelineItem type and merge into single function**

```typescript
export interface PipelineItem {
  word: string;
  sentence?: string;
  termWeek?: string;
  topic?: string;
}

export async function runPipeline(
  items: PipelineItem[],
  progress: PipelineProgress,
  lang?: LanguageConfig
): Promise<{ created: number; duplicates: number; errors: string[] }>
```

The function body is `runFullPipeline` with these changes:
- `createWordNotes` receives `PipelineItem[]` and passes `termWeek`/`topic` (defaulting to `"telegram"`)
- Everything else is identical

**Step 2: Update createWordNotes to accept PipelineItem**

Change `createWordNotes` signature to accept items with optional `termWeek` and `topic`:

```typescript
export async function createWordNotes(
  items: PipelineItem[],
  lang?: LanguageConfig
): Promise<{ noteId: number; word: string; sentence?: string }[]> {
  const cards: SpellingCard[] = items.map((item) => ({
    id: `tg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    word: item.word,
    sentence: item.sentence ?? "",
    mainSentence: item.sentence ? buildMainSentence(item.sentence, item.word) : "",
    cloze: item.sentence ? buildCloze(item.sentence, item.word) : "",
    termWeek: item.termWeek ?? "telegram",
    topic: item.topic ?? "telegram",
    edited: false,
  }));
  // ... rest unchanged
}
```

**Step 3: Delete `runFullPipelineFromExtraction`, keep only `runPipeline`**

Remove the entire `runFullPipelineFromExtraction` function (~200 lines). Export `runPipeline` and keep `runFullPipeline` as a deprecated alias if needed, or rename directly.

**Step 4: Update callers**

In `src/lib/telegram/word-queue.ts:12,200`:
```typescript
// Change import
import { runPipeline } from "@/lib/enrichment-pipeline";
// Change call (line 200)
return runPipeline(group.items, progress, group.lang);
```

In `src/lib/telegram/handlers.ts:8,338,424`:
```typescript
// Change import: remove runFullPipelineFromExtraction, add runPipeline
import { runPipeline, extractFromImages, extractWordsFromSentence } from "@/lib/enrichment-pipeline";

// At line 338 and 424, convert ExtractedPage[] to PipelineItem[]:
const items = pages.flatMap((page) =>
  page.sentences.map((s) => ({
    word: s.word,
    sentence: s.sentence,
    termWeek: page.termWeek,
    topic: page.topic,
  }))
);
const result = await runPipeline(items, progress);
```

**Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add src/lib/enrichment-pipeline.ts src/lib/telegram/word-queue.ts src/lib/telegram/handlers.ts
git commit -m "refactor: unify runFullPipeline and runFullPipelineFromExtraction into runPipeline"
```

---

### Task 5: Change dev server port to 3001

**Files:**
- Modify: `scripts/dev-startup.mjs:140`

**Step 1: Add --port 3001 to next dev args**

In `scripts/dev-startup.mjs`, change line 140:
```javascript
// Before:
const child = spawn("npx", ["next", "dev", ...extraArgs], {
// After:
const child = spawn("npx", ["next", "dev", "--port", "3001", ...extraArgs], {
```

**Step 2: Verify it works**

Run: `npm run dev`
Expected: Server starts on port 3001, not 3000

**Step 3: Commit**

```bash
git add scripts/dev-startup.mjs
git commit -m "chore: change dev server port to 3001 to avoid conflict with proxied live server"
```

---

### Task 6: Test and verify

**Step 1: Restart dev server**

Kill existing process, run `npm run dev`. Verify it starts on port 3001.

**Step 2: Test Chinese enrichment via Telegram**

Send a Chinese sentence to the dev bot. Verify:
- Words are extracted correctly
- Definition and synonyms are NOT generated (not in enrichFields)
- Phonetic, extra_info, sentencePinyin ARE generated
- Stroke order GIFs are generated
- Audio and image are generated
- Card completeness considers Chinese card "complete" without definition/synonyms

**Step 3: Test English enrichment via Telegram**

Send English words. Verify all fields including definition and synonyms are generated.

**Step 4: Test Enrich page**

Open a Chinese card on the Enrich page. Verify:
- Definition and Synonyms buttons are NOT shown
- Pinyin, Extra Examples, Sentence Pinyin ARE shown
- "Select all empty" doesn't include definition/synonyms

Open an English card. Verify all fields shown as before.

**Step 5: Test Browse page completeness**

Check that Chinese cards without definition/synonyms are shown as "Complete" if all other fields are filled.

**Step 6: Test worksheet upload via Telegram**

Send a worksheet photo. Verify the unified `runPipeline` handles it correctly (termWeek/topic preserved).

**Step 7: Commit test plan updates**

```bash
git add tests/ui-test-plan.md
git commit -m "test: update UI test plan for language-driven field config"
```
