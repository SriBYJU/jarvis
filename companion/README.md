# J.A.R.V.I.S. Local Core v3

This folder turns the existing JARVIS HUD into a local-first personal AI system instead of a cloud-only chatbot.

## What is already built

- Local Ollama intelligence with no per-message provider quota
- Main JARVIS orchestrator plus specialist agents: TOM, SCOUT, F.R.I.D.A.Y., ATLAS, ECHO, ARGUS
- Tool calling instead of command-only regex routing
- Persistent background mission queue while the companion is running
- Local long-term memory
- Approved-workspace file reading/writing
- App and URL launching
- System telemetry
- Free no-key weather and geocoding
- Dynamic HUD actions: show, move, resize, clear, save, restore, remove
- Persistent Playwright/Chrome service for real browser work
- Spotify PKCE playback adapter
- Local MCP bridge for Gmail, Google Calendar, Buffer and future integrations
- Executive briefing that summarizes missions, local system state, service health and recent context
- Original web app automatically falls back to its old cloud route if the local core is unavailable

## Start on Windows

1. Install Node.js if it is not already installed.
2. Install Google Chrome if it is not already installed. JARVIS uses a separate persistent Chrome profile so it can keep its own authorized sessions without taking over your normal Chrome profile.
3. Install Ollama and make sure it is running.
4. Pull at least one local model. Start with a smaller model for responsiveness; you can switch later in `.env`.
5. Open PowerShell in this `companion` folder.
6. Run:

```powershell
./setup-windows.ps1
```

Or manually:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

Local services:

- `127.0.0.1:3003` — JARVIS Core
- `127.0.0.1:3004` — MCP Bridge
- `127.0.0.1:3005` — Spotify Adapter
- `127.0.0.1:3006` — Persistent Browser Service

When the normal JARVIS website is open, the status badge should change to `LOCAL CORE`. The existing chat UI then routes normal AI requests through the local core automatically. If the local core or Ollama is unavailable, the website keeps the existing cloud fallback instead of becoming unusable.

## Model selection

Set this in `companion/.env`:

```env
JARVIS_MODEL=qwen3:4b
```

The best local model depends on the computer's RAM, GPU and VRAM. The architecture is model-independent; you can change the Ollama model without rewriting JARVIS.

## Browser automation

The browser service launches visible Chrome with a separate persistent JARVIS profile stored under `~/.jarvis/browser-profile` by default. Log into sites you want JARVIS to use from that browser profile once; the session can then persist locally.

The main JARVIS agent can choose browser tools itself. Available actions include opening pages, creating/selecting tabs, reading page content, clicking visible controls, filling labeled inputs, pressing keys and capturing the current page.

Browser actions that look like final submissions, sends, purchases, bookings, deletes or publishing are permission-gated instead of being silently executed.

If Chrome is not detected automatically, set `JARVIS_CHROME_PATH` in `.env`.

## Security model

JARVIS does not get unrestricted filesystem access by default. Desktop, Documents and Downloads are approved, plus any folders explicitly added to `JARVIS_WORKSPACES`.

Read actions can run automatically. Normal local writes can be allowed. External or destructive actions such as sending messages, deleting data, publishing, purchasing, final form submission, placing calls or changing accounts are intended to require approval.

Local services listen only on `127.0.0.1` and accept browser requests only from paired origins. Add any additional exact web origin through `JARVIS_WEB_ORIGINS`.

Secrets belong only in local environment files. Do not put API keys, OAuth client secrets, passwords or tokens into the repository or chat.

## Background missions and specialist agents

The local core persists missions under the user's `.jarvis` directory. A mission can continue processing while the companion remains running.

Examples:

```text
Jarvis, keep working on this project while I'm away.
Have Scout research the competitors and summarize what matters.
Give Tom this coding task and leave the result ready for review.
What did I miss?
How is everything doing?
```

JARVIS can delegate bounded work to specialist agents and then verify/report their result through the main conversation.

## HUD workspace

The web overlay supports draggable floating panels plus conversational control for moving, resizing, saving, restoring and clearing the workspace.

Current v3 HUD modules include map, weather, system, mission, media/Spotify, browser context/screenshots, integrations and executive briefings. These sit on top of the existing Iron-Man-style interface rather than replacing it.

## Spotify

Set `SPOTIFY_CLIENT_ID` in `companion/.env`, start JARVIS, then open:

```text
http://127.0.0.1:3005/spotify/connect
```

Authorize once. Natural commands such as `play ...`, `pause the music`, `skip this`, `go back one track`, and `volume 40` then route directly to the local Spotify adapter instead of consuming LLM requests just to control playback.

Spotify availability and playback controls are still subject to Spotify account/device requirements.

## Gmail, Calendar and Buffer through MCP

The bridge accepts local MCP server commands configured through:

```env
GMAIL_MCP_COMMAND=
GOOGLE_CALENDAR_MCP_COMMAND=
BUFFER_MCP_COMMAND=
```

JARVIS can list tools from a configured MCP integration and call safe/read tools. MCP tools whose names indicate sending, publishing, deleting, booking, cancelling or other consequential actions are permission-gated.

The build works before any MCP integration is configured.

## Useful endpoints

- `GET /health` — local core, Ollama, agents and service health
- `POST /v1/chat` — conversational JARVIS routing
- `POST /v1/agent` — agent-mode SSE endpoint
- `GET/POST /v1/tasks` — persistent missions
- `GET /v1/briefing` — executive briefing payload
- `GET/POST /v1/memory` — local long-term memory
- `GET /v1/integrations` — integration configuration status
- `POST /v1/action` — direct tool/action endpoint

## Free-first design

The primary intelligence path does not require a paid LLM API. Ollama runs the model locally, so normal JARVIS conversation and agent reasoning do not consume the old OpenRouter free-model request allowance. External services such as Gmail, Spotify, Buffer or websites still have their own account rules and quotas.
