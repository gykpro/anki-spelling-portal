# Sentence-to-Words Extraction

## Problem
Sometimes Chinese (or English) input to Quick Add or Telegram is a full sentence, not a word. The current pipeline treats it as a "word" and generates example sentences from it, which is nonsensical.

## Solution
Detect sentence input, extract 1-3 key vocabulary words via AI, and create cards with the original sentence pre-filled as Main Sentence. Enrichment skips sentence generation for these cards.

## Detection (code, no AI)
- Chinese: >5 chars or contains sentence punctuation (。！？)
- English: >3 words or contains sentence-ending punctuation (.!?)
- Shared function: `isSentenceInput(text, lang)` in `src/lib/languages.ts`

## Word Extraction (AI)
- Prompt: "Extract 1-3 vocabulary words suitable for a Primary 4 student from this sentence"
- Returns array of words
- Shared function: `extractWordsFromSentence(sentence, lang)` in `src/lib/enrichment-pipeline.ts`

## Telegram Flow
1. User sends sentence → bot detects via `isSentenceInput()`
2. AI extracts 1-3 words via `extractWordsFromSentence()`
3. Bot replies: "From your sentence, I found: 孕妇, 被困" with [Start Now] [Edit Queue]
4. Words enter queue with `sourceSentence` field attached
5. Pipeline creates cards with original sentence as Main Sentence + Cloze
6. Enrichment skips "sentence" field (already filled), enriches everything else

## Portal (Quick Add) Flow
1. User types sentence in Quick Add input
2. After submission, portal detects sentence, calls AI to extract words
3. Shows extracted words as editable list with source sentence displayed
4. User confirms → cards created with original sentence as Main Sentence
5. Same enrichment behavior

## Implementation Details
- `QueueEntry` in `word-queue.ts` gains optional `sourceSentence: string`
- `createWordNotes()` in `enrichment-pipeline.ts` accepts optional sentence per word
- Cards created with sentence pre-filled → existing enrichment logic already skips filled fields
- `buildMainSentence()` and `buildCloze()` reused for formatting
