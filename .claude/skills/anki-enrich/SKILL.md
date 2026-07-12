---
name: anki-enrich
description: >
  Enrich Anki spelling cards with AI-generated definitions, phonetics, synonyms,
  example sentences, TTS audio, and cartoon illustrations. Also extracts words
  from spelling worksheet photos. Requires the Anki enrichment portal running
  (configure API URL in config.json).
allowed-tools: Bash, Read
argument-hint: "[words or noteIds to enrich]"
---

# Anki Enrichment Skill

Enrich Anki spelling cards with AI-generated content via the Anki Spelling Portal API. Supports both English and Chinese cards.

## Setup

Edit `config.json` in this skill directory to point to the running portal:

```json
{
  "apiUrl": "http://localhost:3000"
}
```

For NAS/Docker deployments, use the appropriate URL (e.g., `http://nas.local:3000`).

Image enrichment requires the portal to have a file-managed `OPENAI_API_KEY`
configured in `data/secrets.json` through Settings. The portal does not read this
key from the process environment and generates illustrations with the OpenAI
Image API model `gpt-image-2`. Portal, Telegram, and skill image calls share this
one key; audio continues to use Azure TTS.

## Language Support

Scripts support English and Chinese with automatic language detection:
- **English** words → deck `Gao English Spelling`, note type `school spelling`
- **Chinese** words (CJK characters) → deck `Gao Chinese`, note type `school Chinese spelling`

Auto-detection uses CJK Unicode range. Override with `--lang english` or `--lang chinese`.

Chinese cards get extra fields: **sentence pinyin** (tone-marked) and **stroke order GIFs** (from MDBG).

## Intent Mapping

Match the user's intent to the appropriate script:

| User wants... | Script | Example |
|---|---|---|
| Add new words and enrich everything | `enrich-full.mjs` | "add and enrich adventure and magnificent" |
| Enrich existing words with text (definitions, phonetics, etc.) | `enrich-text.mjs` | "add definitions for adventure and magnificent" |
| Generate audio for words | `enrich-audio.mjs` | "generate TTS audio for these cards" |
| Generate images for words | `enrich-image.mjs` | "create illustrations for my spelling cards" |
| Full enrichment (text + audio + image) | `enrich-full.mjs` | "enrich adventure and magnificent" |
| Enrich Chinese words | `enrich-full.mjs` | "enrich 勇敢 and 智慧" |
| Extract words from worksheet photos | `extract-worksheet.mjs` | "extract words from this worksheet photo" |
| Extract AND enrich from worksheets | `extract-worksheet.mjs --enrich` | "process this spelling worksheet" |
| Delete cards (source instance only) | Portal API: `DELETE /api/anki/notes` | "delete these cards" |
| Clear enrichment fields for re-generation | Portal API: `POST /api/anki/notes/clear-fields` | "clear the definitions so I can re-enrich" |

**Default**: If the user just says "enrich [words]" without specifying what, use `enrich-full.mjs`.

## Script Invocations

All scripts are in `skill/scripts/`. Run with `node`:

### Full enrichment (most common)
```bash
# English (auto-detected)
node skill/scripts/enrich-full.mjs --words "adventure,magnificent"

# Chinese (auto-detected from CJK characters)
node skill/scripts/enrich-full.mjs --words "勇敢,智慧"

# Explicit language
node skill/scripts/enrich-full.mjs --words "勇敢,智慧" --lang chinese

# By note IDs
node skill/scripts/enrich-full.mjs --noteIds 1234567890,1234567891
```

`enrich-full.mjs` automatically creates new Anki notes for words that don't exist yet, then runs the full pipeline: text enrichment → audio generation → image generation → stroke order (Chinese only). Existing cards are enriched in place.

### Text only
```bash
node skill/scripts/enrich-text.mjs --words "adventure,magnificent"
node skill/scripts/enrich-text.mjs --words "adventure" --fields definition,phonetic
node skill/scripts/enrich-text.mjs --words "勇敢" --fields definition,phonetic,sentencePinyin
```

### Audio only
```bash
node skill/scripts/enrich-audio.mjs --words "adventure,magnificent"
node skill/scripts/enrich-audio.mjs --words "勇敢,智慧"
```

### Image only
```bash
node skill/scripts/enrich-image.mjs --words "adventure,magnificent"
```

### Extract from worksheet
```bash
node skill/scripts/extract-worksheet.mjs --images /path/to/page.jpg
node skill/scripts/extract-worksheet.mjs --images /path/to/p1.jpg,/path/to/p2.jpg --enrich
node skill/scripts/extract-worksheet.mjs --images /path/to/chinese.jpg --lang chinese --enrich
```

Supported image formats: JPEG, PNG, GIF, WebP. **PDFs are not supported** by the skill scripts — use the portal web UI or Telegram bot for PDF worksheets.

## Arguments

- `--words "word1,word2"` — Comma-separated words. `enrich-full.mjs` auto-creates notes for new words; other scripts require words to already exist in Anki.
- `--noteIds 123,456` — Comma-separated Anki note IDs (use when IDs are already known).
- `--lang english|chinese` — Override language auto-detection. Default: auto-detect from word content.
- `--fields field1,field2` — (enrich-text only) Override default fields. Options: `sentence`, `definition`, `phonetic`, `synonyms`, `extra_info`, `sentencePinyin` (Chinese only).
- `--images path1,path2` — (extract-worksheet only) Image file paths.
- `--enrich` — (extract-worksheet only) After extraction, auto-create notes and run full enrichment.

## Fields Reference

### Text fields (generated by AI)
- **sentence** — Example sentence using the word
- **definition** — Word definition (HTML format)
- **phonetic** — IPA (English) or pinyin with tone marks (Chinese)
- **synonyms** — Comma-separated synonyms
- **extra_info** — Extra context (etymology, usage notes, additional sentences)
- **sentencePinyin** — Full sentence pinyin with tone marks (Chinese only)

### Media fields
- **audio** — Word pronunciation (Azure TTS, MP3)
- **sentence_audio** — Full sentence pronunciation (Azure TTS, MP3)
- **image** — Cartoon illustration (OpenAI Image API, `gpt-image-2`). Each
  provider attempt has a 120-second timeout and only one retry is allowed, for a
  transient failure. The Picture field uses the exact finalized filename
  returned by Anki; an invalid image or media-finalization failure leaves it
  unchanged.
- **strokeOrder** — Animated stroke order GIFs per character (Chinese only, from MDBG)

## Limitations

- **No PDF extraction**: Worksheet extraction only accepts image files. Use the portal UI or Telegram bot for PDFs.
- **Multi-instance distribution**: When cards are saved through the portal API, they are automatically distributed to all configured target Anki instances (`DISTRIBUTION_TARGETS` in Settings, `Name=URL` pairs). No extra steps needed from the skill scripts.

## Output Format

All scripts output JSON to stdout. `enrich-image.mjs` and `enrich-full.mjs`
include every requested word or note ID in `results`, including unresolved
cards or cards without a sentence; work that was never sent to the image
provider has `status: "not_attempted"` and a reason.

```json
{
  "results": [
    { "noteId": 123, "word": "adventure", "status": "succeeded", "enriched": true },
    { "noteId": 456, "word": "magnificent", "status": "failed", "error": "reason" },
    { "word": "unresolved", "status": "not_attempted", "reason": "not found" }
  ],
  "succeeded": 1,
  "failed": 1,
  "notAttempted": 1
}
```

Progress messages go to stderr. Parse stdout for the JSON summary.

## Exit Codes

For `enrich-image.mjs` and `enrich-full.mjs`:

- **0** — Every requested item succeeded
- **1** — At least one item succeeded and at least one failed or was not attempted
- **2** — Zero items succeeded, or a fatal error prevented a usable result

## Error Handling

If you see "Cannot reach Anki portal", the portal server isn't running or `config.json` points to the wrong URL. If you see "AnkiConnect unreachable", Anki desktop isn't running or AnkiConnect plugin isn't installed.

## Portal API — Delete & Clear

These operations are available via the portal REST API (no dedicated script needed).

### Delete notes (source instance only)
```bash
curl -X DELETE http://localhost:3001/api/anki/notes \
  -H "Content-Type: application/json" \
  -d '{"noteIds": [1234567890, 1234567891]}'
```

Response: `{ "homeDeleted": 2 }`

Deletes notes on the source instance only. Deletion does NOT propagate to
distribution targets — libraries can drift apart, so removing a duplicate here
must never delete the only copy on another instance.

### Clear enrichment fields
```bash
curl -X POST http://localhost:3001/api/anki/notes/clear-fields \
  -H "Content-Type: application/json" \
  -d '{"noteIds": [1234567890], "fields": ["definition", "phonetic", "image"]}'
```

Response: `{ "updated": 1 }`

Available field keys: `sentence`, `definition`, `phonetic`, `synonyms`, `extra_info`, `sentencePinyin`, `audio`, `sentence_audio`, `image`, `strokeOrder`, `extra_info_audio`.

Clearing `sentence` also clears dependent fields (Cloze, Main Sentence Audio, Main Sentence Pinyin). Does not distribute to other profiles — re-enrich and distribute fresh.

## Environment Variable Override

For one-off testing, override the API URL without editing config.json:
```bash
ANKI_PORTAL_URL=http://other-host:3000 node skill/scripts/enrich-full.mjs --words "test"
```
