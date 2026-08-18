# J.A.R.V.I.S. Local Core v3

This folder turns the existing JARVIS HUD into a local-first personal AI system instead of a cloud-only chatbot.

## What is already built

- Local Ollama intelligence with no per-message API quota
- Main JARVIS orchestrator plus specialist agents: TOM, SCOUT, F.R.I.D.A.Y., ATLAS, ECHO, ARGUS
- Tool calling instead of command-only regex routing
- Persistent background mission queue while the companion is running
- Local long-term memory
- Approved-workspace file reading/writing
- App and URL launching
- System telemetry
- Free no-key weather and geocoding
- Dynamic HUD actions (show, clear, save, restore, remove)
- Original web app automatically falls back to its old cloud route if the local core is unavailable
- Integration status layer for Gmail, Google Calendar, Buffer, Spotify, and GitHub

## Start on Windows

1. Install Node.js if it is not already installed.
2. Install Ollama and make sure it is running.
3. Pull at least one local model. A small model is recommended first; the model can be changed later in `.env`.
4. Open PowerShell in this `companion` folder.
5. Run:

```powershell
npm install
Copy-Item .env.example .env
npm start
```

The local core listens only on `127.0.0.1:3003` by default.

When the normal JARVIS website is open, the small status badge in the upper-right should change to `LOCAL CORE`. The existing chat UI then routes standard chat requests through the local core automatically. If Ollama is not available, the website keeps its existing cloud fallback instead of becoming unusable.

## Model selection

Set this in `companion/.env`:

```env
JARVIS_MODEL=qwen3:4b
```

The best model depends on the computer's RAM, GPU and VRAM. Start small for speed. A stronger model can be selected later without changing the application architecture.

## Security model

JARVIS does not get unrestricted filesystem access by default. The local core approves Desktop, Documents and Downloads, plus any folders explicitly added to `JARVIS_WORKSPACES`.

Read actions can run automatically. Normal local file writes can be allowed. External or destructive actions such as sending messages, deleting files, publishing, purchasing, placing calls, or changing accounts are designed to require an approval step.

Secrets belong only in local environment files. Do not put API keys, OAuth client secrets, passwords or tokens into the repository.

## Background missions

The local core persists missions under the user's `.jarvis` directory. A mission can continue processing while the companion server stays running.

Examples of intended conversational requests:

- `Jarvis, keep working on this project while I'm away.`
- `Have Scout research the competitors and summarize what matters.`
- `Give Tom this coding task and leave the result ready for review.`
- `Remember that I want this workspace kept as my markets layout.`

## HUD workspace

The web overlay supports draggable floating panels and commands for clearing, saving and restoring the workspace. Map, weather, system and mission panels are already supported by the bridge. Additional panels can be added without replacing the original Iron-Man-style UI.

## Integrations to connect later

The build is intentionally usable before any of these are connected.

- Gmail / Google Calendar: OAuth or MCP adapter
- Buffer: API or MCP adapter
- Spotify: OAuth for playback/control
- GitHub: local Git authentication or token/app integration

Use `GET /v1/integrations` to see which integrations are configured locally.

## Core endpoints

- `GET /health` — local core, Ollama, model, agents, capabilities
- `POST /v1/chat` — conversational JARVIS routing
- `POST /v1/agent` — agent-mode SSE endpoint
- `GET/POST /v1/tasks` — persistent background missions
- `GET/POST /v1/memory` — local long-term memory
- `GET /v1/integrations` — integration status
- `POST /v1/action` — direct tool/action endpoint

## Free-first design

The core does not require a paid LLM API. Ollama is the primary intelligence provider. Public no-key services are used for lightweight data where practical. Cloud AI remains optional fallback rather than the thing that keeps JARVIS alive.
