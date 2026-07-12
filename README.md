# Anki Spelling Portal

A local web portal for managing Anki spelling cards from school worksheets, powered by AI enrichment.

## What It Does

- **Upload worksheets** — Extract spelling words from photos or PDFs using AI vision
- **AI enrichment** — Auto-generate definitions, phonetics, synonyms, example sentences, audio, and images
- **Multi-language** — English and Chinese support with auto-detection
- **Telegram bot** — Add words, send worksheet photos, and trigger enrichment from Telegram

## Features

### Worksheet Extraction
- Upload photos or PDFs of spelling worksheets
- AI vision extracts numbered words and sentences
- Supports word-only lists (sentences generated during enrichment)

### AI Enrichment
- Definitions, phonetic symbols, synonyms, and example sentences
- TTS audio for words and sentences (Azure Neural Voice)
- AI-generated cartoon illustrations (OpenAI Image API, `gpt-image-2`)
- Chinese: pinyin, stroke order GIFs, sentence pinyin

### Multi-Language
- English deck ("Gao English Spelling") and Chinese deck ("Gao Chinese Spelling")
- Auto-detection of language from input
- Language-aware enrichment prompts and field sets

### Telegram Bot
- Send words or worksheet photos to create cards
- Word queue with batch processing (60s timer or manual start)
- Auto-enrichment pipeline (text + audio + images)
- Per-user language preference via `/lang` command

### Multi-Profile Distribution
- Distribute cards to multiple Anki profiles on save
- Media files (audio, images) copied to each profile

### Smart Completeness Tracking
- Per-field completeness filters on Browse page
- Language-aware "complete" definition (all available fields filled)
- Dashboard shows per-language completeness breakdown

## Quick Start (Local)

### Prerequisites
- Node.js 18+
- [Anki](https://apps.ankiweb.net/) with [AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on installed

### Setup
```bash
npm install
npm run dev
```

Open `http://localhost:3000` and configure API keys via the **Settings** page (`/settings`).

## Quick Start (Docker)

```bash
docker compose up -d
```

This starts both a headless Anki instance (with AnkiConnect) and the portal. Configure API keys at `http://localhost:3000/settings`.

For NAS deployment details, see [docs/nas-setup.md](docs/nas-setup.md).

## Configuration

All API keys are managed via the Settings page (`/settings`). No environment variables needed for secrets.

| Service | Purpose | Required |
|---------|---------|----------|
| Anthropic API | Worksheet extraction + text enrichment | Yes |
| Azure TTS | Word and sentence audio generation | Optional |
| OpenAI Image API | Cartoon image generation with `gpt-image-2` | Optional |
| Telegram Bot Token | Telegram bot integration | Optional |

`OPENAI_API_KEY` is the environment's one shared OpenAI credential, saved by
Settings in `data/secrets.json`; image generation uses it without an
environment-variable fallback or an image-specific duplicate. This change does
not migrate audio generation, which remains on Azure TTS.
Each image-provider attempt has a 120-second timeout and at most one transient
retry. Image saves use the filename returned by Anki media finalization. If an
image cannot be generated or finalized, Save All leaves that image unsaved and
excludes the failed item from distribution.
The only environment variable is `ANKI_CONNECT_URL` (default:
`http://localhost:8765`), used in Docker to point to the headless Anki container.

## CLI Skill

The `skill/` directory contains a distributable CLI skill for external AI agents to use the enrichment API. See [skill/README.md](skill/README.md) for usage.

## Tech Stack

Next.js 15 (App Router) / React 19 / TypeScript / Tailwind CSS v4 / Anthropic SDK / Azure TTS / OpenAI Image API (`gpt-image-2`) / grammy (Telegram) / AnkiConnect
