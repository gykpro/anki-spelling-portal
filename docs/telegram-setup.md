# Telegram Bot Setup Guide

## Overview

The Telegram bot lets you add words to Anki by messaging them via Telegram. It supports:
- **Single words or phrases** — send a word and it gets added + fully enriched
- **Word lists** — send multiple words (comma-separated or one per line)
- **Worksheet photos** — send a photo of a spelling worksheet for automatic extraction

The bot runs inside the Next.js process using long-polling (no public URL needed), making it ideal for NAS/Docker deployment behind NAT.

## Step 1: Create a Bot via BotFather

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name for your bot (e.g., "Gao Spelling Bot")
4. Choose a username (must end in `bot`, e.g., `gao_spelling_bot`)
5. BotFather will reply with your **bot token** — copy it

The token looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

## Step 2: Get Your Telegram User ID

To restrict who can use the bot (recommended), you need your Telegram user ID:

1. Search for **@userinfobot** on Telegram
2. Send it any message
3. It replies with your user ID (a number like `123456789`)

## Step 3: Configure in Settings Page

1. Open the portal at `http://localhost:3000/settings` (or `http://<nas-ip>:3000/settings`)
2. Scroll to the **Telegram Bot** section
3. Enter your **Bot Token** from Step 1
4. Enter your **Allowed User IDs** (comma-separated if multiple users)
   - Leave empty to allow anyone to use the bot (not recommended for public networks)
5. Click **Save Changes**

## Step 4: Restart the Server

The bot starts automatically when the server boots. After saving the token:

- **Local dev:** Stop and re-run `npm run dev`
- **Docker:** `docker compose restart portal`

You should see in the logs:
```
[Telegram] Bot started (long-polling)
```

If no token is configured, you'll see:
```
[Telegram] No bot token configured — skipping
```

## Usage

### Adding words
Send a message with one or more words:

```
adventure
```

Or multiple words (comma-separated or one per line):
```
adventure, mysterious, expedition
```

```
adventure
mysterious
expedition
```

The bot will:
1. Check for duplicates (skips existing words)
2. Create notes in Anki
3. Enrich with definition, phonetics, synonyms, example sentences
4. Generate word audio and sentence audio (Azure TTS)
5. Generate an illustration (Gemini)
6. Report results

### Sending worksheet photos
Send a photo of a spelling worksheet. The bot will:
1. Extract words and sentences using AI vision
2. Create notes with the original sentences
3. Enrich remaining fields
4. Generate audio and images
5. Report results

### Unknown messages
If you send something the bot doesn't understand (e.g., a long sentence or question), it replies with usage instructions.

## Troubleshooting

### Bot doesn't start
- Check the terminal/Docker logs for error messages
- Verify the token is correct (try revoking and creating a new one via @BotFather)
- Ensure the server has internet access (needed to reach Telegram's API)

### Bot doesn't respond
- Verify your user ID is in the "Allowed User IDs" list (or leave it empty)
- Check if the bot is running: look for `[Telegram] Bot started` in logs
- The bot drops pending updates on startup — messages sent while the bot was offline won't be processed

### "Anki is not reachable"
- Ensure Anki is running with AnkiConnect plugin
- In Docker: ensure the anki-headless container is running and the portal can reach it

### Enrichment errors
- Check that AI backend is configured (Anthropic API key or Claude OAuth token)
- Check that Azure TTS key and Gemini API key are configured
- Individual enrichment failures are reported but don't block other steps
