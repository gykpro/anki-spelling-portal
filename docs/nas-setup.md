# NAS Deployment Guide (Synology Docker)

## Architecture

```
Synology NAS (Docker)
├── anki-headless    (port 8765) — Anki + AnkiConnect, syncs with AnkiWeb
├── spelling-portal  (port 3000) — Next.js app (enrichment, TTS, image gen)
└── (future) telegram-bot
```

## Prerequisites

- Synology NAS with Docker (Container Manager) installed
- SSH access to NAS
- AnkiWeb account for syncing between NAS and desktop Anki

## Quick Start

### 1. Clone and configure

```bash
# SSH into NAS
ssh user@nas-ip

# Clone repo
git clone <repo-url> /volume1/docker/spelling-portal
cd /volume1/docker/spelling-portal

# Create .env from template
cp .env.docker .env
# Edit .env and fill in your API keys
nano .env
```

### 2. Start services

```bash
docker compose up -d
```

This starts:
- `anki-headless` on port 8765 (Anki with AnkiConnect)
- `spelling-portal` on port 3000 (Next.js app)

### 3. Initial AnkiWeb sync

On first run, you need to sync with AnkiWeb to pull your existing cards:

```bash
# Trigger sync (will prompt for AnkiWeb credentials on first run)
curl http://localhost:8765 -d '{"action":"sync","version":6}'
```

If the headless Anki doesn't have AnkiWeb credentials yet, you may need to configure them. Check the [headless-anki image docs](https://github.com/thisisnttheway/headless-anki) for setup instructions.

### 4. Set up periodic sync

Create a Synology Task Scheduler entry (Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script):

- **Schedule:** Every 6 hours
- **Script:**
```bash
curl -s http://localhost:8765 -d '{"action":"sync","version":6}'
```

This keeps the NAS Anki in sync with AnkiWeb so changes from your desktop Anki (or vice versa) are reflected.

## Local Development

When developing on your MacBook, you can point the portal at the NAS Anki instance:

```bash
# In .env.local
ANKI_CONNECT_URL=http://<nas-ip>:8765
ANTHROPIC_API_KEY=sk-ant-...
AZURE_TTS_KEY=...
AZURE_TTS_REGION=australiaeast
NANO_BANANA_API_KEY=...
```

Or keep using local Anki (synced via AnkiWeb) — just omit `ANKI_CONNECT_URL` and it defaults to `http://localhost:8765`.

## Updating

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
