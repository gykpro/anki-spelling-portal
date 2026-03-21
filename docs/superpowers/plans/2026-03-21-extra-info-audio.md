# Extra Info Sentence Audio — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate TTS audio for each example sentence in the "Extra information" field, embedding `[sound:filename]` in each `<li>` tag.

**Architecture:** Two-phase enrichment — Phase 1 (existing) generates example sentence text via AI. Phase 2 (new) parses `<li>` tags, generates Azure TTS for each, and prepends `[sound:filename]` into the HTML. A new `generateExtraInfoAudio()` helper is integrated into the Telegram pipeline, batch audio generation, and single-card save flow. Card completeness now checks that extra_info has audio in every `<li>`.

**Tech Stack:** Azure TTS, AnkiConnect, Next.js API routes, React

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/languages.ts` | Modify | Add `"extraInfoAudio"` to `extraMediaSteps` for both languages |
| `src/lib/card-completeness.ts` | Modify | Add `isExtraInfoComplete()`, update `extra_info` check in `getCardCompleteness()` |
| `src/lib/enrichment-pipeline.ts` | Modify | Add `generateExtraInfoAudio()`, integrate into `runPipeline()` |
| `src/app/api/enrich/route.ts` | Modify | Add `extra_info_audio` to `EnrichField`, handle in POST handler |
| `src/app/enrich/page.tsx` | Modify | Add "Generate Example Audio" button, update `generateAllAudio`, update field status, update save flow |

---

## Chunk 1: Core Helper + Language Config

### Task 1: Add `extraInfoAudio` to language config

**Files:**
- Modify: `src/lib/languages.ts:10` (type definition), lines 25, 45 (language objects)

- [ ] **Step 1: Update the `extraMediaSteps` type**

In `src/lib/languages.ts`, change the type from `("strokeOrder")[]` to `("strokeOrder" | "extraInfoAudio")[]`:

```typescript
extraMediaSteps: ("strokeOrder" | "extraInfoAudio")[];
```

- [ ] **Step 2: Add `"extraInfoAudio"` to both language configs**

ENGLISH (line 25):
```typescript
extraMediaSteps: ["extraInfoAudio"],
```

CHINESE (line 45):
```typescript
extraMediaSteps: ["strokeOrder", "extraInfoAudio"],
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/languages.ts
git commit -m "feat: add extraInfoAudio to language config extraMediaSteps"
```

---

### Task 2: Update card completeness for extra_info

**Files:**
- Modify: `src/lib/card-completeness.ts`

- [ ] **Step 1: Add `isExtraInfoComplete()` helper**

Add this function after `isStrokeOrderComplete()`:

```typescript
/**
 * Check if Extra information field has audio in every <li> tag.
 * Returns true if:
 * - Field is non-empty AND
 * - Every <li> contains a [sound:...] tag
 * Returns false if field is empty or any <li> lacks audio.
 */
export function isExtraInfoComplete(
  fields: Record<string, { value: string }>
): boolean {
  const value = fields["Extra information"]?.value?.trim();
  if (!value) return false;

  const liContents = value.match(/<li>([\s\S]*?)<\/li>/gi);
  if (!liContents || liContents.length === 0) return false;

  // Every <li> must contain [sound:...]
  return liContents.every((li) => /\[sound:[^\]]+\]/.test(li));
}
```

- [ ] **Step 2: Update `getCardCompleteness()` to use `isExtraInfoComplete()`**

In the `for` loop inside `getCardCompleteness()`, add a special case for `extra_info` before the generic value check (after the `strokeOrder` block, around line 77):

```typescript
// Special handling for extra_info: check text + audio completeness
if (check.key === "extra_info") {
  if (!isExtraInfoComplete(fields)) {
    missing.push(check.key);
  }
  continue;
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/lib/card-completeness.ts
git commit -m "feat: extra_info completeness now requires audio in every <li>"
```

---

### Task 3: Add `generateExtraInfoAudio()` to enrichment pipeline

**Files:**
- Modify: `src/lib/enrichment-pipeline.ts`

- [ ] **Step 1: Add the helper function**

Add after `generateAndSaveStrokeOrder()` (after line 697):

```typescript
/** Parse <li> contents from HTML extra info field */
function parseExtraInfoSentences(html: string): { index: number; text: string; hasAudio: boolean }[] {
  const results: { index: number; text: string; hasAudio: boolean }[] = [];
  const liRegex = /<li>([\s\S]*?)<\/li>/gi;
  let match;
  let idx = 0;
  while ((match = liRegex.exec(html)) !== null) {
    const content = match[1];
    const hasAudio = /\[sound:[^\]]+\]/.test(content);
    // Strip [sound:...] and HTML tags to get plain text
    const text = content
      .replace(/\[sound:[^\]]+\]\s*/g, "")
      .replace(/<[^>]*>/g, "")
      .trim();
    results.push({ index: idx, text, hasAudio });
    idx++;
  }
  return results;
}

/** Generate and save TTS audio for each example sentence in Extra information.
 *  Idempotent — skips sentences that already have [sound:...].
 *  Returns generated media files for distribution. */
export async function generateExtraInfoAudio(
  noteId: number,
  word: string,
  lang?: LanguageConfig,
  ankiConnectClient?: typeof ankiConnect
): Promise<MediaFile[]> {
  const ac = ankiConnectClient ?? ankiConnect;
  const language = lang ?? getLanguageById("english");
  const mediaFiles: MediaFile[] = [];

  // Read current Extra information field
  const notesInfo = await ac.notesInfo([noteId]);
  if (notesInfo.length === 0) return mediaFiles;
  const extraInfo = notesInfo[0].fields?.["Extra information"]?.value || "";
  if (!extraInfo) return mediaFiles;

  const sentences = parseExtraInfoSentences(extraInfo);
  if (sentences.length === 0) return mediaFiles;

  const needsAudio = sentences.filter((s) => !s.hasAudio && s.text);
  if (needsAudio.length === 0) return mediaFiles;

  const safeWord = word.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_");

  // Generate audio for each sentence missing it
  let updatedHtml = extraInfo;
  for (const s of needsAudio) {
    try {
      const tts = await generateTTS(s.text, "sentence", language);
      const filename = `spelling_extra_${safeWord}_${noteId}_${s.index}.mp3`;
      await ac.storeMediaFile(filename, tts.base64);
      mediaFiles.push({ filename, data: tts.base64 });

      // Prepend [sound:filename]\n inside the <li> tag for this sentence
      // Replace the first <li> that contains this sentence's text (without audio)
      const escapedText = s.text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const liPattern = new RegExp(
        `(<li>)(\\s*)(${escapedText})`,
        "i"
      );
      updatedHtml = updatedHtml.replace(
        liPattern,
        `$1[sound:${filename}]\n $3`
      );
    } catch (err) {
      console.warn(`[ExtraInfoAudio] Failed for "${word}" sentence ${s.index}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Save updated field back to Anki
  if (mediaFiles.length > 0) {
    await ac.updateNoteFields({
      id: noteId,
      fields: { "Extra information": updatedHtml },
    });
  }

  return mediaFiles;
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/lib/enrichment-pipeline.ts
git commit -m "feat: add generateExtraInfoAudio() helper for extra info TTS"
```

---

## Chunk 2: Pipeline & API Integration

### Task 4: Integrate into `runPipeline()` (Telegram)

**Files:**
- Modify: `src/lib/enrichment-pipeline.ts` (inside `runPipeline()`, after step 6b stroke order block, before step 7 distribution)

- [ ] **Step 1: Add extra info audio generation step**

After the stroke order block (after line 854, before the distribution step), add:

```typescript
  // 6c. Generate extra info audio (driven by language config)
  if (language.extraMediaSteps.includes("extraInfoAudio")) {
    for (let i = 0; i < created.length; i++) {
      const c = created[i];
      await progress.update(
        `[${language.label}] Example audio ${i + 1}/${created.length}: ${c.word}`
      );
      try {
        const mediaFiles = await generateExtraInfoAudio(c.noteId, c.word, language);
        for (const mf of mediaFiles) mediaCache.set(mf.filename, mf.data);
      } catch (err) {
        errors.push(`Example audio for "${c.word}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/lib/enrichment-pipeline.ts
git commit -m "feat: integrate extra info audio into runPipeline for Telegram"
```

---

### Task 5: Add `extra_info_audio` to the single-card enrich API

**Files:**
- Modify: `src/app/api/enrich/route.ts`

- [ ] **Step 1: Add `extra_info_audio` to `EnrichField` type**

Update the type (line 14):

```typescript
export type EnrichField =
  | "sentence"
  | "definition"
  | "phonetic"
  | "synonyms"
  | "extra_info"
  | "sentencePinyin"
  | "image"
  | "audio"
  | "sentence_audio"
  | "strokeOrder"
  | "extra_info_audio";
```

- [ ] **Step 2: Import `generateExtraInfoAudio` and add to `nonTextFields` set**

Update the import (line 11):

```typescript
import { generateTTS, generateImage, generateAndSaveStrokeOrder, generateExtraInfoAudio } from "@/lib/enrichment-pipeline";
```

In the `POST` handler, add `"extra_info_audio"` to the `nonTextFields` set (line 95):

```typescript
const nonTextFields = new Set(["image", "audio", "sentence_audio", "strokeOrder", "extra_info_audio"]);
```

- [ ] **Step 3: Add handler for `extra_info_audio` field**

After the stroke order block (after line 136), add:

```typescript
      // Generate extra info audio
      if (fields.includes("extra_info_audio") && noteId) {
        try {
          const extraMedia = await generateExtraInfoAudio(noteId, word, lang);
          r.extra_info_audio = { count: extraMedia.length };
        } catch (err) {
          r.extra_info_audio_error =
            err instanceof Error ? err.message : "Extra info audio generation failed";
        }
      }
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean build.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/enrich/route.ts
git commit -m "feat: add extra_info_audio field to single-card enrich API"
```

---

## Chunk 3: Enrich Page UI

### Task 6: Update enrich page — field status, batch button, audio generation

**Files:**
- Modify: `src/app/enrich/page.tsx`

This is the largest task. It touches multiple areas of the enrich page:

#### 6a: Update `getEnrichableFields()` to show extra_info_audio status

- [ ] **Step 1: Add `extra_info_audio` to the fields object**

In `getEnrichableFields()` (around line 53), after the `strokeOrder` field entry, add:

```typescript
    extra_info_audio: {
      available: !!getFieldValue(note, "Extra information"),
      filled: (() => {
        const extraInfo = getFieldValue(note, "Extra information");
        if (!extraInfo) return false;
        const lis = extraInfo.match(/<li>([\s\S]*?)<\/li>/gi);
        if (!lis || lis.length === 0) return false;
        return lis.every((li: string) => /\[sound:[^\]]+\]/.test(li));
      })(),
      label: "Example Audio",
    },
```

Also add `"extra_info_audio"` to the `EnrichField` import at the top if not already covered by the type.

#### 6b: Add count for cards missing extra info audio

- [ ] **Step 2: Add `cardsWithMissingExtraInfoAudio` count**

After `cardsWithMissingStrokeOrder` (around line 1348), add:

```typescript
  const cardsWithMissingExtraInfoAudio = notes.filter((note) => {
    const info = getEnrichableFields(note);
    return info.fields.extra_info_audio.available && !info.fields.extra_info_audio.filled;
  }).length;
```

#### 6c: Add "Generate Example Audio" button

- [ ] **Step 3: Add the standalone button to the batch toolbar**

After the stroke order button block (around line 1458), add:

```typescript
        {cardsWithMissingExtraInfoAudio > 0 && (
          <button
            onClick={generateAllExtraInfoAudio}
            disabled={batchEnriching || savingAll || cardsWithMissingExtraInfoAudio === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary/80 px-4 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            {batchEnriching ? (
              <LoadingSpinner size="sm" className="text-primary-foreground" />
            ) : (
              <Volume2 className="h-3.5 w-3.5" />
            )}
            {batchEnriching
              ? "Generating..."
              : `Generate Example Audio (${cardsWithMissingExtraInfoAudio})`}
          </button>
        )}
```

#### 6d: Add `generateAllExtraInfoAudio` function

- [ ] **Step 4: Add the batch function**

After `generateAllStrokeOrder` (around line 1070), add:

```typescript
  const generateAllExtraInfoAudio = async () => {
    const cardsNeeding: { noteId: number; word: string }[] = [];

    for (const note of notes) {
      const info = getEnrichableFields(note);
      if (info.fields.extra_info_audio.available && !info.fields.extra_info_audio.filled) {
        cardsNeeding.push({ noteId: note.noteId, word: info.word });
      }
    }

    if (cardsNeeding.length === 0) return;

    setBatchEnriching(true);
    setBatchProgress(`Example audio 0/${cardsNeeding.length}...`);

    setNoteStates((prev) => {
      const next = { ...prev };
      for (const c of cardsNeeding) {
        next[c.noteId] = { ...next[c.noteId], enriching: true, error: null };
      }
      return next;
    });

    for (let i = 0; i < cardsNeeding.length; i++) {
      const card = cardsNeeding[i];
      setBatchProgress(`Example audio ${i + 1}/${cardsNeeding.length}: ${card.word}...`);

      try {
        const res = await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: card.noteId,
            word: card.word,
            fields: ["extra_info_audio"],
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Example audio generation failed");
        }

        setNoteStates((prev) => ({
          ...prev,
          [card.noteId]: {
            ...prev[card.noteId],
            enriching: false,
          },
        }));
      } catch (err) {
        setNoteStates((prev) => ({
          ...prev,
          [card.noteId]: {
            ...prev[card.noteId],
            enriching: false,
            error: err instanceof Error ? err.message : "Example audio failed",
          },
        }));
      }
    }

    setBatchProgress(`Example audio done for ${cardsNeeding.length} cards`);
    setBatchEnriching(false);
    // Refresh notes to pick up updated Extra information field
    fetchNotes();
  };
```

#### 6e: Update `generateAllAudio` to also generate extra info audio

- [ ] **Step 5: Add extra_info_audio to the existing `generateAllAudio` flow**

In `generateAllAudio()`, after the main audio loop finishes (around line 930, before the final `setBatchProgress`/`setBatchEnriching(false)`), add a second pass:

```typescript
    // Second pass: generate extra info audio for cards that have extra info text but no audio
    const cardsNeedingExtraAudio: { noteId: number; word: string }[] = [];
    for (const note of notes) {
      const info = getEnrichableFields(note);
      if (info.fields.extra_info_audio.available && !info.fields.extra_info_audio.filled) {
        cardsNeedingExtraAudio.push({ noteId: note.noteId, word: info.word });
      }
    }

    for (let i = 0; i < cardsNeedingExtraAudio.length; i++) {
      const card = cardsNeedingExtraAudio[i];
      setBatchProgress(`Example audio ${i + 1}/${cardsNeedingExtraAudio.length}: ${card.word}...`);

      try {
        await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId: card.noteId,
            word: card.word,
            fields: ["extra_info_audio"],
          }),
        });
      } catch (err) {
        console.warn(`Extra info audio for "${card.word}" failed:`, err);
      }
    }
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean build.

- [ ] **Step 7: Commit**

```bash
git add src/app/enrich/page.tsx
git commit -m "feat: add Generate Example Audio button and integrate into batch audio"
```

---

### Task 7: Update enrich page save flow for single-card extra_info_audio

**Files:**
- Modify: `src/app/enrich/page.tsx` (inside the `save()` function)

- [ ] **Step 1: After saving extra_info text, trigger audio generation**

In the `save()` function, after the section that stores media files and updates fields (around line 680, before the distribution and refresh sections), add:

```typescript
    // Generate extra info audio if extra_info was just saved
    if (r.extra_info && noteId) {
      try {
        await fetch("/api/enrich", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            noteId,
            word: getFieldValue(note, "Word"),
            fields: ["extra_info_audio"],
          }),
        });
      } catch {
        // Best-effort — don't block save
      }
    }
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/app/enrich/page.tsx
git commit -m "feat: auto-generate extra info audio when saving enrichment results"
```

---

### Task 8: Self-test via browser automation

- [ ] **Step 1: Restart dev server**

```bash
lsof -ti:3001 | xargs kill -9; npm run dev &
```

- [ ] **Step 2: Test with live Anki** (requires Anki desktop running)

Open Browse page, find a card with Extra information text. Verify:
1. Card completeness shows incomplete if extra_info has text but no audio
2. "Generate Example Audio" button appears on the Enrich page
3. Clicking it generates audio and updates the field
4. Card completeness shows complete after audio is added
5. "Generate All Audio" button also processes extra info audio

- [ ] **Step 3: Update `tests/ui-test-plan.md`** with new test scenarios for extra info audio

- [ ] **Step 4: Final commit**

```bash
git add tests/ui-test-plan.md
git commit -m "docs: update UI test plan with extra info audio scenarios"
```
