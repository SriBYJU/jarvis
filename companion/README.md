# J.A.R.V.I.S. Companion Server

A lightweight local server that runs on your machine and unlocks powerful features for your JARVIS web app.

## What It Does

Your JARVIS web app runs on Vercel and works great — but some things require local machine access. The companion server bridges that gap:

| Feature | Without Companion | With Companion |
|---|---|---|
| Code Execution | Sandboxed JS only | Python, JS, Bash — real system access |
| File Access | None | Read, write, create, delete files |
| Screen Capture | Browser permission popup | Native screenshot, no popup |
| App Launcher | None | Open Spotify, VS Code, Chrome, etc. |
| AI Models | Cloud APIs only | Local LLMs via Ollama (unlimited, offline) |
| System Info | Limited browser data | Real CPU, RAM, disk, processes |
| Spreadsheets | None | Create CSV files, auto-open in Excel/Sheets |
| Documents | None | Generate HTML/Markdown docs, auto-open |
| File Organization | None | Auto-sort files by type into folders |
| File Search | None | Search your entire machine for files |
| Clipboard | None | Read/write system clipboard |

## Quick Start

```bash
cd companion
npm install
npm start
```

That's it. The companion runs on `http://localhost:3003`. Your JARVIS web app auto-detects it.

## Ollama (Optional)

For unlimited, offline AI with zero quotas:

1. Install Ollama: https://ollama.com
2. Pull a model: `ollama pull llama3.2`
3. Ollama runs automatically — the companion connects to it

With Ollama, JARVIS never runs out of AI models. Automations run with zero rate limits.

## API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Status check + capabilities list |
| `/execute` | POST | Run code (JS, Python, Bash) |
| `/files` | POST | File operations (read, write, list, delete, exists, mkdir) |
| `/screenshot` | GET | Capture screen as base64 PNG |
| `/open-app` | POST | Launch applications or URLs |
| `/ollama` | POST | Chat with local LLM |
| `/ollama/models` | GET | List installed Ollama models |
| `/system-info` | GET | CPU, RAM, disk, OS info |
| `/processes` | GET | Running processes list |
| `/task` | POST | Smart tasks (spreadsheet, document, organize, search, clipboard) |

## Smart Tasks

The `/task` endpoint handles complex operations:

```bash
# Create a spreadsheet
curl -X POST http://localhost:3003/task -H "Content-Type: application/json" \
  -d '{"type":"spreadsheet","data":{"title":"My Data","headers":["Name","Value"],"rows":[["Test","123"]]}}'

# Create a document
curl -X POST http://localhost:3003/task -H "Content-Type: application/json" \
  -d '{"type":"document","data":{"title":"My Report","content":"Hello world","format":"html"}}'

# Organize downloads folder
curl -X POST http://localhost:3003/task -H "Content-Type: application/json" \
  -d '{"type":"organize_files","data":{"directory":"~/Downloads"}}'

# Search for files
curl -X POST http://localhost:3003/task -H "Content-Type: application/json" \
  -d '{"type":"search_files","data":{"query":"report","directory":"~"}}'
```

## Security Note

The companion server only accepts connections from your local machine (via CORS). It does NOT expose your files or system to the internet. Only your JARVIS web app running in your browser can communicate with it.
