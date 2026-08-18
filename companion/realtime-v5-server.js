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
app.use(express.json({ limit: '8mb' }));
app.use((req, res, next) => {
  if (req.headers.origin && !originAllowed(req.headers.origin)) return res.status(403).json({ error: 'Origin not paired with JARVIS realtime core' });
  next();
});

function clip(value, n = 5000) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > n ? s.slice(0, n) + '…' : s;
}
function cleanText(text) {
  return String(text || '').replace(/^\s*(?:hey\s+)?jarvis\s*[,.:;-]?\s*/i, '').trim();
}
function subjectFrom(text) {
  const t = text.toLowerCase();
  for (const type of ['map', 'weather', 'system', 'browser', 'media', 'spotify', 'briefing', 'mission', 'integration']) if (t.includes(type)) return type === 'spotify' ? 'media' : type;
  return 'selected';
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
function conversationalCleanup(text) {
  let s = String(text || '').trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  s = s.replace(/^\s*(?:okay[, .-]*)?(?:let me think|let's see|i need to|first,? i need to|the user(?: is| wants| asked| said)?)[\s\S]*?(?=(?:\n\n|$))/i, '').trim();
  const bad = /\b(?:the user|user is asking|user wants|let me think|first i need to|i should check|looking at the hud scene|the tools section|function called)\b/i;
  if (bad.test(s)) {
    const sentences = s.split(/(?<=[.!?])\s+/).filter(x => !bad.test(x));
    s = sentences.join(' ').trim();
  }
  if (!s) return 'I’m here, sir.';
  if (s.length > 700) s = s.slice(0, 697).replace(/\s+\S*$/, '') + '…';
  return s;
}

async function coreAction(name, args = {}) {
  try {
    const r = await fetch(`${CORE_URL}/v1/action`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, args }), signal: AbortSignal.timeout(12000),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok ? d : { ok: false, error: d.error || `Core HTTP ${r.status}` };
  } catch (e) { return { ok: false, error: e.message }; }
}

function instantCommand(input) {
  const text = cleanText(input), t = text.toLowerCase();
  if (!t) return null;
  if (/^(?:stop talking|stop speaking|be quiet|mute|shut up|quiet|stop)$/.test(t)) return { reply: '', clientAction: 'stop-speaking', model: 'instant/v5' };
  if (/\b(?:what(?:'s| is) the time|what time is it|current time|time right now)\b/.test(t)) return { reply: `It's ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`, model: 'instant/v5' };
  if (/\b(?:what(?:'s| is) the date|what day is it|current date|today's date)\b/.test(t)) return { reply: `Today is ${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.`, model: 'instant/v5' };
  if (/\b(?:clear|wipe|get rid of|remove|close)\b.*\b(?:everything|all panels|the hud|the screen|all of this)\b/.test(t)) return { reply: 'Cleared.', model: 'instant/v5', hudActions: [{ action: 'clear' }] };
  if (/\b(?:save|remember)\b.*\b(?:layout|workspace|hud|setup)\b/.test(t)) return { reply: 'Saved.', model: 'instant/v5', hudActions: [{ action: 'save' }] };
  if (/\b(?:restore|load|bring back)\b.*\b(?:layout|workspace|hud|setup)\b/.test(t)) return { reply: 'Restored.', model: 'instant/v5', hudActions: [{ action: 'restore' }] };

  const target = subjectFrom(t), position = positionFrom(t);
  if (/\b(?:full[ -]?screen|whole screen|maximi[sz]e|fill the screen|take (?:up )?the (?:whole )?screen)\b/.test(t)) return { reply: 'Done.', model: 'instant/v5', hudActions: [{ action: 'resize', target, position: 'full' }] };
  if (position && /\b(?:move|put|place|throw|shift|send)\b/.test(t)) return { reply: 'Done.', model: 'instant/v5', hudActions: [{ action: 'move', target, position }] };
  if (/\b(?:make|resize)\b.*\b(?:bigger|larger|wider)\b|\b(?:bigger|larger)\b.*\b(?:that|it|map|panel)\b/.test(t)) return { reply: 'Done.', model: 'instant/v5', hudActions: [{ action: 'resize', target, scale: 1.28 }] };
  if (/\b(?:make|resize)\b.*\b(?:smaller|compact)\b|\bsmaller\b.*\b(?:that|it|map|panel)\b/.test(t)) return { reply: 'Done.', model: 'instant/v5', hudActions: [{ action: 'resize', target, scale: 0.78 }] };
  if (/\bzoom\s+in\b/.test(t)) return { reply: '', model: 'instant/v5', hudActions: [{ action: 'map-command', target: target === 'selected' ? 'map' : target, command: 'zoom-in' }] };
  if (/\bzoom\s+out\b/.test(t)) return { reply: '', model: 'instant/v5', hudActions: [{ action: 'map-command', target: target === 'selected' ? 'map' : target, command: 'zoom-out' }] };
  if (/\b(?:close|remove|get rid of|hide)\b/.test(t) && /\b(?:that|it|map|panel|weather|browser|briefing)\b/.test(t)) return { reply: 'Done.', model: 'instant/v5', hudActions: [{ action: 'remove', target }] };

  const place = mapPlace(text);
  if (place) return { reply: `Pulling up ${place}.`, model: 'instant/v5', hudActions: [{ action: 'show', panelType: 'map', title: `GEO // ${place.toUpperCase()}`, query: place, position: 'center', singleton: true }] };
  if (/^(?:system status|system info|diagnostics|how(?:'s| is) my (?:computer|pc|system))/.test(t)) return { coreTool: { name: 'system_info', args: {} }, model: 'instant/v5' };
  const weather = text.match(/(?:weather|temperature|forecast).*?(?:in|for|at)\s+(.+)/i);
  if (weather?.[1]) return { coreTool: { name: 'weather', args: { location: weather[1].replace(/[?.!]+$/, '') } }, model: 'instant/v5' };
  if (/\b(?:brief me|what did i miss|catch me up|how(?:'s| is) everything doing)\b/.test(t)) return { coreTool: { name: 'briefing', args: {} }, model: 'instant/v5' };
  return null;
}

const HUD_TOOL = {
  type: 'function', function: { name: 'hud', description: 'Manipulate the live HUD. Use this instead of describing an action.', parameters: { type: 'object', properties: { action: { type: 'string', enum: ['show', 'move', 'resize', 'remove', 'clear', 'save', 'restore', 'map-command'] }, target: { type: 'string' }, panelType: { type: 'string' }, title: { type: 'string' }, query: { type: 'string' }, position: { type: 'string' }, scale: { type: 'number' }, command: { type: 'string' }, data: { type: 'object' } }, required: ['action'] } }
};
const CORE_TOOL = {
  type: 'function', function: { name: 'core_tool', description: 'Use a live JARVIS capability.', parameters: { type: 'object', properties: { name: { type: 'string', enum: ['weather', 'system_info', 'open_app', 'open_url', 'browser', 'spotify', 'briefing', 'list_files', 'read_file', 'write_file', 'remember', 'recall', 'delegate', 'background_task', 'mcp'] }, args: { type: 'object' } }, required: ['name'] } }
};

function sceneText(scene) {
  const items = Array.isArray(scene?.panels) ? scene.panels : [];
  if (!items.length) return 'HUD scene is empty.';
  return `HUD scene: ${items.map(p => `${p.id}:${p.panelType}${p.query ? `(${p.query})` : ''}`).join(', ')}. Selected: ${scene?.selectedId || 'none'}.`;
}

async function callOllama(messages, scene, deep = false) {
  const system = `You are J.A.R.V.I.S., speaking directly to the person in front of you. You are a calm, extremely capable personal AI. Natural conversation matters more than command syntax.\n\n${sceneText(scene)}\n\nSTRICT OUTPUT RULES:\n- Speak directly to the person. Never call them "the user".\n- Never narrate your reasoning, planning, chain of thought, tool-selection process, or internal state.\n- Never say "let me think", "first I need to", "I should check", "looking at the HUD scene", or similar analysis.\n- Never print tool JSON. Use tools silently.\n- For HUD changes, call hud and then reply in one short natural sentence.\n- Resolve "that", "it", and "this" from the selected/recent HUD panel.\n- Never create a duplicate panel when modifying an existing one.\n- Use core_tool for live actions/data.\n- Never claim something worked if a tool failed.\n- Default reply length: one or two concise spoken sentences.\n- Address the person as "sir" occasionally, not every sentence.`;
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, ...messages.slice(-6)], tools: [HUD_TOOL, CORE_TOOL], think: false, stream: false, keep_alive: KEEP_ALIVE, options: { temperature: 0.08, num_ctx: 4096, num_predict: deep ? 240 : 120 } }),
    signal: AbortSignal.timeout(deep ? 35000 : 12000),
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
  return r.json();
}

function leakedToolCall(content) {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { const x = JSON.parse(text); if (x?.name && (x.arguments || x.args)) return { name: x.name, args: x.arguments || x.args }; } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { const x = JSON.parse(m[0]); if (x?.name && (x.arguments || x.args)) return { name: x.name, args: x.arguments || x.args }; } catch {} }
  return null;
}

async function runConversation(text, history, scene) {
  const messages = (history || []).slice(-4).map(m => ({ role: m.role, content: String(m.content || '') }));
  if (!messages.length || messages[messages.length - 1].content !== text) messages.push({ role: 'user', content: text });
  const hudActions = [], trace = [];
  for (let step = 0; step < 3; step++) {
    const response = await callOllama(messages, scene, false);
    const msg = response.message || {};
    let calls = msg.tool_calls || [];
    if (!calls.length) {
      const leak = leakedToolCall(msg.content);
      if (leak) calls = [{ function: { name: leak.name, arguments: leak.args } }];
    }
    if (!calls.length) return { reply: conversationalCleanup(msg.content || 'Done.'), model: `realtime/${response.model || MODEL}`, hudActions, trace };
    messages.push(msg);
    for (const call of calls) {
      const name = call.function?.name;
      let args = call.function?.arguments || {};
      if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
      let result;
      if (name === 'hud') {
        const action = { ...args };
        if (action.action === 'show') action.singleton = action.singleton ?? ['map', 'weather', 'system', 'media', 'briefing'].includes(action.panelType);
        hudActions.push(action); result = { ok: true };
      } else if (name === 'core_tool') {
        result = await coreAction(args.name, args.args || {});
        if (result.hudActions) hudActions.push(...result.hudActions);
      } else result = { ok: false, error: 'Unknown tool' };
      trace.push({ name, ok: result.ok !== false });
      messages.push({ role: 'tool', tool_name: name, content: clip(result, 1600) });
    }
  }
  return { reply: 'Done.', model: `realtime/${MODEL}`, hudActions, trace };
}

async function geocodeCandidates(q) {
  const clean = q.replace(/\s+/g, ' ').trim();
  const pieces = clean.split(/,|\s+(?=(?:Virginia|VA|California|CA|New York|NY|Texas|TX|Florida|FL|North Carolina|NC|South Carolina|SC|Maryland|MD|DC)\b)/i).map(x => x.trim()).filter(Boolean);
  const candidates = [clean];
  if (pieces.length > 1) candidates.push(`${pieces[0]}, ${pieces.slice(1).join(' ')}`, pieces[0]);
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate.toLowerCase())) continue;
    seen.add(candidate.toLowerCase());
    try {
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(candidate)}&count=10&language=en&format=json`, { signal: AbortSignal.timeout(3200) });
      const d = await r.json();
      const rows = d.results || [];
      if (!rows.length) continue;
      const stateHint = pieces.slice(1).join(' ').toLowerCase();
      const x = stateHint ? rows.find(v => `${v.admin1 || ''} ${v.country || ''}`.toLowerCase().includes(stateHint.replace(/^va$/, 'virginia'))) || rows[0] : rows[0];
      return { name: x.name, country: x.country, admin1: x.admin1, latitude: x.latitude, longitude: x.longitude, timezone: x.timezone };
    } catch {}
  }
  return null;
}

app.get('/health', async (_req, res) => {
  let ollama = false;
  try { ollama = (await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(900) })).ok; } catch {}
  res.json({ ok: true, name: 'JARVIS Realtime', version: '5.0.0', ollama, model: MODEL, keepAlive: KEEP_ALIVE });
});

app.get('/v1/geocode', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ ok: false, error: 'q is required' });
  const loc = await geocodeCandidates(q);
  if (!loc) return res.status(404).json({ ok: false, error: `I couldn't locate ${q}.` });
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
      const reply = result.ok === false ? (result.error || 'That tool is unavailable.') : instant.coreTool.name === 'system_info' ? 'System status is up.' : instant.coreTool.name === 'weather' ? 'Weather is up.' : instant.coreTool.name === 'briefing' ? 'Briefing ready.' : 'Done.';
      return res.json({ reply, model: instant.model, hudActions: result.hudActions || [], clientAction: instant.clientAction, latencyMs: Date.now() - started });
    }
    if (instant) return res.json({ ...instant, latencyMs: Date.now() - started });
    const result = await runConversation(text, req.body?.messages || [], req.body?.scene || {});
    res.json({ ...result, reply: conversationalCleanup(result.reply), latencyMs: Date.now() - started });
  } catch (e) {
    res.status(503).json({ error: e.message, reply: 'I hit a local error instead of making you wait, sir.', latencyMs: Date.now() - started });
  }
});

app.listen(PORT, '127.0.0.1', async () => {
  console.log(`JARVIS Realtime v5 online at http://127.0.0.1:${PORT}`);
  try {
    await fetch(`${OLLAMA_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, prompt: '', stream: false, think: false, keep_alive: KEEP_ALIVE }), signal: AbortSignal.timeout(30000) });
    console.log(`JARVIS Realtime model warm: ${MODEL}`);
  } catch (e) { console.log(`JARVIS Realtime model warm-up skipped: ${e.message}`); }
});
