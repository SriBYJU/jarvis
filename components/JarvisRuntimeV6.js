import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REALTIME = 'http://127.0.0.1:3007';
const CORE = 'http://127.0.0.1:3003';
const WAKE_KEY = 'jarvis.v6.wake';
const VOICE_RATE_KEY = 'jarvis.v6.voice-rate';

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function stripWake(text) { return String(text || '').replace(/^\s*(?:hey\s+)?jarvis\s*[,.:;\-]?\s*/i, '').trim(); }
function latestMessage(body) {
  if (body?.message) return String(body.message);
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  return String(messages[messages.length - 1]?.content || '');
}
function parseBody(options) {
  try { return JSON.parse(options?.body || '{}'); } catch { return {}; }
}
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function sseResponse(reply, model = 'local/qwen3:4b') {
  const safe = String(reply || '');
  const chunks = safe.match(/.{1,42}(?:\s|$)/g) || [safe];
  const payload = [
    `data: ${JSON.stringify({ meta: { model } })}\n\n`,
    ...chunks.map(token => `data: ${JSON.stringify({ token })}\n\n`),
    'data: [DONE]\n\n',
  ].join('');
  return new Response(payload, { status: 200, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
}
function sanitizeReply(value) {
  let text = String(value || '').trim();
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  text = text.replace(/```(?:json)?\s*\{\s*"name"[\s\S]*?```/gi, '').trim();
  const banned = /\b(?:the user|user is asking|user wants|let me think|let's see|first i need to|i should check|looking at the hud|tools section|function called|my reasoning|chain of thought)\b/i;
  if (banned.test(text)) {
    const sentences = text.split(/(?<=[.!?])\s+/).filter(s => !banned.test(s));
    text = sentences.join(' ').trim();
  }
  if (!text) return 'I’m here, sir.';
  return text.length > 900 ? `${text.slice(0, 897).replace(/\s+\S*$/, '')}…` : text;
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
function panelPosition(text) {
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
  const t = String(text || '').toLowerCase();
  return /\b(?:youtube|video|stock|ticker|latest news|headlines|web search|search the web|google|browse|wikipedia|wiki|translate|currency|convert|world clock|joke|define|definition|qr code|generate image|create image|gallery|camera|vision|timer|remind|reminder|project|remember|memory|forget|nutrition|calories|protein|brief me|briefing|screen share|generate a file|create a file|spreadsheet|excel|xlsx|powerpoint|pptx|presentation|word doc|docx|csv|run this code|execute code)\b/i.test(t);
}
function longLegacyTool(text) {
  return /\b(?:generate a file|create a file|spreadsheet|excel|xlsx|powerpoint|pptx|presentation|word doc|docx|camera|vision|screen share|gallery|generate image|create image)\b/i.test(String(text || ''));
}
function localUiCommand(text) {
  const t = stripWake(text).toLowerCase();
  if (!t) return null;
  if (/^(?:stop talking|stop speaking|be quiet|mute|quiet|shut up|stop)$/.test(t)) return { type: 'stop' };
  if (/\b(?:full[ -]?screen|whole screen|maximi[sz]e|fill the screen|take (?:up )?the (?:whole )?screen)\b/.test(t) && /\b(?:map|panel|that|it|this)\b/.test(t)) return { type: 'panel', action: 'full' };
  const pos = panelPosition(t);
  if (pos && /\b(?:move|put|place|shift|send)\b/.test(t) && /\b(?:map|panel|that|it|this)\b/.test(t)) return { type: 'panel', action: 'move', position: pos };
  if (/\b(?:make|resize)\b.*\b(?:bigger|larger|wider)\b/.test(t) || /\b(?:bigger|larger)\b.*\b(?:map|panel|that|it|this)\b/.test(t)) return { type: 'panel', action: 'scale', scale: 1.22 };
  if (/\b(?:make|resize)\b.*\b(?:smaller|compact)\b/.test(t) || /\bsmaller\b.*\b(?:map|panel|that|it|this)\b/.test(t)) return { type: 'panel', action: 'scale', scale: 0.82 };
  if (/\bzoom\s+in\b/.test(t)) return { type: 'map', action: 'zoom-in' };
  if (/\bzoom\s+out\b/.test(t)) return { type: 'map', action: 'zoom-out' };
  if (/\b(?:close|hide|get rid of|remove)\b.*\b(?:map|panel|that|it|this)\b/.test(t)) return { type: 'panel', action: 'close' };
  if (/\b(?:reset|restore)\b.*\b(?:panel|map|layout|screen)\b/.test(t)) return { type: 'panel', action: 'reset' };
  return null;
}
function nativeSetInput(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value); else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
function currentScene() {
  const panels = Array.from(document.querySelectorAll('.tool-panel')).slice(0, 8).map((el, index) => ({
    id: el.dataset.jarvisPanelId || `legacy_${index}`,
    panelType: el.querySelector('.holo-map-wrapper') ? 'map' : (el.querySelector('.panel-header span')?.textContent || 'panel').toLowerCase().split(/\s|—/)[0],
    title: el.querySelector('.panel-header span')?.textContent || 'Panel',
    query: el.querySelector('.holo-map-wrapper')?.dataset.jarvisQuery || '',
  }));
  const selected = document.querySelector('.tool-panel.j6-selected');
  return { selectedId: selected?.dataset.jarvisPanelId || panels[0]?.id || null, panels };
}
function activePanel() {
  return document.querySelector('.tool-panel.j6-selected') || document.querySelector('.tool-panel');
}
function mapPanel() {
  return document.querySelector('.holo-map-wrapper')?.closest('.tool-panel') || null;
}
function markPanel(panel) {
  document.querySelectorAll('.tool-panel.j6-selected').forEach(x => x.classList.remove('j6-selected'));
  if (panel) {
    if (!panel.dataset.jarvisPanelId) panel.dataset.jarvisPanelId = `panel_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    panel.classList.add('j6-selected');
  }
}
function resetPanel(panel) {
  if (!panel) return;
  panel.classList.remove('j6-floating', 'j6-fullscreen', 'j6-pos-top-right', 'j6-pos-top-left', 'j6-pos-bottom-right', 'j6-pos-bottom-left', 'j6-pos-left', 'j6-pos-right', 'j6-pos-center');
  panel.style.removeProperty('--j6-scale');
  panel.style.removeProperty('width');
  panel.style.removeProperty('height');
}
function applyPanelCommand(command) {
  const panel = mapPanel() || activePanel();
  if (command.type === 'map') {
    const wrapper = panel?.querySelector('.holo-map-wrapper');
    const map = wrapper?.__jarvisMap;
    if (!map) return false;
    if (command.action === 'zoom-in') map.zoomIn();
    if (command.action === 'zoom-out') map.zoomOut();
    return true;
  }
  if (!panel) return false;
  markPanel(panel);
  if (command.action === 'close') { panel.style.display = 'none'; return true; }
  if (command.action === 'reset') { panel.style.display = ''; resetPanel(panel); return true; }
  if (command.action === 'full') {
    resetPanel(panel); panel.classList.add('j6-floating', 'j6-fullscreen'); return true;
  }
  if (command.action === 'move') {
    resetPanel(panel); panel.classList.add('j6-floating', `j6-pos-${command.position || 'center'}`); return true;
  }
  if (command.action === 'scale') {
    const current = Number(panel.dataset.j6Scale || '1');
    const next = clamp(current * command.scale, .68, 1.75);
    panel.dataset.j6Scale = String(next);
    panel.classList.add('j6-floating');
    panel.style.setProperty('--j6-scale', String(next));
    return true;
  }
  return false;
}

export default function JarvisRuntimeV6() {
  const originalFetchRef = useRef(null);
  const recRef = useRef(null);
  const restartRef = useRef(null);
  const awakeUntilRef = useRef(0);
  const speakingUntilRef = useRef(0);
  const [headerTarget, setHeaderTarget] = useState(null);
  const [health, setHealth] = useState({ online: false, model: 'qwen3:4b', latency: null });
  const [wake, setWake] = useState(false);
  const wakeRef = useRef(false);
  const [voiceState, setVoiceState] = useState('OFF');
  const [lastHeard, setLastHeard] = useState('');
  const [voiceRate, setVoiceRate] = useState(1.12);
  const voiceRateRef = useRef(1.12);

  useEffect(() => {
    try { setWake(localStorage.getItem(WAKE_KEY) === '1'); const saved = Number(localStorage.getItem(VOICE_RATE_KEY)); if (saved >= .9 && saved <= 1.55) setVoiceRate(saved); } catch {}
  }, []);
  useEffect(() => { wakeRef.current = wake; try { localStorage.setItem(WAKE_KEY, wake ? '1' : '0'); } catch {} }, [wake]);
  useEffect(() => { voiceRateRef.current = voiceRate; try { localStorage.setItem(VOICE_RATE_KEY, String(voiceRate)); } catch {} }, [voiceRate]);

  useEffect(() => {
    let timer;
    const find = () => {
      const node = document.querySelector('.header-right');
      if (node) setHeaderTarget(node); else timer = setTimeout(find, 250);
    };
    find();
    return () => clearTimeout(timer);
  }, []);

  const submitVoice = useCallback((command) => {
    const input = document.querySelector('.chat-input');
    const form = document.querySelector('.chat-input-form');
    if (!input || !form) { setVoiceState('READY'); return; }
    const text = stripWake(command);
    if (!text) return;
    setLastHeard(text);
    nativeSetInput(input, text);
    setTimeout(() => { try { form.requestSubmit(); } catch {} }, 40);
    setVoiceState('LISTENING');
  }, []);

  const speakDirect = useCallback((text) => {
    if (!window.speechSynthesis || !text) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = voiceRateRef.current;
    utter.pitch = .94;
    speakingUntilRef.current = Date.now() + Math.max(1000, String(text).length * 55);
    window.speechSynthesis.speak(utter);
  }, []);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const synth = window.speechSynthesis;
    const originalSpeak = synth.speak.bind(synth);
    synth.speak = function jarvisV6Speak(utterance) {
      try {
        utterance.rate = voiceRateRef.current;
        if (!Number.isFinite(utterance.pitch) || utterance.pitch < .88) utterance.pitch = .94;
        speakingUntilRef.current = Date.now() + Math.max(1200, String(utterance.text || '').length * 58);
      } catch {}
      return originalSpeak(utterance);
    };
    return () => { try { synth.speak = originalSpeak; } catch {} };
  }, []);

  useEffect(() => {
    if (!wake) {
      clearTimeout(restartRef.current);
      try { recRef.current?.stop(); } catch {}
      recRef.current = null;
      setVoiceState('OFF');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceState('UNSUPPORTED'); return; }
    let alive = true;
    const start = () => {
      if (!alive || !wakeRef.current) return;
      try {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = 'en-US';
        rec.onstart = () => setVoiceState('LISTENING');
        rec.onresult = event => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (!event.results[i].isFinal) continue;
            const heard = String(event.results[i][0]?.transcript || '').trim();
            if (!heard) continue;
            const lower = heard.toLowerCase();
            setLastHeard(heard);
            if (/\b(?:stop talking|stop speaking|be quiet|mute|shut up|quiet)\b/.test(lower)) {
              window.speechSynthesis?.cancel(); speakingUntilRef.current = 0; awakeUntilRef.current = 0; setVoiceState('LISTENING'); continue;
            }
            if (Date.now() < speakingUntilRef.current || window.speechSynthesis?.speaking) continue;
            const wakeMatch = lower.match(/\bhey\s+jarvis\b/);
            if (wakeMatch) {
              const command = heard.slice((wakeMatch.index || 0) + wakeMatch[0].length).replace(/^[,.:;\-\s]+/, '').trim();
              awakeUntilRef.current = Date.now() + 12000;
              if (command) { awakeUntilRef.current = 0; submitVoice(command); }
              else { setVoiceState('AWAKE'); speakDirect('Yes, sir?'); }
              continue;
            }
            if (Date.now() < awakeUntilRef.current) { awakeUntilRef.current = 0; submitVoice(heard); }
          }
        };
        rec.onerror = e => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setVoiceState('MIC BLOCKED'); setWake(false); alive = false; return; }
          setVoiceState('RECONNECTING');
        };
        rec.onend = () => { recRef.current = null; if (alive && wakeRef.current) restartRef.current = setTimeout(start, 320); };
        recRef.current = rec;
        rec.start();
      } catch { if (alive) restartRef.current = setTimeout(start, 850); }
    };
    start();
    return () => { alive = false; clearTimeout(restartRef.current); try { recRef.current?.stop(); } catch {} recRef.current = null; };
  }, [wake, speakDirect, submitVoice]);

  useEffect(() => {
    const onPanelClick = e => {
      const panel = e.target.closest?.('.tool-panel');
      if (panel) markPanel(panel);
    };
    document.addEventListener('pointerdown', onPanelClick, true);
    return () => document.removeEventListener('pointerdown', onPanelClick, true);
  }, []);

  useEffect(() => {
    const enhance = async (wrapper) => {
      if (!wrapper || wrapper.dataset.j6Enhanced === '1') return;
      wrapper.dataset.j6Enhanced = '1';
      const iframe = wrapper.querySelector('iframe');
      let query = 'London';
      try {
        const src = iframe?.getAttribute('src') || '';
        const u = new URL(src, window.location.href);
        query = decodeURIComponent(u.searchParams.get('q') || 'London');
      } catch {}
      wrapper.dataset.jarvisQuery = query;
      if (iframe) iframe.style.display = 'none';
      const host = document.createElement('div');
      host.className = 'j6-map-host';
      wrapper.prepend(host);
      const status = document.createElement('div'); status.className = 'j6-map-status'; status.textContent = `LOCATING // ${query.toUpperCase()}`; wrapper.appendChild(status);
      const controls = document.createElement('div'); controls.className = 'j6-map-controls';
      controls.innerHTML = '<button data-j6-map="out">−</button><button data-j6-map="in">+</button><button data-j6-map="full">□</button>';
      wrapper.appendChild(controls);
      controls.addEventListener('click', e => {
        const action = e.target?.dataset?.j6Map;
        if (action === 'in') wrapper.__jarvisMap?.zoomIn();
        if (action === 'out') wrapper.__jarvisMap?.zoomOut();
        if (action === 'full') applyPanelCommand({ type: 'panel', action: 'full' });
      });
      try {
        const original = originalFetchRef.current || window.fetch.bind(window);
        const response = await original(`${REALTIME}/v1/geocode?q=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(4800) });
        const data = await response.json();
        if (!response.ok || !data.location) throw new Error(data.error || 'Location unavailable');
        const ml = window.maplibregl;
        if (!ml?.Map) throw new Error('Map runtime unavailable');
        const loc = data.location;
        const map = new ml.Map({ container: host, center: [loc.longitude, loc.latitude], zoom: 11.5, bearing: 0 });
        wrapper.__jarvisMap = map;
        new ml.Marker({ color: '#6ee5ff', scale: .92 }).setLngLat([loc.longitude, loc.latitude]).addTo(map);
        map.on('load', () => { status.textContent = `LIVE // ${String(loc.name || query).toUpperCase()}${loc.admin1 ? `, ${String(loc.admin1).toUpperCase()}` : ''}`; });
        if (typeof ResizeObserver !== 'undefined') {
          const ro = new ResizeObserver(() => map.resize()); ro.observe(wrapper); wrapper.__jarvisResize = ro;
        }
      } catch (e) {
        status.classList.add('error');
        status.textContent = `MAP ERROR // ${String(e.message || 'Unavailable').replace(/^I couldn't locate\s*/i, '')}`;
      }
    };
    const scan = () => document.querySelectorAll('.holo-map-wrapper').forEach(enhance);
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const original = window.fetch.bind(window);
    originalFetchRef.current = original;
    let mounted = true;

    const callRealtime = async (body, text, signal) => {
      const started = performance.now();
      const response = await original(`${REALTIME}/v1/command`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, messages: body.messages || [], mode: body.mode, scene: currentScene() }),
        signal: signal || AbortSignal.timeout(13500),
      });
      const data = await response.json().catch(() => ({}));
      if (mounted) setHealth(h => ({ ...h, online: response.ok, model: data.model?.split('/').pop() || h.model, latency: Math.round(performance.now() - started) }));
      if (data.clientAction === 'stop-speaking') window.speechSynthesis?.cancel();
      for (const action of data.hudActions || []) {
        if (action.action === 'resize' && action.position === 'full') applyPanelCommand({ type: 'panel', action: 'full' });
        else if (action.action === 'move') applyPanelCommand({ type: 'panel', action: 'move', position: action.position });
        else if (action.action === 'map-command') applyPanelCommand({ type: 'map', action: action.command });
        else if (action.action === 'remove') applyPanelCommand({ type: 'panel', action: 'close' });
      }
      return { ...data, reply: sanitizeReply(data.reply || data.error || 'Done.') };
    };

    const localWeatherResponse = async (text) => {
      const match = String(text).match(/(?:weather|temperature|forecast).*?(?:in|for|at)\s+(.+)/i);
      if (!match?.[1]) return null;
      const location = match[1].replace(/[?.!]+$/, '').trim();
      try {
        const r = await original(`${CORE}/v1/action`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'weather', args: { location } }), signal: AbortSignal.timeout(7000) });
        const d = await r.json();
        const result = d?.data || d;
        const loc = result.location || d.location || {};
        const c = result.current || d.current || {};
        if (!r.ok || c.temperature_2m == null) return null;
        return {
          reply: `${loc.name || location}: ${Math.round(c.temperature_2m)}°F right now.`,
          model: 'instant/local-weather',
          tool: { type: 'weather', data: { city: loc.name || location, country: loc.country || '', temp: c.temperature_2m, feels_like: c.apparent_temperature, humidity: c.relative_humidity_2m, wind: c.wind_speed_10m, description: c.precipitation > 0 ? 'precipitation' : 'current conditions', icon: '' } },
        };
      } catch { return null; }
    };

    window.fetch = async function jarvisV6Fetch(input, options = {}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const endpoint = ['/api/chat', '/api/stream', '/api/agent'].find(x => url === x || url.endsWith(x));
      if (!endpoint) return original(input, options);
      const body = parseBody(options);
      const text = latestMessage(body);
      const clean = stripWake(text);

      if (endpoint === '/api/agent') {
        try {
          const local = await original(`${CORE}/v1/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: options.signal || AbortSignal.timeout(45000) });
          if (local.ok) return local;
        } catch {}
        return original(input, options);
      }

      const ui = localUiCommand(clean);
      if (ui?.type === 'stop') {
        window.speechSynthesis?.cancel();
        return endpoint === '/api/stream' ? sseResponse('', 'instant/client') : jsonResponse({ reply: '', model: 'instant/client' });
      }
      if (ui && applyPanelCommand(ui)) {
        const reply = ui.action === 'close' ? 'Closed.' : ui.action === 'move' ? 'Moved.' : 'Done.';
        return endpoint === '/api/stream' ? sseResponse(reply, 'instant/hud') : jsonResponse({ reply, model: 'instant/hud' });
      }

      const place = mapPlace(clean);
      if (place && endpoint === '/api/chat') {
        return jsonResponse({ reply: `Pulling up ${place}.`, model: 'instant/map', tool: { type: 'map', data: { query: place } } });
      }

      if (/\b(?:weather|temperature|forecast)\b/i.test(clean) && endpoint === '/api/chat') {
        const weather = await localWeatherResponse(clean);
        if (weather) return jsonResponse(weather);
      }

      if (endpoint === '/api/chat' && legacyToolRequest(clean)) {
        if (longLegacyTool(clean)) return original(input, options);
        const timeout = new Promise(resolve => setTimeout(() => resolve(null), 6500));
        try {
          const legacy = await Promise.race([original(input, options), timeout]);
          if (legacy) return legacy;
        } catch {}
      }

      try {
        const data = await callRealtime(body, clean, options.signal);
        if (endpoint === '/api/chat') return jsonResponse({ reply: data.reply, model: data.model || 'local/qwen3:4b', local: true, latencyMs: data.latencyMs });
        return sseResponse(data.reply, data.model || 'local/qwen3:4b');
      } catch (e) {
        try { return await original(input, options); }
        catch { return endpoint === '/api/stream' ? sseResponse('I hit a local connection problem, sir.', 'local/error') : jsonResponse({ reply: 'I hit a local connection problem, sir.', model: 'local/error' }, 503); }
      }
    };

    return () => { mounted = false; window.fetch = original; originalFetchRef.current = null; };
  }, []);

  useEffect(() => {
    const original = originalFetchRef.current || window.fetch.bind(window);
    let alive = true;
    const check = async () => {
      const start = performance.now();
      try {
        const r = await original(`${REALTIME}/health`, { signal: AbortSignal.timeout(1100) });
        const d = await r.json();
        if (alive) setHealth({ online: r.ok && d.ollama !== false, model: d.model || 'qwen3:4b', latency: Math.round(performance.now() - start) });
      } catch { if (alive) setHealth(h => ({ ...h, online: false, latency: null })); }
    };
    check(); const timer = setInterval(check, 6000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const portal = useMemo(() => {
    if (!headerTarget) return null;
    return createPortal(<>
      <div className={`j6-local-badge ${health.online ? 'online' : 'offline'}`} title={health.online ? 'Local Jarvis core connected' : 'Start companion/npm start'}>
        <span /><b>{health.online ? 'LOCAL' : 'LOCAL OFF'}</b><small>{health.online ? `${health.model}${health.latency != null ? ` · ${health.latency}ms` : ''}` : 'RESTART CORE'}</small>
      </div>
      <button className={`j6-wake-btn ${wake ? 'active' : ''}`} onClick={() => setWake(v => !v)} title="Always-listening Hey Jarvis wake word">
        {wake ? 'WAKE ON' : 'WAKE'}
      </button>
    </>, headerTarget);
  }, [headerTarget, health, wake]);

  return <>
    {portal}
    {wake && <div className={`j6-voice-strip state-${voiceState.toLowerCase().replace(/\s+/g, '-')}`}>
      <span className="j6-voice-dot" />
      <b>{voiceState}</b>
      {lastHeard && <small>{lastHeard.slice(0, 80)}</small>}
      <em>{voiceRate.toFixed(2)}×</em>
      <button onClick={() => setVoiceRate(v => clamp(v - .08, .92, 1.45))}>−</button>
      <button onClick={() => setVoiceRate(v => clamp(v + .08, .92, 1.45))}>+</button>
    </div>}
  </>;
}
