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
- AI-generated cartoon illustrations (Gemini)
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

### Multi-Instance Distribution
- Copy cards from the central Anki instance to target AnkiConnect endpoints
- Uses temporary `.apkg` export/import so media files travel with the cards

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

For a fresh Anki instance, place the schema seed package at
`src/app/assets/anki_init.apkg`. The app imports it automatically before the
first write if the required decks or note types are missing.

## Quick Start (Docker)

```bash
docker compose up -d
```

This starts a central headless Anki instance, two target Anki instances, and the portal. Configure API keys at `http://localhost:3000/settings`.

For NAS deployment details, see [docs/nas-setup.md](docs/nas-setup.md).

## Configuration

All API keys are managed via the Settings page (`/settings`). No environment variables needed for secrets.

| Service | Purpose | Required |
|---------|---------|----------|
| Anthropic API | Worksheet extraction + text enrichment | Yes |
| Azure TTS | Word and sentence audio generation | Optional |
| Gemini API | Cartoon image generation | Optional |
| Telegram Bot Token | Telegram bot integration | Optional |

`ANKI_CONNECT_URL` points the portal at the central Anki instance. Optional `DISTRIBUTION_ENDPOINTS` and `EXPORT_SHARED_PATH` configure target AnkiConnect endpoints and the shared `.apkg` transfer directory.

## CLI Skill

The `skill/` directory contains a distributable CLI skill for external AI agents to use the enrichment API. See [skill/README.md](skill/README.md) for usage.

## Tech Stack

Next.js 15 (App Router) / React 19 / TypeScript / Tailwind CSS v4 / Anthropic SDK / Azure TTS / Gemini API / grammy (Telegram) / AnkiConnect
