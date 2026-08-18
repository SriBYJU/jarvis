const express = require('express');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.JARVIS_REALTIME_PORT || 3007);
const CORE_URL = `http://127.0.0.1:${Number(process.env.JARVIS_PORT || 3003)}`;
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const MODEL = process.env.JARVIS_MODEL || 'qwen3:4b';
const KEEP_ALIVE = process.env.JARVIS_KEEP_ALIVE || '30m';

function allowedOrigins() {
  const extra = (process.env.JARVIS_WEB_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  return new Set(['https://sribyju.github.io', ...extra]);
}
function originAllowed(origin) {
  return !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || allowedOrigins().has(origin);
}
app.use(cors({ origin(origin, cb) { const ok = originAllowed(origin); cb(ok ? null : new Error('Origin not paired with JARVIS'), ok); } }));
app.use(express.json({ limit: '6mb' }));
app.use((req, res, next) => {
  if (req.headers.origin && !originAllowed(req.headers.origin)) return res.status(403).json({ error: 'Origin not paired with JARVIS realtime core' });
  next();
});

function clip(value, n = 6000) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function cleanText(text) {
  return String(text || '').replace(/^\s*(?:hey\s+)?jarvis\s*[,.:;-]?\s*/i, '').trim();
}
function positionFrom(text) {
  const t = text.toLowerCase();
  if (/top[ -]?right|upper[ -]?right/.test(t)) return 'top-right';
  if (/top[ -]?left|upper[ -]?left/.test(t)) return 'top-left';
  if (/bottom[ -]?right|lower[ -]?right/.test(t)) return 'bottom-right';
  if (/bottom[ -]?left|lower[ -]?left/.test(t)) return 'bottom-left';
  if (/\bcenter|middle\b/.test(t)) return 'center';
  if (/\bright\b/.test(t)) return 'right';
  if (/\bleft\b/.test(t)) return 'left';
  return null;
}
function subjectFrom(text) {
  const t = text.toLowerCase();
  for (const type of ['map', 'weather', 'system', 'browser', 'media', 'spotify', 'briefing', 'mission', 'integration']) {
    if (t.includes(type)) return type === 'spotify' ? 'media' : type;
  }
  return 'selected';
}
function mapPlace(text) {
  const patterns = [
    /(?:show|pull|bring|throw|put|open|give)(?:\s+me)?\s+(?:up\s+)?(?:a\s+)?map\s+(?:of|for)\s+(.+)/i,
    /(?:map|location)\s+(?:of|for)\s+(.+)/i,
    /(?:show|pull|bring)\s+(.+?)\s+(?:on|in)\s+(?:the\s+)?map/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m?.[1]) return m[1].replace(/[?.!]+$/, '').trim();
  }
  return null;
}
function instantCommand(input) {
  const text = cleanText(input);
  const t = text.toLowerCase();
  if (!t) return null;

  if (/^(?:stop talking|stop speaking|be quiet|mute|shut up|quiet)$/.test(t)) {
    return { reply: '', clientAction: 'stop-speaking', model: 'instant/realtime' };
  }
  if (/\b(?:what(?:'s| is) the time|what time is it|current time|time right now)\b/.test(t)) {
    return { reply: `It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`, model: 'instant/realtime' };
  }
  if (/\b(?:what(?:'s| is) the date|what day is it|today(?:'s| is the) date|current date)\b/.test(t)) {
    return { reply: `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`, model: 'instant/realtime' };
  }
  if (/\b(?:clear|wipe|get rid of|remove|close)\b.*\b(?:everything|all panels|the hud|the screen|all of this)\b/.test(t)) {
    return { reply: 'Cleared.', model: 'instant/realtime', hudActions: [{ action: 'clear' }] };
  }
  if (/\b(?:save|remember)\b.*\b(?:layout|workspace|hud|setup)\b/.test(t)) {
    return { reply: 'Workspace saved.', model: 'instant/realtime', hudActions: [{ action: 'save' }] };
  }
  if (/\b(?:restore|load|bring back)\b.*\b(?:layout|workspace|hud|setup)\b/.test(t)) {
    return { reply: 'Workspace restored.', model: 'instant/realtime', hudActions: [{ action: 'restore' }] };
  }

  const target = subjectFrom(t);
  const position = positionFrom(t);
  if (/\b(?:full[ -]?screen|whole screen|maximi[sz]e|fill the screen|take (?:up )?the (?:whole )?screen)\b/.test(t)) {
    return { reply: 'Done.', model: 'instant/realtime', hudActions: [{ action: 'resize', target, position: 'full' }] };
  }
  if (position && /\b(?:move|put|place|throw|shift|send)\b/.test(t)) {
    return { reply: 'Moved.', model: 'instant/realtime', hudActions: [{ action: 'move', target, position }] };
  }
  if (/\b(?:make|resize)\b.*\b(?:bigger|larger|wider)\b|\b(?:bigger|larger)\b.*\b(?:that|it|map|panel)\b/.test(t)) {
    return { reply: 'Done.', model: 'instant/realtime', hudActions: [{ action: 'resize', target, scale: 1.28 }] };
  }
  if (/\b(?:make|resize)\b.*\b(?:smaller|compact)\b|\bsmaller\b.*\b(?:that|it|map|panel)\b/.test(t)) {
    return { reply: 'Done.', model: 'instant/realtime', hudActions: [{ action: 'resize', target, scale: 0.78 }] };
  }
  if (/\bzoom\s+in\b/.test(t)) {
    return { reply: '', model: 'instant/realtime', hudActions: [{ action: 'map-command', target: target === 'selected' ? 'map' : target, command: 'zoom-in' }] };
  }
  if (/\bzoom\s+out\b/.test(t)) {
    return { reply: '', model: 'instant/realtime', hudActions: [{ action: 'map-command', target: target === 'selected' ? 'map' : target, command: 'zoom-out' }] };
  }
  if (/\b(?:close|remove|get rid of|hide)\b/.test(t) && /\b(?:that|it|map|panel|weather|browser|briefing)\b/.test(t)) {
    return { reply: 'Removed.', model: 'instant/realtime', hudActions: [{ action: 'remove', target }] };
  }

  const place = mapPlace(text);
  if (place) {
    return {
      reply: `Pulling up ${place}.`,
      model: 'instant/realtime',
      hudActions: [{ action: 'show', panelType: 'map', title: `GEO // ${place.toUpperCase()}`, query: place, position: 'center', singleton: true }],
    };
  }

  if (/^(?:system status|system info|diagnostics|how(?:'s| is) my (?:computer|pc|system))/.test(t)) {
    return { coreTool: { name: 'system_info', args: {} }, model: 'instant/realtime' };
  }
  const weather = text.match(/(?:weather|temperature|forecast).*?(?:in|for|at)\s+(.+)/i);
  if (weather?.[1]) {
    return { coreTool: { name: 'weather', args: { location: weather[1].replace(/[?.!]+$/, '') } }, model: 'instant/realtime' };
  }
  if (/\b(?:brief me|what did i miss|catch me up|how(?:'s| is) everything doing)\b/.test(t)) {
    return { coreTool: { name: 'briefing', args: {} }, model: 'instant/realtime' };
  }
  return null;
}

const HUD_TOOL = {
  type: 'function',
  function: {
    name: 'hud',
    description: 'Manipulate the live JARVIS HUD. Existing panels are referenced semantically using target such as selected, map, weather, browser, media, briefing, system, or mission. Use show only to create or replace content; use move/resize/remove for existing content.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['show', 'move', 'resize', 'remove', 'clear', 'save', 'restore', 'map-command'] },
        target: { type: 'string' }, panelType: { type: 'string' }, title: { type: 'string' }, query: { type: 'string' },
        position: { type: 'string' }, scale: { type: 'number' }, command: { type: 'string' }, data: { type: 'object' },
      },
      required: ['action'],
    },
  },
};
const CORE_TOOL = {
  type: 'function',
  function: {
    name: 'core_tool',
    description: 'Use a JARVIS capability. Prefer this for live data and actions instead of guessing.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', enum: ['weather', 'system_info', 'open_app', 'open_url', 'browser', 'spotify', 'briefing', 'list_files', 'read_file', 'write_file', 'remember', 'recall', 'delegate', 'background_task', 'mcp'] },
        args: { type: 'object' },
      },
      required: ['name'],
    },
  },
};

async function coreAction(name, args = {}) {
  try {
    const r = await fetch(`${CORE_URL}/v1/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, args }), signal: AbortSignal.timeout(30000),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? d : { ok: false, error: d.error || `Core HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}

function sceneText(scene) {
  const items = Array.isArray(scene?.panels) ? scene.panels : [];
  if (!items.length) return 'HUD scene: empty.';
  return `HUD scene (${scene.selectedId ? `selected=${scene.selectedId}` : 'nothing selected'}): ${items.map(p => `${p.id}:${p.panelType}${p.query ? `(${p.query})` : ''}`).join(', ')}.`;
}

async function callOllama(messages, scene, deep = false) {
  const system = `You are J.A.R.V.I.S., a fast local personal AI operating system. Understand normal conversational speech, pronouns, corrections, fragments, and follow-ups. The user must never need command syntax.\n\n${sceneText(scene)}\n\nRules:\n- For HUD manipulation, call hud. Never print a tool call as JSON.\n- If the user says that/it/this, resolve it from the selected or most recent relevant HUD panel.\n- Never create a duplicate panel when the user asked to move, resize, zoom, hide, or modify an existing one.\n- Use core_tool for live system/app/browser/weather/Spotify/files/agents work.\n- Keep spoken replies short.\n- Never claim an action happened unless a tool result confirms it.`;
  const body = {
    model: MODEL,
    messages: [{ role: 'system', content: system }, ...messages.slice(-8)],
    tools: [HUD_TOOL, CORE_TOOL],
    think: deep,
    stream: false,
    keep_alive: KEEP_ALIVE,
    options: { temperature: 0.12, num_ctx: 4096, num_predict: deep ? 320 : 180 },
  };
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(deep ? 60000 : 25000),
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
  return r.json();
}

function leakedToolCall(content) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const x = JSON.parse(text);
    if (x?.name && (x.arguments || x.args)) return { name: x.name, args: x.arguments || x.args };
  } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try { const x = JSON.parse(m[0]); if (x?.name && (x.arguments || x.args)) return { name: x.name, args: x.arguments || x.args }; } catch {}
  }
  return null;
}

async function runConversation(text, history, scene, deep = false) {
  const messages = (history || []).slice(-6).map(m => ({ role: m.role, content: String(m.content || '') }));
  if (!messages.length || messages[messages.length - 1].content !== text) messages.push({ role: 'user', content: text });
  const hudActions = [];
  const trace = [];
  for (let step = 0; step < (deep ? 5 : 3); step++) {
    const response = await callOllama(messages, scene, deep);
    const msg = response.message || {};
    messages.push(msg);
    let calls = msg.tool_calls || [];
    if (!calls.length) {
      const leak = leakedToolCall(msg.content);
      if (leak) calls = [{ function: { name: leak.name, arguments: leak.args } }];
    }
    if (!calls.length) return { reply: String(msg.content || 'Done.'), model: `realtime/${response.model || MODEL}`, hudActions, trace };

    for (const call of calls) {
      const name = call.function?.name;
      let args = call.function?.arguments || {};
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
      let result;
      if (name === 'hud') {
        const action = { ...args };
        if (action.action === 'show') action.singleton = action.singleton ?? ['map', 'weather', 'system', 'media', 'briefing'].includes(action.panelType);
        hudActions.push(action);
        result = { ok: true, executed: action };
      } else if (name === 'core_tool') {
        result = await coreAction(args.name, args.args || {});
        if (result.hudActions) hudActions.push(...result.hudActions);
      } else result = { ok: false, error: `Unknown realtime tool ${name}` };
      trace.push({ name, args, ok: result.ok !== false });
      messages.push({ role: 'tool', tool_name: name, content: clip(result, 2200) });
    }
  }
  return { reply: 'Done.', model: `realtime/${MODEL}`, hudActions, trace };
}

app.get('/health', async (_req, res) => {
  let ollama = false;
  try { const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1200) }); ollama = r.ok; } catch {}
  res.json({ ok: true, name: 'JARVIS Realtime', version: '4.0.0', ollama, model: MODEL, keepAlive: KEEP_ALIVE });
});
app.get('/v1/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: 'q is required' });
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`, { signal: AbortSignal.timeout(4500) });
    const d = await r.json(); const x = d.results?.[0];
    if (!x) return res.status(404).json({ ok: false, error: `Could not locate ${q}` });
    res.json({ ok: true, location: { name: x.name, country: x.country, latitude: x.latitude, longitude: x.longitude, timezone: x.timezone } });
  } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.post('/v1/command', async (req, res) => {
  const started = Date.now();
  const text = String(req.body?.message || req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'message is required' });
  try {
    const instant = instantCommand(text);
    if (instant?.coreTool) {
      const result = await coreAction(instant.coreTool.name, instant.coreTool.args);
      const reply = result.ok === false ? (result.error || 'That tool is unavailable.') : instant.coreTool.name === 'system_info' ? 'System status is up.' : instant.coreTool.name === 'weather' ? 'Weather is up.' : instant.coreTool.name === 'briefing' ? 'Briefing ready.' : 'Done.';
      return res.json({ reply, model: instant.model, hudActions: result.hudActions || [], clientAction: instant.clientAction, latencyMs: Date.now() - started, toolResult: result });
    }
    if (instant) return res.json({ ...instant, latencyMs: Date.now() - started });
    const r = await runConversation(text, req.body?.messages || [], req.body?.scene || {}, req.body?.mode === 'thinking');
    res.json({ ...r, latencyMs: Date.now() - started });
  } catch (e) {
    res.status(503).json({ error: e.message, reply: 'The realtime core hit an error instead of making you wait. Check the local-core window.', latencyMs: Date.now() - started });
  }
});

app.listen(PORT, '127.0.0.1', async () => {
  console.log(`JARVIS Realtime v4 online at http://127.0.0.1:${PORT}`);
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, prompt: '', stream: false, think: false, keep_alive: KEEP_ALIVE }),
      signal: AbortSignal.timeout(60000),
    });
    console.log(`JARVIS Realtime model warm: ${MODEL}`);
  } catch (e) { console.log(`JARVIS Realtime model warm-up skipped: ${e.message}`); }
});
