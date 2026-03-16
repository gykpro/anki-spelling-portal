# Pipeline Unification & Language-Driven Field Config

## Goal

Eliminate duplicated pipeline code and make `LanguageConfig` the single source of truth for which fields are enriched per language. Fix Chinese enrichment to stop generating definition and synonyms.

## Architecture

Three changes:

1. **Language config**: Remove "definition" and "synonyms" from `CHINESE.enrichFields`
2. **Enrich page**: Read field availability from `LanguageConfig.enrichFields` instead of hardcoding
3. **Pipeline unification**: Merge `runFullPipeline` and `runFullPipelineFromExtraction` into one function
4. **Dev port**: Change default dev server port from 3000 to 3001

## Detail

### 1. Language Config (`src/lib/languages.ts`)

```
ENGLISH.enrichFields: ["sentence", "definition", "phonetic", "synonyms", "extra_info"]  // unchanged
CHINESE.enrichFields: ["sentence", "phonetic", "extra_info", "sentencePinyin"]           // removed definition, synonyms
```

Anki note types keep their existing fields — Definition and Synonyms stay on the Chinese note type but won't be populated by enrichment.

### 2. Enrich Page (`src/app/enrich/page.tsx`)

`getEnrichableFields()` currently hardcodes text field availability (definition always available, sentencePinyin only for Chinese). Change to:

- Detect language from note's modelName via `getLanguageByNoteType()`
- Text fields: available only if in `language.enrichFields`
- Media fields: image (needs sentence), audio (always), sentence_audio (needs sentence), strokeOrder (Chinese via `extraMediaSteps`)

### 3. Pipeline Unification (`src/lib/enrichment-pipeline.ts`)

`runFullPipeline` and `runFullPipelineFromExtraction` share ~90% code. Merge into single `runPipeline()`:

```typescript
interface PipelineItem {
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

Steps (all driven by language config):
1. Check duplicates (batch)
2. Cap at MAX_PIPELINE_WORDS
3. Create notes via `createWordNotes()`
4. Enrich text fields (skip "sentence" if all have pre-filled sentences)
5. Save text to Anki (preserve pre-filled sentences)
6. Generate audio (word + sentence)
7. Generate images (requires sentence)
8. Extra media steps from `language.extraMediaSteps` (strokeOrder for Chinese)
9. Distribute to target profiles

Callers:
- Telegram word queue: `runPipeline([{word, sentence}], progress, lang)`
- Extraction: `runPipeline([{word, sentence, termWeek, topic}], progress, lang)`

### 4. Dev Port

Change `scripts/dev-startup.mjs` to start Next.js on port 3001 instead of 3000, since 3000 is used by the proxied live server.

## Testing

- Send Chinese words via Telegram → verify no definition/synonyms generated, other fields present
- Send English words via Telegram → verify all fields including definition/synonyms
- Enrich page for Chinese card → definition/synonyms not shown as enrichable
- Enrich page for English card → all fields shown
- Worksheet upload → same pipeline as Telegram (unified function)
