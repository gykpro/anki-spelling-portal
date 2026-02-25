# Feature Roadmap

## Completed
- [x] **Feature 1: Duplicate Detection on Add** — Pre-check words against existing Anki notes before submission. Quick Add shows warning panel; upload flow shows "duplicate" badge.
- [x] **Feature 2: Dashboard "Needs Attention" Section** — Show counts of cards with missing fields on the dashboard. One-click link to enrich them.
- [x] **Feature 5: Auto-Enrich on Add** — After Quick Add, "Enrich N Cards" button navigates to enrich page with autoEnrich=true. Pipeline runs: text batch → save → audio per card → save. Progress banner shows each phase.
- [x] **Batch Audio Generation** — "Generate All Audio (N)" button on enrich page batch-generates word audio (+ sentence audio where available) for all cards missing audio.
- [x] **Batch Image Generation** — "Generate All Images (N)" button on enrich page batch-generates images for all cards that have sentences but no image.
- [x] **Feature 6: Telegram Bot Integration** — Telegram bot via grammy (long-polling) that accepts words or worksheet photos, creates cards, and auto-enriches with text, audio, and images. Runs inside Next.js via instrumentation.ts. Access control via allowed user IDs in Settings.
- [x] **Anki Sync Before Save + Manual Sync** — Auto-sync before all write operations to prevent conflicts across devices. Manual "Sync" button on Dashboard with spinner and success/error feedback.
- [x] **Claude Code Enrichment Skill** — Distributable skill in `skill/` exposing the enrichment API as CLI scripts. Supports text enrichment, audio/image generation, full pipeline, and worksheet extraction. SKILL.md provides intent-to-script mapping for conversational use.

## In Progress

## Pending

## Recently Completed
- [x] **Chinese Skill Script Support** — Skill scripts (`skill/scripts/`) now auto-detect Chinese words (CJK range) and use the correct deck/model/fields. All scripts accept `--lang` flag. Chinese enrichment includes sentencePinyin and stroke order phases. SKILL.md updated.
- [x] **Chunked Text Enrichment** — batchEnrichText() now chunks words into groups of 15 to prevent 120s CLI timeout on large batches (40+ words). Both pipeline functions show per-chunk progress. MAX_PIPELINE_WORDS=50 cap (post-dedup) prevents unbounded processing.
- [x] **Deck-Based Browse Navigation** — Replaced deck toggle buttons on Browse page with always-visible deck sub-items under Browse in the sidebar nav. Each deck shows card count. Browse page reads `?deck=` from URL.
- [x] **Chinese Spelling Support** — Full Chinese language support: language auto-detection, Chinese note type/deck, Browse deck selector, Chinese enrichment prompts (pinyin, Chinese definitions, Chinese synonyms), Chinese TTS with SSML pinyin pronunciation, stroke order GIF generation from MDBG, Telegram Chinese auto-detection. All 8 phases complete.
- [x] **PDF Upload Support** — Added PDF support end-to-end: portal upload dropzone, extract API, Anthropic SDK (document blocks), Telegram bot (document handler). Improved vision error message for CLI mode.
- [x] **Distribute Media Files to All Profiles** — Media files (audio MP3s, images) are now stored in each target profile's `collection.media/` during distribution, fixing broken audio/images in non-home profiles.
- [x] **CI/CD Docker Image Builds** — GitHub Actions workflow (`.github/workflows/docker.yml`) auto-builds and pushes Docker image to Docker Hub (`gykpro/anki-spelling-portal`) on version tag push. `release.sh` updated to auto-push tags to origin.
- [x] **Ignore Dictation in Extraction** — Added rule to extraction prompt to skip dictation sections and only extract numbered spelling sentences.
- [x] **Word-Only Worksheet Extraction** — Extraction prompt now handles worksheets with only a word list (no sentences). Words extracted with empty sentence fields; enrichment generates sentences downstream.
- [x] **Release Process** — `scripts/release.sh` automates versioning, Docker image build, skill tarball packaging, and git tagging.
- [x] **Multi-Profile Distribution** — Switch active Anki profile from the portal sidebar/settings, and distribute cards (on create and on enrich) to other profiles automatically. Profile switcher in sidebar, distribution target config in Settings, auto-distribute on Quick Add, Enrich save, and Telegram bot pipeline.

## Infrastructure
- [x] **Docker + NAS Deployment** — Replaced Claude CLI with Anthropic SDK, added Dockerfile, docker-compose.yml (headless Anki + portal), NAS setup guide. Enables 24/7 operation on Synology NAS.
- [x] **Settings Page + Dual AI Backend** — Settings page at `/settings` to manage API keys and config. Dual AI backend: SDK (Anthropic API, pay-per-use) and CLI (Claude Code with Max subscription). Settings stored in `./data/secrets.json`, secrets never exposed via API.
- [x] **Dev Startup Script** — `npm run dev` now runs `scripts/dev-startup.mjs` which auto-launches Anki if not running, prints color-coded config status (AI backend, Azure TTS, Gemini, AnkiConnect URL), then spawns `next dev`.
- [x] **Single Config Source** — Removed env var support for API keys; all secrets managed via Settings page (`data/secrets.json`). Only `ANKI_CONNECT_URL` remains env-configurable (for Docker container networking).

## Already Existed (skipped)
- ~~Feature 3: Batch Quick Add~~ — Quick Add already supports multi-line input
- ~~Feature 4: Batch Enrichment~~ — Enrich page already has "Enrich All Empty"
