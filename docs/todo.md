# Feature Roadmap

## Completed
- [x] **Feature 1: Duplicate Detection on Add** — Pre-check words against existing Anki notes before submission. Quick Add shows warning panel; upload flow shows "duplicate" badge.
- [x] **Feature 2: Dashboard "Needs Attention" Section** — Show counts of cards with missing fields on the dashboard. One-click link to enrich them.
- [x] **Feature 5: Auto-Enrich on Add** — After Quick Add, "Enrich N Cards" button navigates to enrich page with autoEnrich=true. Pipeline runs: text batch → save → audio per card → save. Progress banner shows each phase.
- [x] **Batch Audio Generation** — "Generate All Audio (N)" button on enrich page batch-generates word audio (+ sentence audio where available) for all cards missing audio.
- [x] **Batch Image Generation** — "Generate All Images (N)" button on enrich page batch-generates images for all cards that have sentences but no image.
- [x] **Feature 6: Telegram Bot Integration** — Telegram bot via grammy (long-polling) that accepts words or worksheet photos, creates cards, and auto-enriches with text, audio, and images. Runs inside Next.js via instrumentation.ts. Access control via allowed user IDs in Settings.
- [x] **Anki Sync Before Save + Manual Sync** — Auto-sync before all write operations to prevent conflicts across devices. Manual "Sync" button on Dashboard with spinner and success/error feedback.

## In Progress

## Pending

## Infrastructure
- [x] **Docker + NAS Deployment** — Replaced Claude CLI with Anthropic SDK, added Dockerfile, docker-compose.yml (headless Anki + portal), NAS setup guide. Enables 24/7 operation on Synology NAS.
- [x] **Settings Page + Dual AI Backend** — Settings page at `/settings` to manage API keys and config. Dual AI backend: SDK (Anthropic API, pay-per-use) and CLI (Claude Code with Max subscription). Settings stored in `./data/secrets.json`, secrets never exposed via API.
- [x] **Dev Startup Script** — `npm run dev` now runs `scripts/dev-startup.mjs` which auto-launches Anki if not running, prints color-coded config status (AI backend, Azure TTS, Gemini, AnkiConnect URL), then spawns `next dev`.
- [x] **Single Config Source** — Removed env var support for API keys; all secrets managed via Settings page (`data/secrets.json`). Only `ANKI_CONNECT_URL` remains env-configurable (for Docker container networking).

## Already Existed (skipped)
- ~~Feature 3: Batch Quick Add~~ — Quick Add already supports multi-line input
- ~~Feature 4: Batch Enrichment~~ — Enrich page already has "Enrich All Empty"
