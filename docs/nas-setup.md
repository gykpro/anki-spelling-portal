# NAS Deployment Guide (Synology Docker)

## Architecture

```
Synology NAS (Docker)
├── anki-headless    (port 8765) — Anki + AnkiConnect, syncs with AnkiWeb
├── spelling-portal  (port 3000) — Next.js app + Telegram bot (enrichment, TTS, image gen)
```

## Prerequisites

- Synology NAS with Docker (Container Manager) installed
- SSH access to NAS
- AnkiWeb account for syncing between NAS and desktop Anki

## Quick Start

### 1. Clone and start

```bash
# SSH into NAS
ssh user@nas-ip

# Clone repo
git clone <repo-url> /volume1/docker/spelling-portal
cd /volume1/docker/spelling-portal

# Start services
docker compose up -d
```

This starts:
- `anki-headless` on port 8765 (Anki with AnkiConnect)
- `spelling-portal` on port 3000 (Next.js app)

### 2. Configure API keys

Visit `http://<nas-ip>:3000/settings` in your browser and enter your keys.

#### AI Backend (choose one)

You need one of these for text enrichment and worksheet extraction:

| Option | Key | Cost | Vision support | How to get |
|--------|-----|------|---------------|------------|
| **SDK** (recommended) | `ANTHROPIC_API_KEY` | Pay-per-use | Yes | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| **CLI** | `CLAUDE_CODE_OAUTH_TOKEN` | Free (Max subscription) | No (text only) | Run `claude setup-token` on your local machine, copy the token |

Set **Backend Mode** to "Auto" (default) to use SDK if available, else fall back to CLI.

> **Note:** The CLI option requires a Claude Max subscription ($100/month or $200/month). It uses the Claude Code CLI protocol — run `claude setup-token` on any machine with Claude Code installed, then paste the resulting token into the Settings page. Vision/extraction features (worksheet photos) require the SDK option.

#### Other services

- **Azure TTS Key + Region** — for audio generation ([Azure Portal](https://portal.azure.com) → Cognitive Services → Speech)
- **Gemini API Key** — for image generation ([aistudio.google.com](https://aistudio.google.com))
- **Telegram Bot Token** — for Telegram bot (see [telegram-setup.md](telegram-setup.md))
- **Telegram Allowed Users** — comma-separated user IDs (optional)

Keys are stored in the `portal-data` Docker volume and persist across restarts.

### 3. Initial AnkiWeb sync (first run)

On first run, you need to log in to AnkiWeb via VNC to pull your existing cards:

1. Edit `docker-compose.yml`: change `QT_QPA_PLATFORM` to `vnc` and uncomment port `5900`
2. Restart the anki container: `docker compose up -d anki`
3. Connect with a VNC client (e.g., macOS Screen Sharing) to `<nas-ip>:5900`
4. In the Anki GUI, click **Sync** and enter your AnkiWeb credentials
5. Once sync completes, switch `QT_QPA_PLATFORM` back to `offscreen`, comment out port `5900`, and restart: `docker compose up -d anki`

After the initial login, AnkiWeb credentials are stored and future syncs work via the API:

```bash
curl http://localhost:8765 -d '{"action":"sync","version":6}'
```

### 4. Set up periodic sync

Create a Synology Task Scheduler entry (Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script):

- **Schedule:** Every 6 hours
- **Script:**
```bash
curl -s http://localhost:8765 -d '{"action":"sync","version":6}'
```

This keeps the NAS Anki in sync with AnkiWeb so changes from your desktop Anki (or vice versa) are reflected.

## Local Development

When developing on your MacBook:

1. Run `npm run dev` to start the dev server
2. Visit `http://localhost:3000/settings` to configure API keys
3. To point at the NAS Anki instance, set `ANKI_CONNECT_URL` in Settings to `http://<nas-ip>:8765`

Or keep using local Anki (synced via AnkiWeb) — the default `http://localhost:8765` works automatically.

## Updating

### Option A: Pre-built image from Docker Hub (recommended)

```bash
cd /volume1/docker/spelling-portal
docker pull gykpro/anki-spelling-portal:latest
docker compose up -d portal
```

To use the pre-built image, uncomment the `image:` line and comment out `build: .` in `docker-compose.yml`.

### Option B: Build from source

```bash
cd /volume1/docker/spelling-portal
git pull
docker compose build portal
docker compose up -d portal
```

## Troubleshooting

### Check if Anki is responding
```bash
curl http://localhost:8765 -d '{"action":"version","version":6}'
# Expected: {"result":6,"error":null}
```

### Check portal logs
```bash
docker compose logs portal
```

### Check Anki logs
```bash
docker compose logs anki
```

### Rebuild from scratch
```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```
