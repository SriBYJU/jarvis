import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REALTIME = 'http://127.0.0.1:3007';
const CORE = 'http://127.0.0.1:3003';
const WAKE_KEY = 'jarvis.final.wake';
const RATE_KEY = 'jarvis.final.voice-rate';
const LAYOUT_KEY = 'jarvis.final.panel-layout';

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function stripWake(text) { return String(text || '').replace(/^\s*(?:hey\s+)?jarvis\s*[,.:;\-]?\s*/i, '').trim(); }
function parseBody(options) { try { return JSON.parse(options?.body || '{}'); } catch { return {}; } }
function latestMessage(body) {
  if (body?.message) return String(body.message);
  const list = Array.isArray(body?.messages) ? body.messages : [];
  return String(list[list.length - 1]?.content || '');
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function sseResponse(reply, model = 'local/qwen3:4b') {
  const text = String(reply || '');
  const chunks = text.match(/.{1,44}(?:\s|$)/g) || [text];
  return new Response([
    `data: ${JSON.stringify({ meta: { model } })}\n\n`,
    ...chunks.map(token => `data: ${JSON.stringify({ token })}\n\n`),
    'data: [DONE]\n\n',
  ].join(''), { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
function sanitizeReply(value) {
  let text = String(value || '').trim().replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const banned = /\b(?:the user|user is asking|user wants|let me think|let's see|first i need to|i should check|looking at the hud|tools section|function called|chain of thought|my reasoning)\b/i;
  if (banned.test(text)) text = text.split(/(?<=[.!?])\s+/).filter(s => !banned.test(s)).join(' ').trim();
  text = text.replace(/```(?:json)?\s*\{\s*"name"[\s\S]*?```/gi, '').trim();
  if (!text) return 'I’m here, sir.';
  return text.length > 1000 ? `${text.slice(0, 997).replace(/\s+\S*$/, '')}…` : text;
}
function mapPlace(text) {
  for (const p of [
    /(?:show|pull|bring|put|open|give)(?:\s+me)?\s+(?:up\s+)?(?:a\s+)?map\s+(?:of|for)\s+(.+)/i,
    /(?:map|location)\s+(?:of|for)\s+(.+)/i,
    /(?:show|pull|bring)\s+(.+?)\s+(?:on|in)\s+(?:the\s+)?map/i,
  ]) {
    const m = String(text || '').match(p);
    if (m?.[1]) return m[1].replace(/[?.!]+$/, '').trim();
  }
  return null;
}
function subjectFrom(text) {
  const t = String(text || '').toLowerCase();
  for (const type of ['map', 'weather', 'system', 'browser', 'briefing', 'media', 'spotify']) if (t.includes(type)) return type === 'spotify' ? 'media' : type;
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
function legacyToolRequest(text) {
  return /\b(?:youtube|video|stock|ticker|latest news|headlines|web search|search the web|google|browse|wikipedia|wiki|translate|currency|convert|world clock|joke|define|definition|qr code|generate image|create image|gallery|camera|vision|timer|remind|reminder|project|remember|memory|forget|nutrition|calories|protein|brief me|briefing|screen share|spreadsheet|excel|xlsx|powerpoint|pptx|presentation|word doc|docx|csv|run this code|execute code)\b/i.test(String(text || ''));
}
function longLegacyTool(text) {
  return /\b(?:spreadsheet|excel|xlsx|powerpoint|pptx|presentation|word doc|docx|camera|vision|screen share|gallery|generate image|create image)\b/i.test(String(text || ''));
}
function panelKind(panel) {
  if (!panel) return '';
  if (panel.querySelector('.holo-map-wrapper')) return 'map';
  if (panel.classList.contains('system-panel')) return 'system';
  const title = (panel.querySelector('.panel-header span')?.textContent || '').toLowerCase();
  if (title.includes('weather')) return 'weather';
  if (title.includes('briefing')) return 'briefing';
  if (title.includes('browser') || title.includes('page analysis') || title.includes('web search')) return 'browser';
  if (title.includes('spotify') || title.includes('media')) return 'media';
  return title.split(/\s|—/)[0] || 'panel';
}
function visiblePanels() { return Array.from(document.querySelectorAll('.tool-panel')).filter(p => p.style.display !== 'none'); }
function ensurePanelId(panel) {
  if (panel && !panel.dataset.jarvisPanelId) panel.dataset.jarvisPanelId = `panel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return panel?.dataset.jarvisPanelId || null;
}
function markPanel(panel) {
  document.querySelectorAll('.tool-panel.j6-selected').forEach(x => x.classList.remove('j6-selected'));
  if (panel) { ensurePanelId(panel); panel.classList.add('j6-selected'); }
}
function findPanel(target = 'selected') {
  const panels = visiblePanels();
  if (!panels.length) return null;
  const t = String(target || 'selected').toLowerCase();
  const selected = document.querySelector('.tool-panel.j6-selected');
  if (['selected', 'that', 'it', 'this', 'panel'].includes(t)) return selected && selected.style.display !== 'none' ? selected : panels[0];
  const byId = panels.find(p => p.dataset.jarvisPanelId === target);
  if (byId) return byId;
  return panels.find(p => panelKind(p) === t || (p.querySelector('.panel-header span')?.textContent || '').toLowerCase().includes(t)) || selected || panels[0];
}
function resetPanel(panel) {
  if (!panel) return;
  panel.classList.remove('j6-floating', 'j6-fullscreen', 'j6-pos-top-right', 'j6-pos-top-left', 'j6-pos-bottom-right', 'j6-pos-bottom-left', 'j6-pos-left', 'j6-pos-right', 'j6-pos-center');
  panel.style.removeProperty('--j6-scale');
  panel.dataset.j6Scale = '1';
}
function saveLayout() {
  try {
    const data = Array.from(document.querySelectorAll('.tool-panel')).map((p, i) => ({ i, kind: panelKind(p), className: p.className, scale: p.dataset.j6Scale || '1', display: p.style.display || '' }));
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(data));
  } catch {}
}
function restoreLayout() {
  try {
    const data = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '[]');
    const panels = Array.from(document.querySelectorAll('.tool-panel'));
    data.forEach((x, i) => {
      const panel = panels[x.i ?? i]; if (!panel) return;
      panel.className = x.className || panel.className;
      panel.dataset.j6Scale = x.scale || '1';
      panel.style.setProperty('--j6-scale', x.scale || '1');
      panel.style.display = x.display || '';
    });
  } catch {}
}
function applyHudAction(action) {
  if (!action) return false;
  if (action.action === 'clear') { document.querySelectorAll('.tool-panel').forEach(p => { p.style.display = 'none'; }); return true; }
  if (action.action === 'save') { saveLayout(); return true; }
  if (action.action === 'restore') { restoreLayout(); return true; }
  const target = action.target || action.panelType || 'selected';
  const panel = findPanel(target);
  if (action.action === 'map-command') {
    const mapTarget = panelKind(panel) === 'map' ? panel : findPanel('map');
    const map = mapTarget?.querySelector('.holo-map-wrapper')?.__jarvisMap;
    if (!map) return false;
    if (action.command === 'zoom-in') map.zoomIn();
    if (action.command === 'zoom-out') map.zoomOut();
    return true;
  }
  if (!panel || action.action === 'show') return false;
  markPanel(panel);
  if (action.action === 'remove') { panel.style.display = 'none'; return true; }
  if (action.action === 'move') {
    resetPanel(panel); panel.classList.add('j6-floating', `j6-pos-${action.position || 'center'}`); return true;
  }
  if (action.action === 'resize' && action.position === 'full') {
    resetPanel(panel); panel.classList.add('j6-floating', 'j6-fullscreen'); return true;
  }
  if (action.action === 'resize' && action.scale) {
    const current = Number(panel.dataset.j6Scale || '1');
    const next = clamp(current * Number(action.scale), .68, 1.75);
    panel.dataset.j6Scale = String(next);
    panel.classList.add('j6-floating');
    panel.style.setProperty('--j6-scale', String(next));
    return true;
  }
  return false;
}
function localHudCommand(text) {
  const clean = stripWake(text), t = clean.toLowerCase(), target = subjectFrom(t);
  if (/^(?:stop talking|stop speaking|be quiet|mute|quiet|shut up|stop)$/.test(t)) return { stop: true };
  if (/\b(?:clear|wipe|remove|close)\b.*\b(?:everything|all panels|hud|screen)\b/.test(t)) return { action: 'clear' };
  if (/\b(?:save|remember)\b.*\b(?:layout|workspace|hud|setup)\b/.test(t)) return { action: 'save' };
  if (/\b(?:restore|load|bring back)\b.*\b(?:layout|workspace|hud|setup)\b/.test(t)) return { action: 'restore' };
  if (/\b(?:full[ -]?screen|whole screen|maximi[sz]e|fill the screen|take (?:up )?the (?:whole )?screen)\b/.test(t) && /\b(?:map|panel|that|it|this|weather|system|browser)\b/.test(t)) return { action: 'resize', target, position: 'full' };
  const pos = positionFrom(t);
  if (pos && /\b(?:move|put|place|shift|send)\b/.test(t) && /\b(?:map|panel|that|it|this|weather|system|browser)\b/.test(t)) return { action: 'move', target, position: pos };
  if (/\b(?:make|resize)\b.*\b(?:bigger|larger|wider)\b|\b(?:bigger|larger)\b.*\b(?:that|it|map|panel|weather|system)\b/.test(t)) return { action: 'resize', target, scale: 1.22 };
  if (/\b(?:make|resize)\b.*\b(?:smaller|compact)\b|\bsmaller\b.*\b(?:that|it|map|panel|weather|system)\b/.test(t)) return { action: 'resize', target, scale: .82 };
  if (/\bzoom\s+in\b/.test(t)) return { action: 'map-command', target: target === 'selected' ? 'map' : target, command: 'zoom-in' };
  if (/\bzoom\s+out\b/.test(t)) return { action: 'map-command', target: target === 'selected' ? 'map' : target, command: 'zoom-out' };
  if (/\b(?:close|hide|get rid of|remove)\b/.test(t) && /\b(?:map|panel|that|it|this|weather|system|browser)\b/.test(t)) return { action: 'remove', target };
  return null;
}
function currentScene() {
  const panels = visiblePanels().slice(0, 10).map((p, index) => ({ id: ensurePanelId(p) || `legacy_${index}`, panelType: panelKind(p), title: p.querySelector('.panel-header span')?.textContent || 'Panel', query: p.querySelector('.holo-map-wrapper')?.dataset.jarvisQuery || '' }));
  const selected = document.querySelector('.tool-panel.j6-selected');
  return { selectedId: selected?.dataset.jarvisPanelId || panels[0]?.id || null, panels };
}
function legacyToolFromHud(action) {
  if (!action || action.action !== 'show') return null;
  const type = String(action.panelType || '').toLowerCase();
  const raw = action.data?.data || action.data || {};
  if (type === 'map') return { type: 'map', data: { query: action.query || raw.query || 'London' } };
  if (type === 'system') return { type: 'system', data: raw };
  if (type === 'weather') {
    const loc = raw.location || {}, c = raw.current || {};
    return { type: 'weather', data: { city: loc.name || action.query || 'Weather', country: loc.country || '', temp: c.temperature_2m, feels_like: c.apparent_temperature, humidity: c.relative_humidity_2m, wind: c.wind_speed_10m, description: c.precipitation > 0 ? 'precipitation' : 'current conditions', icon: '' } };
  }
  if (type === 'browser') return { type: 'browse', data: { url: raw.url || '', title: raw.title || 'Browser', content: raw.text || raw.content || 'Browser ready.' } };
  return null;
}
function nativeSetInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value); else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export default function JarvisRuntimeFinal() {
  const originalFetchRef = useRef(null);
  const recRef = useRef(null), restartRef = useRef(null), awakeUntilRef = useRef(0), speakingUntilRef = useRef(0);
  const wakeRef = useRef(false), rateRef = useRef(1.14);
  const [headerTarget, setHeaderTarget] = useState(null);
  const [health, setHealth] = useState({ online: false, model: 'qwen3:4b', latency: null });
  const [wake, setWake] = useState(false), [voiceState, setVoiceState] = useState('OFF'), [lastHeard, setLastHeard] = useState('');
  const [voiceRate, setVoiceRate] = useState(1.14);

  useEffect(() => {
    try { setWake(localStorage.getItem(WAKE_KEY) === '1'); const r = Number(localStorage.getItem(RATE_KEY)); if (r >= .92 && r <= 1.5) setVoiceRate(r); } catch {}
  }, []);
  useEffect(() => { wakeRef.current = wake; try { localStorage.setItem(WAKE_KEY, wake ? '1' : '0'); } catch {} }, [wake]);
  useEffect(() => { rateRef.current = voiceRate; try { localStorage.setItem(RATE_KEY, String(voiceRate)); } catch {} }, [voiceRate]);

  useEffect(() => {
    let timer;
    const find = () => { const node = document.querySelector('.header-right'); if (node) setHeaderTarget(node); else timer = setTimeout(find, 200); };
    find(); return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    const handler = e => { const panel = e.target.closest?.('.tool-panel'); if (panel) markPanel(panel); };
    document.addEventListener('pointerdown', handler, true); return () => document.removeEventListener('pointerdown', handler, true);
  }, []);

  const submitVoice = useCallback(command => {
    const input = document.querySelector('.chat-input'), form = document.querySelector('.chat-input-form');
    const text = stripWake(command); if (!input || !form || !text) return;
    setLastHeard(text); nativeSetInput(input, text);
    setTimeout(() => { try { form.requestSubmit(); } catch {} }, 70);
    setVoiceState('LISTENING');
  }, []);
  const speakDirect = useCallback(text => {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.rate = rateRef.current; u.pitch = .96;
    speakingUntilRef.current = Date.now() + Math.max(1000, String(text).length * 54);
    window.speechSynthesis.speak(u);
  }, []);

  useEffect(() => {
    const synth = window.speechSynthesis; if (!synth) return;
    const nativeSpeak = synth.speak.bind(synth);
    const patched = function(utterance) {
      try { utterance.rate = rateRef.current; if (!Number.isFinite(utterance.pitch) || utterance.pitch < .9) utterance.pitch = .96; speakingUntilRef.current = Date.now() + Math.max(1200, String(utterance.text || '').length * 56); } catch {}
      return nativeSpeak(utterance);
    };
    let installed = false;
    try { synth.speak = patched; installed = synth.speak === patched; } catch {}
    return () => { if (installed) { try { synth.speak = nativeSpeak; } catch {} } };
  }, []);

  useEffect(() => {
    if (!wake) { clearTimeout(restartRef.current); try { recRef.current?.stop(); } catch {} recRef.current = null; setVoiceState('OFF'); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceState('UNSUPPORTED'); return; }
    let alive = true;
    const start = () => {
      if (!alive || !wakeRef.current) return;
      try {
        const rec = new SR(); rec.continuous = true; rec.interimResults = false; rec.lang = 'en-US';
        rec.onstart = () => setVoiceState('LISTENING');
        rec.onresult = event => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (!event.results[i].isFinal) continue;
            const heard = String(event.results[i][0]?.transcript || '').trim(); if (!heard) continue;
            const lower = heard.toLowerCase(); setLastHeard(heard);
            if (/\b(?:stop talking|stop speaking|be quiet|mute|shut up|quiet)\b/.test(lower)) { window.speechSynthesis?.cancel(); speakingUntilRef.current = 0; awakeUntilRef.current = 0; setVoiceState('LISTENING'); continue; }
            if (Date.now() < speakingUntilRef.current || window.speechSynthesis?.speaking) continue;
            const match = lower.match(/\bhey\s+jarvis\b/);
            if (match) {
              const command = heard.slice((match.index || 0) + match[0].length).replace(/^[,.:;\-\s]+/, '').trim();
              awakeUntilRef.current = Date.now() + 12000;
              if (command) { awakeUntilRef.current = 0; submitVoice(command); }
              else { setVoiceState('AWAKE'); speakDirect('Yes, sir?'); }
            } else if (Date.now() < awakeUntilRef.current) { awakeUntilRef.current = 0; submitVoice(heard); }
          }
        };
        rec.onerror = e => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setVoiceState('MIC BLOCKED'); alive = false; return; }
          setVoiceState('RECONNECTING');
        };
        rec.onend = () => { recRef.current = null; if (alive && wakeRef.current) restartRef.current = setTimeout(start, 300); };
        recRef.current = rec; rec.start();
      } catch { if (alive) restartRef.current = setTimeout(start, 800); }
    };
    start();
    return () => { alive = false; clearTimeout(restartRef.current); try { recRef.current?.stop(); } catch {} recRef.current = null; };
  }, [wake, speakDirect, submitVoice]);

  useEffect(() => {
    const enhance = async wrapper => {
      if (!wrapper || wrapper.dataset.jarvisFinalMap === '1') return;
      wrapper.dataset.jarvisFinalMap = '1';
      const iframe = wrapper.querySelector('iframe'); let query = 'London';
      try { const u = new URL(iframe?.getAttribute('src') || '', window.location.href); query = decodeURIComponent(u.searchParams.get('q') || 'London'); } catch {}
      wrapper.dataset.jarvisQuery = query; if (iframe) iframe.style.display = 'none';
      const host = document.createElement('div'); host.className = 'j6-map-host'; wrapper.prepend(host);
      const status = document.createElement('div'); status.className = 'j6-map-status'; status.textContent = `LOCATING // ${query.toUpperCase()}`; wrapper.appendChild(status);
      const controls = document.createElement('div'); controls.className = 'j6-map-controls'; controls.innerHTML = '<button data-map="out">−</button><button data-map="in">+</button><button data-map="full">□</button>'; wrapper.appendChild(controls);
      controls.addEventListener('click', e => { const a = e.target?.dataset?.map; if (a === 'in') wrapper.__jarvisMap?.zoomIn(); if (a === 'out') wrapper.__jarvisMap?.zoomOut(); if (a === 'full') applyHudAction({ action: 'resize', target: 'map', position: 'full' }); });
      try {
        const fetcher = originalFetchRef.current || window.fetch.bind(window);
        const r = await fetcher(`${REALTIME}/v1/geocode?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(5200) });
        const d = await r.json(); if (!r.ok || !d.location) throw new Error(d.error || 'Location unavailable');
        const ml = window.maplibregl; if (!ml?.Map) throw new Error('Map runtime unavailable');
        const loc = d.location, map = new ml.Map({ container: host, center: [loc.longitude, loc.latitude], zoom: 11.5, bearing: 0 }); wrapper.__jarvisMap = map;
        new ml.Marker({ color: '#6ee5ff', scale: .92 }).setLngLat([loc.longitude, loc.latitude]).addTo(map);
        map.on('load', () => { status.textContent = `LIVE // ${String(loc.name || query).toUpperCase()}${loc.admin1 ? `, ${String(loc.admin1).toUpperCase()}` : ''}`; });
        setTimeout(() => { const tiles = Array.from(host.querySelectorAll('img')); if (tiles.length && !tiles.some(img => img.complete && img.naturalWidth > 0)) { status.classList.add('error'); status.textContent = 'MAP ERROR // TILES UNAVAILABLE'; } }, 3200);
        if (typeof ResizeObserver !== 'undefined') { const ro = new ResizeObserver(() => map.resize()); ro.observe(wrapper); wrapper.__jarvisResize = ro; }
        markPanel(wrapper.closest('.tool-panel'));
      } catch (e) { status.classList.add('error'); status.textContent = `MAP ERROR // ${String(e.message || 'Unavailable').replace(/^I couldn't locate\s*/i, '')}`; }
    };
    const scan = () => {
      const wrappers = Array.from(document.querySelectorAll('.holo-map-wrapper'));
      wrappers.forEach(enhance);
      const mapPanels = wrappers.map(w => w.closest('.tool-panel')).filter(Boolean);
      mapPanels.slice(1).forEach(p => { p.style.display = 'none'; });
    };
    scan(); const observer = new MutationObserver(scan); observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const original = window.fetch.bind(window); originalFetchRef.current = original; let mounted = true;
    const callRealtime = async (body, text, signal) => {
      const started = performance.now();
      const r = await original(`${REALTIME}/v1/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, messages: body.messages || [], mode: body.mode, scene: currentScene() }), signal: signal || AbortSignal.timeout(15000) });
      const data = await r.json().catch(() => ({}));
      if (mounted) setHealth(h => ({ ...h, online: r.ok, model: data.model?.split('/').pop() || h.model, latency: Math.round(performance.now() - started) }));
      if (data.clientAction === 'stop-speaking') window.speechSynthesis?.cancel();
      (data.hudActions || []).filter(a => a.action !== 'show').forEach(applyHudAction);
      return { ...data, reply: sanitizeReply(data.reply || data.error || 'Done.') };
    };

    window.fetch = async function jarvisFinalFetch(input, options = {}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const endpoint = ['/api/chat', '/api/stream', '/api/agent'].find(x => url === x || url.endsWith(x));
      if (!endpoint) return original(input, options);
      const body = parseBody(options), text = latestMessage(body), clean = stripWake(text);

      if (endpoint === '/api/agent') {
        try {
          const r = await original(`${REALTIME}/v1/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, message: body.message || clean, scene: currentScene() }), signal: options.signal || AbortSignal.timeout(60000) });
          if (r.ok) return r;
        } catch {}
        return original(input, options);
      }

      const hud = localHudCommand(clean);
      if (hud?.stop) { window.speechSynthesis?.cancel(); return endpoint === '/api/stream' ? sseResponse('', 'instant/client') : jsonResponse({ reply: '', model: 'instant/client' }); }
      if (hud && applyHudAction(hud)) {
        const reply = hud.action === 'remove' ? 'Closed.' : hud.action === 'move' ? 'Moved.' : hud.action === 'save' ? 'Saved.' : hud.action === 'restore' ? 'Restored.' : 'Done.';
        return endpoint === '/api/stream' ? sseResponse(reply, 'instant/hud') : jsonResponse({ reply, model: 'instant/hud' });
      }

      const place = mapPlace(clean);
      if (place && endpoint === '/api/chat') return jsonResponse({ reply: `Pulling up ${place}.`, model: 'instant/map', tool: { type: 'map', data: { query: place } } });

      if (endpoint === '/api/chat' && legacyToolRequest(clean)) {
        if (longLegacyTool(clean)) return original(input, options);
        const timeout = new Promise(resolve => setTimeout(() => resolve(null), 4500));
        try { const legacy = await Promise.race([original(input, options), timeout]); if (legacy?.ok) return legacy; } catch {}
      }

      try {
        const data = await callRealtime(body, clean, options.signal);
        if (endpoint === '/api/chat') {
          const tool = (data.hudActions || []).map(legacyToolFromHud).find(Boolean) || null;
          return jsonResponse({ reply: data.reply, model: data.model || 'local/qwen3:4b', local: true, latencyMs: data.latencyMs, tool });
        }
        return sseResponse(data.reply, data.model || 'local/qwen3:4b');
      } catch {
        try { return await original(input, options); }
        catch { return endpoint === '/api/stream' ? sseResponse('I hit a local connection problem, sir.', 'local/error') : jsonResponse({ reply: 'I hit a local connection problem, sir.', model: 'local/error' }, 503); }
      }
    };
    return () => { mounted = false; window.fetch = original; originalFetchRef.current = null; };
  }, []);

  useEffect(() => {
    const fetcher = originalFetchRef.current || window.fetch.bind(window); let alive = true;
    const check = async () => {
      const start = performance.now();
      try { const r = await fetcher(`${REALTIME}/health`, { signal: AbortSignal.timeout(1200) }); const d = await r.json(); if (alive) setHealth({ online: r.ok && d.ollama !== false, model: d.model || 'qwen3:4b', latency: Math.round(performance.now() - start) }); }
      catch { if (alive) setHealth(h => ({ ...h, online: false, latency: null })); }
    };
    check(); const timer = setInterval(check, 6000); return () => { alive = false; clearInterval(timer); };
  }, []);

  const portal = useMemo(() => !headerTarget ? null : createPortal(<>
    <div className={`j6-local-badge ${health.online ? 'online' : 'offline'}`} title={health.online ? 'Local Jarvis connected' : 'Start companion/npm start'}><span /><b>{health.online ? 'LOCAL JARVIS' : 'LOCAL OFF'}</b><small>{health.online ? `${health.model}${health.latency != null ? ` · ${health.latency}ms` : ''}` : 'RESTART CORE'}</small></div>
    <button className={`j6-wake-btn ${wake ? 'active' : ''}`} onClick={() => setWake(v => !v)}>{wake ? 'WAKE ON' : 'WAKE'}</button>
  </>, headerTarget), [headerTarget, health, wake]);

  return <>{portal}{wake && <div className={`j6-voice-strip state-${voiceState.toLowerCase().replace(/\s+/g, '-')}`}><span className="j6-voice-dot" /><b>{voiceState}</b>{lastHeard && <small>{lastHeard.slice(0, 80)}</small>}<em>{voiceRate.toFixed(2)}×</em><button onClick={() => setVoiceRate(v => clamp(v - .08, .92, 1.5))}>−</button><button onClick={() => setVoiceRate(v => clamp(v + .08, .92, 1.5))}>+</button></div>}</>;
}
