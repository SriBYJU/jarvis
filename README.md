# J.A.R.V.I.S. v3
**Just A Rather Very Intelligent System** — a local-first personal AI operating system with the original Iron-Man-style HUD preserved and a new agent runtime underneath it.

## What changed in v3

The visual identity stays JARVIS. The intelligence layer is rebuilt around a local companion service so normal use no longer depends on free cloud-model quotas.

### Local-first intelligence
- **Ollama as the primary AI runtime** — local, offline-capable, no per-message provider quota
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

Background missions persist locally and can continue processing while the companion service is running.

### Dynamic HUD workspace
The existing HUD stays in place, and v3 adds an independent floating workspace layer that can be controlled conversationally.

Supported actions include showing, moving, resizing, clearing, saving, restoring and removing panels. Current v3 modules include holographic-style map, weather, system status, missions, Spotify/media, browser context/screenshots, integration status and executive briefings.

### Real local browser control
A persistent Playwright/Chrome service gives JARVIS a dedicated browser profile. JARVIS can:

- open real websites and new tabs
- reuse locally authorized sessions in its own Chrome profile
- read page content, links and buttons
- click visible controls
- fill labeled inputs
- switch tabs
- capture the live page into the HUD

Consequential browser actions that look like final submissions, sends, purchases, bookings, deletes or publishing are permission-gated.

### Executive briefing
Commands such as `what did I miss?`, `brief me`, or `how is everything doing?` assemble a live briefing from background missions, system state, integration health and recent local context, then render it into the HUD.

### Local computer capabilities
The companion can currently read/write approved files, list approved folders, launch applications, open URLs, inspect CPU/memory/OS information, store/recall memory, run persistent missions, operate the JARVIS browser and call free weather/geocoding services.

Desktop, Documents and Downloads are allowed by default. Extra folders must be explicitly added with `JARVIS_WORKSPACES`.

### Spotify
A local Spotify PKCE adapter is included. After adding a Spotify Client ID and authorizing once, JARVIS can handle natural commands such as `play [song or artist]`, `pause the music`, `skip this song`, `go back one track`, and `volume 40`.

Spotify control is kept separate from the AI model so routine playback commands do not consume model requests.

### MCP / integrations
A generic local MCP bridge is included for integrations such as Gmail, Google Calendar and Buffer. The build works before those integrations are configured. MCP commands and OAuth/API credentials are added locally later and are not committed to GitHub.

### Existing v2 features preserved
The original app still contains its existing tools and UI, including voice input and browser speech output, wake-word mode, JARVIS / FRIDAY / EDITH personas, weather, maps, YouTube, web search/browsing, news, stocks, translation, currency/unit conversion, world clocks, timers/reminders, code generation, conversation history, project/file tools, system/screen panels, the animated orb, rings, scanlines and dark HUD aesthetic.

The v3 bridge sits above the existing app instead of deleting it, so old tools remain available as fallbacks while the local runtime takes over normal AI traffic when online.

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
   ┌────────┼─────────┬──────────┬───────────┐
   ▼        ▼         ▼          ▼           ▼
  HUD     FILES     APPS      BROWSER      SYSTEM
   │                                │
   ├──────── WEATHER / GEO           ├── persistent Chrome profile
   ├──────── BACKGROUND MISSIONS     └── page read/click/fill/tabs
   ├──────── EXECUTIVE BRIEFING
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
- `127.0.0.1:3006` — Persistent Chrome/Playwright Service

When the local core is detected, the top-right badge in the HUD changes to **LOCAL CORE** and shows the state of browser, MCP and Spotify services.

### Ollama

Install and start Ollama, then pull at least one model. The default model name is configurable in `companion/.env`:

```env
JARVIS_MODEL=qwen3:4b
```

The best model depends on the machine's RAM, GPU and VRAM. JARVIS falls back to the first installed model if the configured model is unavailable.

---

## Integration setup

Do **not** commit or paste secrets into the repository.

Use `companion/.env` for local credentials and connector commands. The safe template is `companion/.env.example`.

Later configuration can include:
- `SPOTIFY_CLIENT_ID`
- `GMAIL_MCP_COMMAND`
- `GOOGLE_CALENDAR_MCP_COMMAND`
- `BUFFER_MCP_COMMAND`
- optional OAuth/API credentials where needed
- optional `GITHUB_TOKEN`
- optional browser path/profile overrides

The application is intentionally usable before those values are supplied.

---

## Security model

The local runtime is intentionally not unrestricted.

- localhost-only services
- explicit paired web origins
- approved filesystem roots
- dedicated JARVIS browser profile
- no default delete-file tool
- local writes governed by policy
- external/destructive browser and MCP actions permission-gated
- real secrets stay in ignored local environment files
- background missions use execution checkpoints instead of infinite loops

---

## Validation

The repository includes a JARVIS v3 CI workflow that checks local-core JavaScript syntax, the Next.js production build, companion dependency installation, Playwright module availability and core module loading.

The goal is not to count a feature because a button exists. A v3 feature should be wired end-to-end, fail clearly, preserve fallbacks and integrate naturally with the HUD.
