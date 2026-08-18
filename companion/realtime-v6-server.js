const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.JARVIS_REALTIME_PORT || 3007);
const CORE_URL = `http://127.0.0.1:${Number(process.env.JARVIS_PORT || 3003)}`;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.JARVIS_MODEL || 'qwen3:4b';
const KEEP_ALIVE = process.env.JARVIS_KEEP_ALIVE || '45m';

function allowedOrigins() {
  const extra = (process.env.JARVIS_WEB_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  return new Set(['https://sribyju.github.io', ...extra]);
}
function originAllowed(origin) {
  return !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || allowedOrigins().has(origin);
}
app.use(cors({ origin(origin, cb) { const ok = originAllowed(origin); cb(ok ? null : new Error('Origin not paired with JARVIS'), ok); } }));
app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => {
  if (req.headers.origin && !originAllowed(req.headers.origin)) return res.status(403).json({ error: 'Origin not paired with JARVIS realtime core' });
  next();
});

function clip(value, n = 5000) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
function cleanText(text) { return String(text || '').replace(/^\s*(?:hey\s+)?jarvis\s*[,.:;\-]?\s*/i, '').trim(); }
function cleanReply(value) {
  let text = String(value || '').trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  text = text.replace(/^\s*(?:okay[, .-]*)?(?:let me think|let's see|first i need to|i should check)[\s\S]*?(?=\n\n|$)/i, '').trim();
  const banned = /\b(?:the user|user is asking|user wants|user said|let me think|first i need to|i should check|looking at the hud|tools section|function called|chain of thought|my reasoning)\b/i;
  if (banned.test(text)) text = text.split(/(?<=[.!?])\s+/).filter(s => !banned.test(s)).join(' ').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!text) return 'I’m here, sir.';
  if (text.length > 900) text = `${text.slice(0, 897).replace(/\s+\S*$/, '')}…`;
  return text;
}
function subjectFrom(text) {
  const t = String(text || '').toLowerCase();
  for (const type of ['map', 'weather', 'system', 'browser', 'media', 'spotify', 'briefing', 'mission', 'integration']) if (t.includes(type)) return type === 'spotify' ? 'media' : type;
  return 'selected';
}
function positionFrom(text) {
  const t = String(text || '').toLowerCase();
  if (/top[ -]?right|upper[ -]?right/.test(t)) return 'top-right';
  if (/top[ -]?left|upper[ -]?left/.test(t)) return 'top-left';
  if (/bottom[ -]?right|lower[ -]?right/.test(t)) return 'bottom-right';
  if (/bottom[ -]?left|lower[ -]?left/.test(t)) return 'bottom-left';
  if (/\bcenter|middle\b/.test(t)) return 'center';
  if (/\bright\b/.test(t)) return 'right';
  if (/\bleft\b/.test(t)) return 'left';
  return null;
}
function mapPlace(text) {
  const patterns = [
    /(?:show|pull|bring|put|open|give)(?:\s+me)?\s+(?:up\s+)?(?:a\s+)?map\s+(?:of|for)\s+(.+)/i,
    /(?:map|location)\s+(?:of|for)\s+(.+)/i,
    /(?:show|pull|bring)\s+(.+?)\s+(?:on|in)\s+(?:the\s+)?map/i,
  ];
  for (const p of patterns) {
    const m = String(text || '').match(p);
    if (m?.[1]) return m[1].replace(/[?.!]+$/, '').trim();
  }
  return null;
}

async function coreAction(name, args = {}) {
  try {
    const r = await fetch(`${CORE_URL}/v1/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, args }), signal: AbortSignal.timeout(12000),
    });
    const data = await r.json().catch(() => ({}));
    return r.ok ? data : { ok: false, error: data.error || `Core HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}

function instantCommand(input) {
  const text = cleanText(input), t = text.toLowerCase();
  if (!t) return { reply: 'Ready, sir.', model: 'instant/v6' };
  if (/^(?:stop talking|stop speaking|be quiet|mute|quiet|shut up|stop)$/.test(t)) return { reply: '', clientAction: 'stop-speaking', model: 'instant/v6' };
  if (/^(?:hi|hey|hello|yo|sup|what's up|whats up)[?.!\s]*$/.test(t)) return { reply: 'I’m here, sir. What’s up?', model: 'instant/v6' };
  if (/^(?:thanks|thank you|appreciate it|ty)[?.!\s]*$/.test(t)) return { reply: 'Anytime, sir.', model: 'instant/v6' };
  if (/\b(?:what(?:'s| is) the time|what time is it|current time|time right now)\b/.test(t)) return { reply: `It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`, model: 'instant/v6' };
  if (/\b(?:what(?:'s| is) the date|what day is it|current date|today's date)\b/.test(t)) return { reply: `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`, model: 'instant/v6' };
  if (/^(?:what can you do|what are you capable of|capabilities)[?.!\s]*$/.test(t)) return { reply: 'I can talk naturally, control your HUD, open apps, browse with your dedicated profile, work with files, run local agents, control Spotify, handle maps and weather, remember context, and use your connected services.', model: 'instant/v6' };

  if (/\b(?:clear|wipe|get rid of|remove|close)\b.*\b(?:everything|all panels|the hud|the screen|all of this)\b/.test(t)) return { reply: 'Cleared.', model: 'instant/v6', hudActions: [{ action: 'clear' }] };
  if (/\b(?:save|remember)\b.*\b(?:layout|workspace|hud|setup)\b/.test(t)) return { reply: 'Saved.', model: 'instant/v6', hudActions: [{ action: 'save' }] };
  if (/\b(?:restore|load|bring back)\b.*\b(?:layout|workspace|hud|setup)\b/.test(t)) return { reply: 'Restored.', model: 'instant/v6', hudActions: [{ action: 'restore' }] };

  const target = subjectFrom(t), position = positionFrom(t);
  if (/\b(?:full[ -]?screen|whole screen|maximi[sz]e|fill the screen|take (?:up )?the (?:whole )?screen)\b/.test(t)) return { reply: 'Done.', model: 'instant/v6', hudActions: [{ action: 'resize', target, position: 'full' }] };
  if (position && /\b(?:move|put|place|shift|send)\b/.test(t)) return { reply: 'Done.', model: 'instant/v6', hudActions: [{ action: 'move', target, position }] };
  if (/\b(?:make|resize)\b.*\b(?:bigger|larger|wider)\b|\b(?:bigger|larger)\b.*\b(?:that|it|map|panel)\b/.test(t)) return { reply: 'Done.', model: 'instant/v6', hudActions: [{ action: 'resize', target, scale: 1.22 }] };
  if (/\b(?:make|resize)\b.*\b(?:smaller|compact)\b|\bsmaller\b.*\b(?:that|it|map|panel)\b/.test(t)) return { reply: 'Done.', model: 'instant/v6', hudActions: [{ action: 'resize', target, scale: .82 }] };
  if (/\bzoom\s+in\b/.test(t)) return { reply: '', model: 'instant/v6', hudActions: [{ action: 'map-command', target: target === 'selected' ? 'map' : target, command: 'zoom-in' }] };
  if (/\bzoom\s+out\b/.test(t)) return { reply: '', model: 'instant/v6', hudActions: [{ action: 'map-command', target: target === 'selected' ? 'map' : target, command: 'zoom-out' }] };
  if (/\b(?:close|remove|get rid of|hide)\b/.test(t) && /\b(?:that|it|map|panel|weather|browser|briefing)\b/.test(t)) return { reply: 'Done.', model: 'instant/v6', hudActions: [{ action: 'remove', target }] };

  const place = mapPlace(text);
  if (place) return { reply: `Pulling up ${place}.`, model: 'instant/v6', hudActions: [{ action: 'show', panelType: 'map', title: `GEO // ${place.toUpperCase()}`, query: place, position: 'center', singleton: true }] };

  if (/^(?:system status|system info|diagnostics|how(?:'s| is) my (?:computer|pc|system))/.test(t)) return { coreTool: { name: 'system_info', args: {} }, model: 'instant/v6' };
  const weather = text.match(/(?:weather|temperature|forecast).*?(?:in|for|at)\s+(.+)/i);
  if (weather?.[1]) return { coreTool: { name: 'weather', args: { location: weather[1].replace(/[?.!]+$/, '') } }, model: 'instant/v6' };
  if (/\b(?:brief me|what did i miss|catch me up|how(?:'s| is) everything doing)\b/.test(t)) return { coreTool: { name: 'briefing', args: {} }, model: 'instant/v6' };

  const spotifyPlay = text.match(/(?:play|put on)\s+(.+?)(?:\s+on spotify)?[?.!]*$/i);
  if (spotifyPlay && /\b(?:spotify|play|put on)\b/i.test(text)) return { coreTool: { name: 'spotify', args: { action: 'play', query: spotifyPlay[1].replace(/\s+on spotify$/i, '').trim() } }, model: 'instant/v6' };
  if (/\b(?:pause|stop)\b.*\bspotify\b|^pause music$/i.test(t)) return { coreTool: { name: 'spotify', args: { action: 'pause' } }, model: 'instant/v6' };
  if (/\b(?:next|skip)\b.*\b(?:song|track|spotify)?\b/i.test(t)) return { coreTool: { name: 'spotify', args: { action: 'next' } }, model: 'instant/v6' };
  if (/\bprevious\b.*\b(?:song|track|spotify)?\b/i.test(t)) return { coreTool: { name: 'spotify', args: { action: 'previous' } }, model: 'instant/v6' };

  const openApp = text.match(/^open\s+(chrome|google chrome|spotify|notepad|calculator|discord|steam|explorer|file explorer|visual studio code|vscode)(?:\s+please)?[?.!]*$/i);
  if (openApp) return { coreTool: { name: 'open_app', args: { app: openApp[1] } }, model: 'instant/v6' };
  const urlMatch = text.match(/\bhttps?:\/\/[^\s]+/i);
  if (urlMatch && /\b(?:open|go to|launch)\b/i.test(text)) return { coreTool: { name: 'open_url', args: { url: urlMatch[0] } }, model: 'instant/v6' };

  return null;
}

const HUD_TOOL = {
  type: 'function', function: { name: 'hud', description: 'Manipulate the visible JARVIS HUD. Use this silently instead of describing UI actions.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['show', 'move', 'resize', 'remove', 'clear', 'save', 'restore', 'map-command'] }, target: { type: 'string' }, panelType: { type: 'string' }, title: { type: 'string' }, query: { type: 'string' }, position: { type: 'string' }, scale: { type: 'number' }, command: { type: 'string' }, data: { type: 'object' } }, required: ['action'] } }
};
const CORE_TOOL = {
  type: 'function', function: { name: 'core_tool', description: 'Use a live local capability instead of guessing.', parameters: { type: 'object', properties: { name: { type: 'string', enum: ['weather', 'system_info', 'open_app', 'open_url', 'browser', 'spotify', 'briefing', 'list_files', 'read_file', 'write_file', 'remember', 'recall', 'delegate', 'background_task', 'mcp'] }, args: { type: 'object' } }, required: ['name'] } }
};

function sceneText(scene) {
  const items = Array.isArray(scene?.panels) ? scene.panels : [];
  if (!items.length) return 'Visible HUD: no active tool panels.';
  return `Visible HUD: ${items.map(p => `${p.id}:${p.panelType}${p.query ? `(${p.query})` : ''}`).join(', ')}. Selected: ${scene?.selectedId || 'none'}.`;
}

async function callOllama(messages, scene) {
  const system = `You are J.A.R.V.I.S., a fast, highly capable local personal AI. Speak directly and naturally to the person in front of you. You understand fragments, corrections, pronouns, and conversational follow-ups.\n\n${sceneText(scene)}\n\nNON-NEGOTIABLE RULES:\n- Never call the person "the user".\n- Never expose or narrate reasoning, hidden analysis, planning, chain-of-thought, tool selection, or internal state.\n- Never say "let me think", "first I need to", "I should check", or similar internal narration.\n- Never print tool JSON. Use tools silently.\n- For live facts or actions, use core_tool rather than guessing.\n- For visible UI changes, use hud.\n- Resolve "that", "it", and "this" from the visible selected/recent panel.\n- Do not create duplicate panels when the person asked to modify an existing one.\n- Never say an action succeeded when a tool failed.\n- Default to one or two concise spoken sentences unless more detail was explicitly requested.\n- You may say "sir" naturally, but not in every sentence.\n- Sound competent and human, not robotic or verbose.`;
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'system', content: system }, ...messages.slice(-8)],
      tools: [HUD_TOOL, CORE_TOOL],
      think: false,
      stream: false,
      keep_alive: KEEP_ALIVE,
      options: { temperature: .16, num_ctx: 4096, num_predict: 180, repeat_penalty: 1.08 },
    }),
    signal: AbortSignal.timeout(14000),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  return response.json();
}

function leakedToolCall(content) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { const x = JSON.parse(text); if (x?.name && (x.arguments || x.args)) return { name: x.name, args: x.arguments || x.args }; } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { const x = JSON.parse(m[0]); if (x?.name && (x.arguments || x.args)) return { name: x.name, args: x.arguments || x.args }; } catch {} }
  return null;
}

async function runConversation(text, history, scene) {
  const messages = (history || []).slice(-7).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') }));
  if (!messages.length || messages[messages.length - 1].content !== text) messages.push({ role: 'user', content: text });
  const hudActions = [];
  for (let step = 0; step < 3; step++) {
    const response = await callOllama(messages, scene);
    const msg = response.message || {};
    let calls = msg.tool_calls || [];
    if (!calls.length) {
      const leak = leakedToolCall(msg.content);
      if (leak) calls = [{ function: { name: leak.name, arguments: leak.args } }];
    }
    if (!calls.length) return { reply: cleanReply(msg.content || 'Done.'), model: `local/${response.model || MODEL}`, hudActions };
    messages.push(msg);
    for (const call of calls) {
      const name = call.function?.name;
      let args = call.function?.arguments || {};
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
      let result;
      if (name === 'hud') {
        const action = { ...args };
        if (action.action === 'show') action.singleton = action.singleton ?? ['map', 'weather', 'system', 'media', 'briefing'].includes(action.panelType);
        hudActions.push(action);
        result = { ok: true, applied: true };
      } else if (name === 'core_tool') {
        result = await coreAction(args.name, args.args || {});
        if (result.hudActions) hudActions.push(...result.hudActions);
      } else result = { ok: false, error: 'Unknown local tool' };
      messages.push({ role: 'tool', tool_name: name, content: clip(result, 1800) });
    }
  }
  return { reply: 'Done.', model: `local/${MODEL}`, hudActions };
}

function summarizeCoreResult(name, result) {
  if (result?.ok === false) return result.error || 'That local tool is unavailable.';
  const d = result?.data || result || {};
  if (name === 'system_info') {
    const pct = d.memoryUsagePercent ?? d.data?.memoryUsagePercent;
    return pct != null ? `System is online. Memory usage is ${pct}%.` : 'System status is up.';
  }
  if (name === 'weather') {
    const loc = d.location || d.data?.location || {};
    const c = d.current || d.data?.current || {};
    return c.temperature_2m != null ? `${loc.name || 'There'} is ${Math.round(c.temperature_2m)}°F right now.` : 'Weather is up.';
  }
  if (name === 'briefing') return 'Briefing ready.';
  if (name === 'spotify') return 'Done.';
  if (name === 'open_app' || name === 'open_url') return 'Opened.';
  return 'Done.';
}

async function geocodeOpenMeteo(query) {
  const clean = query.replace(/\s+/g, ' ').trim();
  const stateMatch = clean.match(/^(.*?)(?:,|\s+)\s*(Virginia|VA|California|CA|New York|NY|Texas|TX|Florida|FL|North Carolina|NC|South Carolina|SC|Maryland|MD|Washington|WA|DC)$/i);
  const candidates = [clean];
  if (stateMatch) candidates.push(`${stateMatch[1]}, ${stateMatch[2]}`, stateMatch[1]);
  for (const candidate of [...new Set(candidates)]) {
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(candidate)}&count=10&language=en&format=json`, { signal: AbortSignal.timeout(3000) });
      const d = await r.json();
      const rows = d.results || [];
      if (!rows.length) continue;
      const state = stateMatch?.[2]?.replace(/^VA$/i, 'Virginia').replace(/^CA$/i, 'California').replace(/^NY$/i, 'New York').replace(/^TX$/i, 'Texas').replace(/^FL$/i, 'Florida');
      const x = state ? rows.find(v => String(v.admin1 || '').toLowerCase().includes(state.toLowerCase())) || rows[0] : rows[0];
      return { name: x.name, country: x.country, admin1: x.admin1, latitude: x.latitude, longitude: x.longitude, timezone: x.timezone };
    } catch {}
  }
  return null;
}
async function geocodeNominatim(query) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`, { headers: { 'User-Agent': 'JARVIS-Local/6.0' }, signal: AbortSignal.timeout(3500) });
    const rows = await r.json();
    const x = rows?.[0];
    if (!x) return null;
    return { name: x.name || String(x.display_name || query).split(',')[0], country: '', admin1: '', latitude: Number(x.lat), longitude: Number(x.lon), timezone: '' };
  } catch { return null; }
}

app.get('/health', async (_req, res) => {
  let ollama = false;
  try { ollama = (await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(850) })).ok; } catch {}
  res.json({ ok: true, name: 'JARVIS Realtime', version: '6.0.0', ollama, model: MODEL, keepAlive: KEEP_ALIVE });
});

app.get('/v1/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: 'q is required' });
  const loc = await geocodeOpenMeteo(q) || await geocodeNominatim(q);
  if (!loc) return res.status(404).json({ ok: false, error: `Could not locate ${q}` });
  res.json({ ok: true, location: loc });
});

app.post('/v1/command', async (req, res) => {
  const started = Date.now();
  const text = String(req.body?.message || req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'message is required' });
  try {
    const instant = instantCommand(text);
    if (instant?.coreTool) {
      const result = await coreAction(instant.coreTool.name, instant.coreTool.args);
      return res.json({ reply: summarizeCoreResult(instant.coreTool.name, result), model: instant.model, hudActions: result.hudActions || [], clientAction: instant.clientAction, latencyMs: Date.now() - started });
    }
    if (instant) return res.json({ ...instant, latencyMs: Date.now() - started });
    const result = await runConversation(text, req.body?.messages || [], req.body?.scene || {});
    res.json({ ...result, reply: cleanReply(result.reply), latencyMs: Date.now() - started });
  } catch (e) {
    res.status(503).json({ error: e.message, reply: 'I hit a local error instead of making you wait, sir.', model: 'local/error', latencyMs: Date.now() - started });
  }
});

app.listen(PORT, '127.0.0.1', async () => {
  console.log(`JARVIS Realtime v6 online at http://127.0.0.1:${PORT}`);
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: '', stream: false, think: false, keep_alive: KEEP_ALIVE }),
      signal: AbortSignal.timeout(30000),
    });
    console.log(`JARVIS Realtime model warm: ${MODEL}`);
  } catch (e) { console.log(`JARVIS Realtime model warm-up skipped: ${e.message}`); }
});
