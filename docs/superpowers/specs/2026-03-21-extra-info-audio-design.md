# Extra Info Sentence Audio

## Problem

The "Extra information" field contains example sentences as `<ul><li>...</li></ul>` but has no TTS audio. Users want audio for each example sentence, matching how the main sentence has audio.

## Data Format

**Before (text only):**
```html
<ul><li>sentence one</li><li>sentence two</li></ul>
```

**After (text + audio):**
```html
<ul><li>[sound:spelling_extra_word_123_0.mp3]
 sentence one
</li><li>[sound:spelling_extra_word_123_1.mp3]
 sentence two
</li></ul>
```

Each `<li>` gets a `[sound:filename]` prepended before the text. The newline after `[sound:...]` matches the existing pattern the user showed.

**Filename pattern:** `spelling_extra_{safeWord}_{noteId}_{index}.mp3`

## Detection: "needs extra_info audio"

A card needs extra_info audio when:
1. It has a non-empty `Extra information` field
2. The field contains at least one `<li>` tag
3. At least one `<li>` does NOT contain `[sound:...]`

This is idempotent — re-running skips sentences that already have audio.

## Card Completeness Update

Currently `extra_info` is "filled" if the field is non-empty. Change this:
- `extra_info` is "filled" only when:
  - The field has text content, AND
  - Every `<li>` in the field contains a `[sound:...]` tag

This affects Browse page completeness indicators and dashboard stats. The helper function `isExtraInfoComplete(fields)` handles this check.

## New Helper: `generateExtraInfoAudio()`

Location: `src/lib/enrichment-pipeline.ts`

```
async function generateExtraInfoAudio(
  noteId: number,
  word: string,
  lang: LanguageConfig,
  ankiConnect: AnkiConnectClient
): Promise<{ mediaFiles: { filename: string; data: string }[] }>
```

Steps:
1. Read the current `Extra information` field value from the note
2. Parse all `<li>` contents using regex
3. For each `<li>` that lacks `[sound:...]`:
   a. Strip HTML from the sentence text
   b. Generate Azure TTS audio (same voice/settings as sentence audio, using `lang` for language detection)
   c. Store media file via AnkiConnect
   d. Prepend `[sound:filename]\n` inside the `<li>` tag
4. Write the updated field back to Anki
5. Return generated media files (for distribution)

## Integration Points

### 1. Enrich Page — Batch Toolbar

**"Generate All Audio" button** — after generating word/sentence audio, also call `generateExtraInfoAudio()` for each card that has extra_info text but missing audio.

**New "Generate Example Audio" button** — standalone button that only generates extra_info audio. Shows count of cards needing it. For cards that already have main audio but are missing example audio.

### 2. Enrich Page — Single Card Save

When saving enrichment results that include `extra_info`, after saving the text, generate audio for the newly saved extra_info sentences.

### 3. Telegram Pipeline

In `runPipeline()`, after text enrichment and main audio generation, call `generateExtraInfoAudio()` for each card that has extra_info content. This runs alongside other media generation steps.

### 4. Enrich Page Field Status

Add `extra_info_audio` as a display concept on the enrich card — show whether example sentences have audio. This is not a separate `EnrichField` for AI generation, but a media generation status indicator like image/audio.

### 5. Language Config

Add `"extraInfoAudio"` to `extraMediaSteps` in both English and Chinese language configs, so the pipeline knows to run this step.

## Files to Modify

| File | Change |
|------|--------|
| `src/lib/enrichment-pipeline.ts` | Add `generateExtraInfoAudio()`, integrate into `runPipeline()` and `generateAllAudioForNotes()` |
| `src/lib/card-completeness.ts` | Add `isExtraInfoComplete()`, update `getCardCompleteness()` |
| `src/lib/languages.ts` | Add `"extraInfoAudio"` to `extraMediaSteps` for both languages |
| `src/app/enrich/page.tsx` | Add "Generate Example Audio" button, update audio generation to include extra_info, update field status display |
| `src/app/api/enrich/route.ts` | No change (text generation unchanged) |
| `src/app/api/enrich/batch/route.ts` | No change (text generation unchanged) |
| `src/lib/telegram/word-queue.ts` | No change (calls `runPipeline` which will handle it) |

## TTS Settings

Same as existing sentence audio:
- Engine: Azure TTS
- Voice: determined by language (`en-US-AnaNeural` for English, Chinese voice for Chinese)
- Rate: normal (sentence rate, not the slower word rate)
- Output: `audio-16khz-128kbitrate-mono-mp3`
