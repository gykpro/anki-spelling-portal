# Local Anki Container Setup

## Location

`~/services/anki/`

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Docker Compose                        │
│                                                          │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────┐ │
│  │ anki-source  │  │anki-receiver-1│  │anki-receiver-2│ │
│  │              │  │               │  │               │ │
│  │ API:  8770   │  │ API:  8771    │  │ API:  8772    │ │
│  │ VNC:  6080   │  │ VNC:  6081    │  │ VNC:  6082    │ │
│  └──────┬───────┘  └──────┬────────┘  └──────┬────────┘ │
│         │                  │                  │          │
│         ▼                  ▼                  ▼          │
│  data/source/       data/receiver-1/   data/receiver-2/ │
│         │                  │                  │          │
│         └──────────┐       │       ┌──────────┘          │
│                    ▼       ▼       ▼                     │
│                      export/ (shared)                    │
│                   (rw for source, ro for receivers)      │
└──────────────────────────────────────────────────────────┘
```

## Ports

| Container       | AnkiConnect | noVNC (browser) |
|-----------------|-------------|-----------------|
| anki-source     | 8770        | 6080            |
| anki-receiver-1 | 8771        | 6081            |
| anki-receiver-2 | 8772        | 6082            |

All bound to 127.0.0.1 only. Ports 8770+ avoid conflict with local Anki desktop app (8765).

## Prerequisites

- Podman (aliased as `docker`) with a running machine: `podman machine start`
- Image built: `cd ~/services/anki && podman build -t anki-local:latest .`

## Usage

### Start all containers

```bash
cd ~/services/anki
docker compose up -d
```

### Access noVNC (browser)

- Source: http://localhost:6080/vnc.html?autoconnect=true
- Receiver 1: http://localhost:6081/vnc.html?autoconnect=true
- Receiver 2: http://localhost:6082/vnc.html?autoconnect=true

### First run

On first startup with empty data directories, each container shows a language selection dialog via noVNC. Select English (United States) and click OK → Yes. The AnkiConnect addon is auto-linked by the entrypoint.

### Package distribution workflow

1. Export from source via AnkiConnect API:
   ```bash
   curl -X POST http://localhost:8770 -d '{
     "action": "exportPackage",
     "version": 6,
     "params": {"deck": "DeckName", "path": "/export/deck.apkg", "includeSched": false}
   }'
   ```

2. Import on receivers (export/ is mounted read-only):
   ```bash
   curl -X POST http://localhost:8771 -d '{
     "action": "importPackage",
     "version": 6,
     "params": {"path": "/export/deck.apkg"}
   }'
   ```

### Check health

```bash
curl -s localhost:8770 -X POST -d '{"action":"version","version":6}'
curl -s localhost:8771 -X POST -d '{"action":"version","version":6}'
curl -s localhost:8772 -X POST -d '{"action":"version","version":6}'
```

## Files

```
~/services/anki/
├── docker-compose.yml
├── Dockerfile          — extends thisisnttheway/headless-anki, adds TigerVNC + noVNC + updated Anki
├── entrypoint.sh       — auto-links AnkiConnect addon, starts Xvnc + openbox + noVNC + Anki
├── data/
│   ├── source/         — anki-source profile data
│   ├── receiver-1/     — anki-receiver-1 profile data
│   └── receiver-2/     — anki-receiver-2 profile data
└── export/             — shared export directory (source writes, receivers read)
```

## Known issues

- Image is linux/amd64 running under emulation on ARM Mac — slower startup but functional
- `xdotool` inside containers doesn't work under Podman amd64 emulation (DISPLAY env var not passed correctly)
- Base image's seeded profile data (`prefs21.db`) is incompatible with updated Anki — always start with empty data dirs
