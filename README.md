# J.A.R.V.I.S. v2.0
**Just A Rather Very Intelligent System** — The ultimate free AI assistant with Iron Man HUD aesthetics.

## Features

### Core AI
- 8 free OpenRouter LLM models with automatic fallback chain (never hits rate limits)
- Gemini API fallback
- Streaming token responses (real-time text like ChatGPT)
- 3 AI personas: **JARVIS**, **FRIDAY**, **EDITH** — each with unique voice

### Voice
- Voice input via Web Speech API
- Voice output via Speech Synthesis with **persona-tuned voices** (different voice, pitch, rate per persona)
- Wake-word detection: say **"Hey JARVIS"**, **"Hey FRIDAY"**, or **"Hey EDITH"**

### Tools & Capabilities
- **Holographic Maps** — Google Maps with sci-fi HUD filter
- **Weather** — real-time weather data (OpenWeatherMap)
- **YouTube** — search and embed videos
- **Web Search** — Google Custom Search with results panel
- **Web Browse** — fetch and summarize any webpage
- **News** — live headlines (NewsAPI)
- **Stocks** — real-time market data (Finnhub)
- **Translation** — 20+ languages via MyMemory + LibreTranslate
- **Currency Converter** — live exchange rates (Frankfurter)
- **Unit Converter** — 14+ unit conversions (km/h, mph, celsius, etc.)
- **World Clocks** — 6 timezone grid
- **Countdown Timer** — with audible expiry alert
- **Absolute-Time Reminders** — "remind me at 5pm to call mom"
- **Jokes** — fetched live from official joke API
- **Code Generation** — with syntax highlighting and copy button
- **Persistent Memory** — "remember X" / "what did I say about Y" / "forget everything"

### Conversation History
- Auto-saves conversations to localStorage + server
- Browse and restore past sessions
- Persists across browser refreshes

### UI
- Iron Man HUD aesthetic with animated orb, spinning rings, scanlines
- Animated tool panels with sci-fi transitions
- Dark theme optimized for focus

---

## Quick Start

### 1. Get API keys (all free)
| Service | URL | Required? |
|---------|-----|-----------|
| OpenRouter | [openrouter.ai/keys](https://openrouter.ai/keys) | Yes (or Gemini) |
| Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Fallback |
| YouTube | [console.cloud.google.com](https://console.cloud.google.com/apis/library/youtube.googleapis.com) | Optional |
| OpenWeatherMap | [openweathermap.org](https://home.openweathermap.org/api_keys) | Optional |
| Finnhub | [finnhub.io](https://finnhub.io/) | Optional |
| NewsAPI | [newsapi.org](https://newsapi.org/) | Optional |
| Google CSE | [programmablesearchengine.google.com](https://programmablesearchengine.google.com/) | Optional |

### 2. Run locally
```bash
cp .env.local.example .env.local
# Fill in your API keys in .env.local

npm install
npm run dev
# Open http://localhost:3000
```

### 3. Deploy on Vercel (free)
- Go to [vercel.com](https://vercel.com) and import this repo
- Add your API keys as Environment Variables
- Deploy — live in ~2 minutes

---

## Architecture

```
pages/
  index.js          — Full React UI with all tool panels
  api/
    chat.js         — Main chat endpoint with intent detection + LLM
    stream.js       — SSE streaming endpoint
    history.js      — Conversation history persistence
    tools/
      weather.js    — OpenWeatherMap
      youtube.js    — YouTube Data API
      translate.js  — MyMemory + LibreTranslate
      currency.js   — Frankfurter API
      convert.js    — Unit conversion
      worldclock.js — Timezone display
      joke.js       — Official Joke API
      stock.js      — Finnhub
      news.js       — NewsAPI
      memory.js     — Persistent memory CRUD
      reminder.js   — Absolute-time reminders
      websearch.js  — Google Custom Search
      browse.js     — Web page fetcher/summarizer
lib/
  intent.js         — Regex-based intent detection
  llm.js            — OpenRouter + Gemini with fallback chain
  store.js          — File-based JSON storage
```

## Commands

| Say / Type | What happens |
|---|---|
| "Weather in Tokyo" | Shows weather panel |
| "Map of Paris" | Shows holographic map |
| "Play video cats" | Searches YouTube |
| "Search for SpaceX" | Web search results |
| "News about AI" | Headlines panel |
| "Stock AAPL" | Stock price + chart |
| "Translate hello to Spanish" | Translation panel |
| "Convert 100 km to miles" | Unit conversion |
| "Convert 50 USD to EUR" | Currency exchange |
| "World clocks" | 6-timezone grid |
| "Set a timer for 5 minutes" | Countdown timer |
| "Remind me at 5pm to call mom" | Absolute-time reminder |
| "Remember my password is 1234" | Saves to memory |
| "What did I say about passwords" | Recalls memory |
| "Forget everything" | Clears memory |
| "Tell me a joke" | Random joke |
| "Write a Python sort function" | Code generation |
| Anything else | AI chat response |
