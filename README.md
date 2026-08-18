# J.A.R.V.I.S. v3
**Just A Rather Very Intelligent System** — a local-first personal AI operating system with the original Iron-Man-style HUD preserved and a new agent runtime underneath it.

## What changed in v3

The visual identity stays JARVIS. The intelligence layer is rebuilt around a local companion service so the assistant no longer depends on free cloud-model quotas for normal use.

### Local-first intelligence
- **Ollama as the primary AI runtime** — local, offline-capable, no per-message API quota
- Existing OpenRouter/Gemini/cloud paths remain available as fallback when the local core is unavailable
- Conversational tool calling replaces regex-only command handling as the primary intelligence layer
- Simple commands still use instant routing for speed
- Local long-term memory persists outside the browser

### Main agent + specialist agents
JARVIS acts as the orchestrator and can delegate bounded work to:

- **TOM** — developer / coding agent
- **SCOUT** — research agent
- **F.R.I.D.A.Y.** — operations agent
- **ATLAS** — analytics agent
- **ECHO** — communications agent
- **ARGUS** — monitoring agent

Background missions are persisted locally and continue processing while the companion service is running.

### Dynamic HUD workspace
The existing HUD stays in place, and v3 adds an independent floating workspace layer that can be controlled conversationally.

Supported actions include:
- show panels
- move panels
- resize panels
- clear the workspace
- save the current layout
- restore the saved layout
- remove individual panels

Map, weather, system, mission and media panels are already supported. The design intentionally keeps the futuristic blue HUD feel instead of replacing it with a generic AI dashboard.

### Local computer capabilities
The companion can currently:
- read approved local files
- write approved local files
- list approved folders
- launch applications
- open URLs
- inspect CPU / memory / OS information
- store and recall memory
- run persistent missions
- call free weather/geocoding services

Desktop, Documents and Downloads are allowed by default. Extra folders must be explicitly added with `JARVIS_WORKSPACES`.

### Spotify
A local Spotify PKCE adapter is included. After adding a Spotify Client ID and authorizing once, JARVIS can handle natural commands such as:
- `play [song or artist]`
- `pause the music`
- `skip this song`
- `go back one track`
- `volume 40`

Spotify control is kept separate from the AI model so playback commands do not consume model quota.

### MCP / integrations
A generic local MCP bridge is included for integrations such as:
- Gmail
- Google Calendar
- Buffer

The build can run before those integrations are configured. MCP commands and OAuth/API credentials are added locally later and are not committed to GitHub.

### Existing v2 features preserved
The original app still contains its existing tools and UI, including:
- voice input and browser speech output
- wake-word mode
- JARVIS / FRIDAY / EDITH personas
- weather
- maps
- YouTube
- web search and browsing
- news
- stocks
- translation
- currency and unit conversion
- world clocks
- timers and reminders
- code generation
- persistent conversation history
- project tools
- file generation
- system / screen panels
- the animated orb, rings, scanlines and dark HUD aesthetic

The v3 bridge sits above the existing app instead of deleting it, which means old tools remain available as fallbacks while the local runtime takes over normal AI traffic when it is online.

---

## Architecture

```text
                         YOU
                  voice / text / HUD
                         │
                         ▼
              ORIGINAL JARVIS WEB HUD
                         │
                 JarvisCoreOverlay
                         │
            ┌────────────┴────────────┐
            │                         │
      LOCAL CORE ONLINE          LOCAL CORE OFFLINE
            │                         │
            ▼                         ▼
      OLLAMA + AGENTS          EXISTING CLOUD FALLBACK
            │
      tool calling / memory
            │
   ┌────────┼─────────┬──────────┐
   ▼        ▼         ▼          ▼
  HUD     FILES     APPS       SYSTEM
   │
   ├──────── WEATHER / GEO
   ├──────── BACKGROUND MISSIONS
   ├──────── SPOTIFY ADAPTER
   └──────── MCP BRIDGE
                │
          Gmail / Calendar / Buffer
```

---

## Quick start

### Web HUD

```bash
npm install
npm run dev
```

Open the normal app as before.

### Local JARVIS Core

On Windows, open PowerShell inside `companion/` and run:

```powershell
./setup-windows.ps1
```

Or manually:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

The local services run on:
- `127.0.0.1:3003` — JARVIS Core
- `127.0.0.1:3004` — MCP Bridge
- `127.0.0.1:3005` — Spotify Adapter

When the local core is detected, the top-right badge in the HUD changes to **LOCAL CORE**.

### Ollama

Install and start Ollama, then pull at least one model. The default model name is configurable in `companion/.env`:

```env
JARVIS_MODEL=qwen3:4b
```

The best model depends on the machine's RAM, GPU and VRAM. JARVIS automatically falls back to the first installed model if the configured model is unavailable.

---

## Integration setup

Do **not** commit secrets.

Use `companion/.env` for local credentials and connector commands. The safe template is `companion/.env.example`.

Later configuration can include:
- `SPOTIFY_CLIENT_ID`
- `GMAIL_MCP_COMMAND`
- `GOOGLE_CALENDAR_MCP_COMMAND`
- `BUFFER_MCP_COMMAND`
- optional OAuth/API credentials where needed
- optional `GITHUB_TOKEN`

The application is intentionally usable before those values are supplied.

---

## Security model

The local runtime is intentionally not unrestricted.

- localhost-only services
- explicit allowed web origins
- approved filesystem roots
- no default delete-file tool
- local writes governed by policy
- external/destructive actions designed to require approval
- real secrets stay in ignored local environment files
- background missions have execution checkpoints instead of infinite loops

---

## Validation

The repository includes a JARVIS v3 CI workflow that checks:
- local-core JavaScript syntax
- the Next.js production build
- companion dependency installation
- core module loading

The goal is not to count a feature because a button exists. A v3 feature should be wired end-to-end, fail clearly, preserve fallbacks, and integrate naturally with the HUD.
