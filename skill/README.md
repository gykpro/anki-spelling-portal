# Anki Enrichment Skill

CLI skill for enriching Anki spelling cards via the Anki Spelling Portal API.
Generates definitions, phonetics, synonyms, TTS audio, and cartoon images.

## Prerequisites

- Anki Spelling Portal running (Docker or local `npm run dev`)
- Node.js 18+

## Installation

1. Copy this directory to `~/.claude/skills/anki-enrich/`
2. Edit `config.json` — set `apiUrl` to your portal (e.g., `http://localhost:3000`)

## Usage

```bash
# Full enrichment (text + audio + image)
node scripts/enrich-full.mjs --words "adventure,magnificent"

# Text fields only
node scripts/enrich-text.mjs --words "adventure" --fields definition,phonetic

# Audio or image only
node scripts/enrich-audio.mjs --words "adventure"
node scripts/enrich-image.mjs --words "adventure"

# Extract words from worksheet photo
node scripts/extract-worksheet.mjs --images /path/to/page.jpg --enrich
```

See `SKILL.md` for full documentation and intent mapping.
