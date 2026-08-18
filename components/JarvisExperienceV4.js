import { useCallback, useEffect, useRef, useState } from 'react';

const REALTIME = 'http://127.0.0.1:3007';
const CORE = 'http://127.0.0.1:3003';
const WORKSPACE_KEY = 'jarvis.v4.workspace';
const VOICE_KEY = 'jarvis.v4.voice-enabled';
const RATE_KEY = 'jarvis.v4.voice-rate';
const MAPLIBRE_JS = 'https://unpkg.com/maplibre-gl@5.16.0/dist/maplibre-gl.js';
const MAPLIBRE_CSS = 'https://unpkg.com/maplibre-gl@5.16.0/dist/maplibre-gl.css';
const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';

function loadMapLibre() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Browser unavailable'));
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (window.__jarvisMapLibrePromise) return window.__jarvisMapLibrePromise;
  window.__jarvisMapLibrePromise = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) {
      const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = MAPLIBRE_CSS; document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${MAPLIBRE_JS}"]`);
    const done = () => window.maplibregl ? resolve(window.maplibregl) : reject(new Error('Map renderer unavailable'));
    if (existing) { existing.addEventListener('load', done, { once: true }); existing.addEventListener('error', () => reject(new Error('Map renderer failed to load')), { once: true }); return; }
    const script = document.createElement('script'); script.src = MAPLIBRE_JS; script.async = true; script.onload = done; script.onerror = () => reject(new Error('Map renderer failed to load')); document.head.appendChild(script);
  });
  return window.__jarvisMapLibrePromise;
}

function hud(action) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('jarvis:hud', { detail: action }));
}
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function preset(name = 'center') {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  const width = Math.min(520, w - 28), height = Math.min(390, h - 100), g = 14;
  const xRight = Math.max(g, w - width - g), yBottom = Math.max(58, h - height - g);
  const spots = {
    left: { x: g, y: 86 }, right: { x: xRight, y: 86 }, center: { x: Math.max(g, (w - width) / 2), y: 90 },
    'top-left': { x: g, y: 58 }, 'top-right': { x: xRight, y: 58 }, 'bottom-left': { x: g, y: yBottom }, 'bottom-right': { x: xRight, y: yBottom }, full: { x: 10, y: 52 },
  };
  return spots[name] || spots.center;
}
function defaultSize(type) {
  if (typeof window === 'undefined') return { width: 520, height: 360 };
  if (type === 'map') return { width: Math.min(620, window.innerWidth - 28), height: Math.min(440, window.innerHeight - 110) };
  return { width: Math.min(500, window.innerWidth - 28), height: 330 };
}

function restyleMap(map) {
  try {
    for (const layer of map.getStyle()?.layers || []) {
      try {
        if (layer.type === 'background') map.setPaintProperty(layer.id, 'background-color', '#020713');
        if (layer.type === 'fill') { map.setPaintProperty(layer.id, 'fill-color', '#07192a'); map.setPaintProperty(layer.id, 'fill-opacity', 0.82); }
        if (layer.type === 'line') { map.setPaintProperty(layer.id, 'line-color', '#168dff'); map.setPaintProperty(layer.id, 'line-opacity', 0.42); }
        if (layer.type === 'symbol') {
          map.setPaintProperty(layer.id, 'text-color', '#8adfff'); map.setPaintProperty(layer.id, 'text-halo-color', '#00101d'); map.setPaintProperty(layer.id, 'text-halo-width', 1.3);
          map.setPaintProperty(layer.id, 'icon-opacity', 0.55);
        }
        if (layer.type === 'circle') { map.setPaintProperty(layer.id, 'circle-color', '#47c9ff'); map.setPaintProperty(layer.id, 'circle-opacity', 0.72); }
        if (layer.type === 'fill-extrusion') { map.setPaintProperty(layer.id, 'fill-extrusion-color', '#0d5d93'); map.setPaintProperty(layer.id, 'fill-extrusion-opacity', 0.55); }
      } catch {}
    }
  } catch {}
}

function HoloMap({ panel }) {
  const hostRef = useRef(null), mapRef = useRef(null), markerRef = useRef(null), commandRef = useRef(0);
  const [status, setStatus] = useState('LOCATING');
  const [error, setError] = useState('');
  const [location, setLocation] = useState(null);

  useEffect(() => {
    let live = true; const controller = new AbortController(); const query = panel.query || 'London';
    setStatus('LOCATING'); setError('');
    const timer = setTimeout(() => { if (live && !location) { setError('Map location timed out.'); setStatus('ERROR'); } }, 9000);
    Promise.all([
      loadMapLibre(),
      fetch(`${REALTIME}/v1/geocode?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then(async r => { const d = await r.json(); if (!r.ok || !d.location) throw new Error(d.error || 'Location not found'); return d.location; }),
    ]).then(([ml, loc]) => {
      if (!live || !hostRef.current) return; clearTimeout(timer); setLocation(loc); setStatus('RENDERING');
      const center = [loc.longitude, loc.latitude];
      if (!mapRef.current) {
        const map = new ml.Map({ container: hostRef.current, style: MAP_STYLE, center, zoom: 11.5, pitch: 43, bearing: -14, attributionControl: true, fadeDuration: 180 });
        mapRef.current = map;
        map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'bottom-right');
        map.on('load', () => { if (!live) return; restyleMap(map); setStatus('LIVE'); setTimeout(() => map.resize(), 40); });
        map.on('styledata', () => { if (map.isStyleLoaded()) restyleMap(map); });
        markerRef.current = new ml.Marker({ color: '#55d8ff', scale: 0.9 }).setLngLat(center).addTo(map);
      } else {
        markerRef.current?.setLngLat(center); mapRef.current.flyTo({ center, zoom: Math.max(mapRef.current.getZoom(), 10.5), duration: 650, essential: true }); setStatus('LIVE');
      }
    }).catch(e => { if (live && e.name !== 'AbortError') { clearTimeout(timer); setError(e.message); setStatus('ERROR'); } });
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [panel.query]);

  useEffect(() => {
    const map = mapRef.current; if (!map || panel.mapCommandSeq === commandRef.current) return; commandRef.current = panel.mapCommandSeq || 0;
    if (panel.mapCommand === 'zoom-in') map.zoomIn({ duration: 230 });
    if (panel.mapCommand === 'zoom-out') map.zoomOut({ duration: 230 });
    if (panel.mapCommand === 'rotate-left') map.rotateTo(map.getBearing() - 20, { duration: 250 });
    if (panel.mapCommand === 'rotate-right') map.rotateTo(map.getBearing() + 20, { duration: 250 });
  }, [panel.mapCommand, panel.mapCommandSeq]);

  useEffect(() => {
    if (!hostRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => mapRef.current?.resize()); ro.observe(hostRef.current); return () => ro.disconnect();
  }, []);
  useEffect(() => () => { try { mapRef.current?.remove(); } catch {} mapRef.current = null; }, []);

  return <div className="j4-map-shell">
    <div ref={hostRef} className="j4-map-canvas" />
    <div className="j4-map-grid" /><div className="j4-map-sweep" /><div className="j4-map-vignette" />
    <div className={`j4-map-status ${error ? 'error' : ''}`}>{status}{error ? ` // ${error}` : location ? ` // ${location.name?.toUpperCase()} ${location.country || ''}` : ` // ${panel.query || ''}`}</div>
    <div className="j4-map-reticle"><span /><span /></div>
  </div>;
}

function SystemView({ data }) {
  const d = data?.data || data || {}, gb = n => n ? (n / 1073741824).toFixed(1) : '—';
  return <div className="j4-metrics"><div><b>{d.memoryUsagePercent ?? '—'}%</b><span>MEMORY</span></div><div><b>{d.cores ?? '—'}</b><span>CPU CORES</span></div><div><b>{gb(d.freeMemory)}</b><span>GB FREE</span></div><div><b>{d.platform || '—'}</b><span>PLATFORM</span></div><p>{d.cpu || 'Local system'}</p></div>;
}
function WeatherView({ data }) {
  const d = data?.data || data || {}, c = d.current || {}, loc = d.location || {};
  return <div className="j4-metrics"><div><b>{c.temperature_2m != null ? `${Math.round(c.temperature_2m)}°` : '—'}</b><span>{loc.name || 'WEATHER'}</span></div><div><b>{c.apparent_temperature != null ? `${Math.round(c.apparent_temperature)}°` : '—'}</b><span>FEELS</span></div><div><b>{c.relative_humidity_2m ?? '—'}%</b><span>HUMIDITY</span></div><div><b>{c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : '—'}</b><span>WIND MPH</span></div></div>;
}
function BriefingView({ data }) {
  const d = data?.data || data || {}, m = d.missions || {};
  return <div className="j4-brief"><div><b>{m.active?.length || 0}</b><span>ACTIVE</span></div><div><b>{m.completed?.length || 0}</b><span>DONE</span></div><div><b>{m.blocked?.length || 0}</b><span>CHECK</span></div>{m.active?.slice(0, 3).map(x => <p key={x.id}>◉ {x.objective}</p>)}</div>;
}
function GenericView({ panel }) {
  if (panel.panelType === 'map') return <HoloMap panel={panel} />;
  if (panel.panelType === 'system') return <SystemView data={panel.data} />;
  if (panel.panelType === 'weather') return <WeatherView data={panel.data} />;
  if (panel.panelType === 'briefing') return <BriefingView data={panel.data} />;
  if (panel.panelType === 'media') return <div className="j4-media"><div>♫</div><b>{panel.data?.track?.name || 'SPOTIFY'}</b><span>{panel.data?.status || 'MEDIA LINK'}</span></div>;
  if (panel.panelType === 'browser') return <div className="j4-browser"><span>{panel.data?.url || 'BROWSER'}</span><b>{panel.data?.title || 'Live browser context'}</b><p>{String(panel.data?.text || 'Browser ready.').slice(0, 2000)}</p></div>;
  return <pre className="j4-json">{JSON.stringify(panel.data || { query: panel.query }, null, 2)}</pre>;
}

function Panel({ panel, selected, onSelect, onMove, onClose, onAction }) {
  const drag = useRef(null), pos = panel.pos || { x: 20, y: 70 };
  const down = e => { if (e.target.closest('button')) return; onSelect(); drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = e => { if (!drag.current) return; onMove({ x: Math.max(6, e.clientX - drag.current.dx), y: Math.max(50, e.clientY - drag.current.dy) }); };
  return <section className={`j4-panel ${selected ? 'selected' : ''}`} style={{ transform: `translate(${pos.x}px,${pos.y}px)`, width: panel.size?.width, height: panel.size?.height, zIndex: selected ? 2147482800 : 2147482500 }} onPointerDown={onSelect}>
    <header onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}><span className="j4-live-dot" /><span>{panel.title || `${panel.panelType?.toUpperCase()} // LIVE`}</span><div className="j4-panel-actions">{panel.panelType === 'map' && <><button onClick={() => onAction({ action: 'map-command', target: 'map', command: 'zoom-out' })}>−</button><button onClick={() => onAction({ action: 'map-command', target: 'map', command: 'zoom-in' })}>+</button><button onClick={() => onAction({ action: 'resize', target: 'map', position: 'full' })}>□</button></>}<button onClick={onClose}>×</button></div></header>
    <div className="j4-panel-body"><GenericView panel={panel} /></div><footer><span>JARVIS REALTIME HUD</span><span>{panel.id.slice(-5).toUpperCase()}</span></footer>
  </section>;
}

function clientControl(text, rateRef, setRate) {
  const t = String(text || '').toLowerCase().trim().replace(/^hey\s+jarvis\s*[,.:;-]?\s*/, '');
  if (/^(stop talking|stop speaking|be quiet|mute|shut up|quiet)$/.test(t)) { window.speechSynthesis?.cancel(); return { reply: '', handled: true }; }
  if (/\b(?:talk|speak) faster\b/.test(t)) { const n = clamp(rateRef.current + 0.12, 0.85, 1.55); setRate(n); return { reply: 'Voice rate increased.', handled: true }; }
  if (/\b(?:talk|speak) slower\b/.test(t)) { const n = clamp(rateRef.current - 0.12, 0.85, 1.55); setRate(n); return { reply: 'Voice rate reduced.', handled: true }; }
  if (/\b(?:normal|default) (?:voice|speech) speed\b/.test(t)) { setRate(1.15); return { reply: 'Voice rate normalized.', handled: true }; }
  return null;
}

export default function JarvisExperienceV4() {
  const [health, setHealth] = useState({ realtime: false, core: false, model: '' });
  const [panels, setPanels] = useState([]), panelsRef = useRef([]);
  const [selectedId, setSelectedId] = useState(null), selectedRef = useRef(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false), voiceEnabledRef = useRef(false);
  const [voiceState, setVoiceState] = useState('OFF'), [lastHeard, setLastHeard] = useState('');
  const [voiceRate, setVoiceRateState] = useState(1.15), rateRef = useRef(1.15);
  const [latency, setLatency] = useState(null);
  const fetchRef = useRef(null), patchedRef = useRef(false), recRef = useRef(null), armedUntilRef = useRef(0), ignoreUntilRef = useRef(0);

  useEffect(() => { panelsRef.current = panels; }, [panels]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { voiceEnabledRef.current = voiceEnabled; try { localStorage.setItem(VOICE_KEY, voiceEnabled ? '1' : '0'); } catch {} }, [voiceEnabled]);
  const setRate = useCallback(n => { rateRef.current = n; setVoiceRateState(n); try { localStorage.setItem(RATE_KEY, String(n)); } catch {} }, []);
  useEffect(() => { try { const r = Number(localStorage.getItem(RATE_KEY)); if (r > 0) setRate(clamp(r, 0.85, 1.55)); setVoiceEnabled(localStorage.getItem(VOICE_KEY) === '1'); } catch {} }, [setRate]);

  const scene = useCallback(() => ({ selectedId: selectedRef.current, panels: panelsRef.current.map(p => ({ id: p.id, panelType: p.panelType, title: p.title, query: p.query })) }), []);
  const resolveIndex = useCallback((list, action) => {
    if (!list.length) return -1;
    if (action.panelId) { const exact = list.findIndex(p => p.id === action.panelId); if (exact >= 0) return exact; }
    const raw = String(action.target || action.panelId || action.panelType || 'selected').toLowerCase();
    if (['selected', 'that', 'it', 'this'].includes(raw) && selectedRef.current) { const x = list.findIndex(p => p.id === selectedRef.current); if (x >= 0) return x; }
    if (raw === 'first') return 0; if (raw === 'last') return list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].panelType === raw || list[i].title?.toLowerCase().includes(raw)) return i;
    return list.length - 1;
  }, []);
  const save = useCallback(() => { try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(panelsRef.current)); } catch {} }, []);
  const restore = useCallback(() => { try { const x = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || '[]'); if (Array.isArray(x)) { setPanels(x); setSelectedId(x.at(-1)?.id || null); } } catch {} }, []);
  const applyHud = useCallback(action => {
    if (!action) return;
    if (action.action === 'clear') { setPanels([]); setSelectedId(null); return; }
    if (action.action === 'save') { save(); return; }
    if (action.action === 'restore') { restore(); return; }
    setPanels(prev => {
      const list = [...prev]; let idx = resolveIndex(list, action);
      if (action.action === 'show') {
        const singleton = action.singleton || ['map', 'weather', 'system', 'media', 'briefing'].includes(action.panelType);
        if (singleton) idx = list.map((p, i) => ({ p, i })).reverse().find(x => x.p.panelType === action.panelType)?.i ?? -1;
        const id = idx >= 0 ? list[idx].id : `j4_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const current = idx >= 0 ? list[idx] : {};
        const panel = { ...current, ...action, id, pos: action.position ? preset(action.position) : current.pos || preset('center'), size: current.size || defaultSize(action.panelType), mapCommandSeq: current.mapCommandSeq || 0 };
        if (idx >= 0) list[idx] = panel; else list.push(panel);
        setTimeout(() => setSelectedId(id), 0); return list.slice(-12);
      }
      if (idx < 0) return list;
      if (action.action === 'remove') { const removed = list[idx].id; list.splice(idx, 1); if (selectedRef.current === removed) setTimeout(() => setSelectedId(list.at(-1)?.id || null), 0); return list; }
      if (action.action === 'move') { list[idx] = { ...list[idx], pos: preset(action.position || 'center') }; setTimeout(() => setSelectedId(list[idx].id), 0); return list; }
      if (action.action === 'resize') {
        const old = list[idx].size || defaultSize(list[idx].panelType);
        const size = action.position === 'full' ? { width: Math.max(320, window.innerWidth - 20), height: Math.max(280, window.innerHeight - 66) } : action.scale ? { width: clamp(Math.round(old.width * action.scale), 300, window.innerWidth - 18), height: clamp(Math.round(old.height * action.scale), 220, window.innerHeight - 70) } : { width: action.width || old.width, height: action.height || old.height };
        list[idx] = { ...list[idx], pos: action.position === 'full' ? preset('full') : list[idx].pos, size }; setTimeout(() => setSelectedId(list[idx].id), 0); return list;
      }
      if (action.action === 'map-command') { list[idx] = { ...list[idx], mapCommand: action.command, mapCommandSeq: (list[idx].mapCommandSeq || 0) + 1 }; setTimeout(() => setSelectedId(list[idx].id), 0); return list; }
      return list;
    });
  }, [resolveIndex, restore, save]);
  useEffect(() => { const fn = e => applyHud(e.detail); window.addEventListener('jarvis:hud', fn); return () => window.removeEventListener('jarvis:hud', fn); }, [applyHud]);

  useEffect(() => {
    if (!window.speechSynthesis) return;
    const synth = window.speechSynthesis, originalSpeak = synth.speak;
    synth.speak = function patchedJarvisSpeak(utterance) { try { utterance.rate = rateRef.current; } catch {} return originalSpeak.call(synth, utterance); };
    return () => { synth.speak = originalSpeak; };
  }, []);

  useEffect(() => {
    fetchRef.current = window.fetch.bind(window); const original = fetchRef.current; let alive = true;
    const check = async () => {
      const next = { realtime: false, core: false, model: '' };
      try { const r = await original(`${REALTIME}/health`, { signal: AbortSignal.timeout(1300) }); const d = await r.json(); next.realtime = r.ok; next.model = d.model || ''; } catch {}
      try { const r = await original(`${CORE}/health`, { signal: AbortSignal.timeout(1300) }); next.core = r.ok; } catch {}
      if (alive) setHealth(next);
    };
    check(); const timer = setInterval(check, 5000); return () => { alive = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (patchedRef.current || !fetchRef.current) return; patchedRef.current = true; const original = fetchRef.current;
    const bodyOf = options => { try { return JSON.parse(options?.body || '{}'); } catch { return {}; } };
    const latestText = body => String(body.message || body.messages?.[body.messages.length - 1]?.content || '');
    window.fetch = async function jarvisRealtimeFetch(input, options = {}) {
      const url = typeof input === 'string' ? input : input?.url || '';
      const endpoint = ['/api/chat', '/api/stream', '/api/agent'].find(x => url === x || url.endsWith(x));
      if (!endpoint) return original(input, options);
      const body = bodyOf(options), text = latestText(body);
      const cc = clientControl(text, rateRef, setRate);
      if (cc?.handled) {
        const reply = cc.reply || '';
        if (endpoint === '/api/stream') return new Response(`data: ${JSON.stringify({ meta: { model: 'instant/client' } })}\n\ndata: ${JSON.stringify({ token: reply })}\n\ndata: [DONE]\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        if (endpoint === '/api/agent') return new Response(`data: ${JSON.stringify({ type: 'reply', text: reply, model: 'instant/client' })}\n\ndata: ${JSON.stringify({ type: 'done' })}\n\n`, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
        return new Response(JSON.stringify({ reply, model: 'instant/client', local: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (endpoint === '/api/agent') {
        try { const r = await original(`${CORE}/v1/agent`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: options.signal }); if (r.ok) return r; } catch {}
        return original(input, options);
      }
      try {
        const started = performance.now();
        const r = await original(`${REALTIME}/v1/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, messages: body.messages || [], mode: body.mode, scene: scene() }), signal: options.signal });
        const d = await r.json(); setLatency(Math.round(performance.now() - started));
        if (d.clientAction === 'stop-speaking') window.speechSynthesis?.cancel();
        (d.hudActions || []).forEach(applyHud);
        const reply = d.reply || (d.error ? `Realtime error: ${d.error}` : 'Done.');
        if (endpoint === '/api/chat') return new Response(JSON.stringify({ reply, model: d.model || 'realtime', local: true, latencyMs: d.latencyMs }), { status: r.ok ? 200 : 503, headers: { 'Content-Type': 'application/json' } });
        const tokens = String(reply).match(/.{1,34}(?:\s|$)/g) || [String(reply)];
        const sse = [`data: ${JSON.stringify({ meta: { model: d.model || 'realtime' } })}\n\n`, ...tokens.map(token => `data: ${JSON.stringify({ token })}\n\n`), 'data: [DONE]\n\n'].join('');
        return new Response(sse, { status: r.ok ? 200 : 503, headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } });
      } catch (e) {
        return new Response(JSON.stringify({ reply: `Realtime core error: ${e.message}`, model: 'realtime/error' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
      }
    };
    return () => { window.fetch = original; patchedRef.current = false; };
  }, [applyHud, scene, setRate]);

  const speakDirect = useCallback(text => {
    if (!text || !window.speechSynthesis) return; window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = rateRef.current; u.pitch = 0.92; ignoreUntilRef.current = Date.now() + 1100; window.speechSynthesis.speak(u);
  }, []);
  const submitVoice = useCallback(command => {
    const text = String(command || '').trim(); if (!text) return;
    const cc = clientControl(text, rateRef, setRate); if (cc?.handled) { if (cc.reply) speakDirect(cc.reply); return; }
    setLastHeard(text); setVoiceState('COMMAND');
    const input = document.querySelector('.chat-input'), form = document.querySelector('.chat-input-form');
    if (!input || !form) { setVoiceState('ERROR'); return; }
    try {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set; setter?.call(input, text); input.dispatchEvent(new Event('input', { bubbles: true }));
      setTimeout(() => { try { form.requestSubmit(); setVoiceState('LISTENING'); } catch { setVoiceState('ERROR'); } }, 60);
    } catch { setVoiceState('ERROR'); }
  }, [setRate, speakDirect]);

  useEffect(() => {
    if (!voiceEnabled) { try { recRef.current?.stop(); } catch {} recRef.current = null; setVoiceState('OFF'); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceState('UNSUPPORTED'); return; }
    let active = true, timer = null;
    const start = () => {
      if (!active || !voiceEnabledRef.current) return;
      try {
        const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
        rec.onstart = () => setVoiceState('LISTENING');
        rec.onresult = e => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const result = e.results[i]; if (!result.isFinal) continue;
            const heard = String(result[0].transcript || '').trim(); if (!heard || Date.now() < ignoreUntilRef.current) continue;
            const lower = heard.toLowerCase(); setLastHeard(heard);
            if (/\b(?:stop talking|stop speaking|be quiet|mute|shut up)\b/.test(lower)) { window.speechSynthesis?.cancel(); armedUntilRef.current = 0; setVoiceState('LISTENING'); continue; }
            const wake = lower.match(/\bhey\s+jarvis\b/);
            if (wake) {
              const command = heard.slice((wake.index || 0) + wake[0].length).replace(/^[,.:;\-\s]+/, '').trim(); armedUntilRef.current = Date.now() + 12000;
              if (command) submitVoice(command); else { setVoiceState('AWAKE'); speakDirect('Yes, sir?'); }
              continue;
            }
            if (Date.now() < armedUntilRef.current) { armedUntilRef.current = 0; submitVoice(heard); }
          }
        };
        rec.onerror = e => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setVoiceState('MIC BLOCKED'); setVoiceEnabled(false); active = false; return; } setVoiceState('RECONNECTING'); };
        rec.onend = () => { recRef.current = null; if (active && voiceEnabledRef.current) timer = setTimeout(start, 260); };
        recRef.current = rec; rec.start();
      } catch { if (active) timer = setTimeout(start, 700); }
    };
    start(); return () => { active = false; clearTimeout(timer); try { recRef.current?.stop(); } catch {} recRef.current = null; };
  }, [voiceEnabled, speakDirect, submitVoice]);

  return <>
    <div className={`j4-status ${health.realtime ? 'online' : 'offline'}`}>
      <span className="j4-core-dot" /><div><b>{health.realtime ? 'JARVIS REALTIME' : 'REALTIME OFFLINE'}</b><small>{health.realtime ? `${health.model || 'LOCAL'}${latency != null ? ` // ${latency}ms` : ''}` : 'RESTART COMPANION'}</small></div>
      <button className={voiceEnabled ? 'active' : ''} onClick={() => setVoiceEnabled(v => !v)}>{voiceEnabled ? `VOICE ${voiceState}` : 'ENABLE VOICE'}</button>
      {panels.length > 0 && <><button onClick={save}>SAVE</button><button onClick={() => { setPanels([]); setSelectedId(null); }}>CLEAR</button></>}
    </div>
    {voiceEnabled && <div className={`j4-voice-pulse ${voiceState.toLowerCase().replace(/\s+/g, '-')}`}><span />{voiceState}{lastHeard ? <small>{lastHeard.slice(0, 68)}</small> : null}<em>{voiceRate.toFixed(2)}×</em></div>}
    <div className="j4-workspace">{panels.map(p => <Panel key={p.id} panel={p} selected={p.id === selectedId} onSelect={() => setSelectedId(p.id)} onMove={pos => setPanels(prev => prev.map(x => x.id === p.id ? { ...x, pos } : x))} onClose={() => applyHud({ action: 'remove', panelId: p.id })} onAction={applyHud} />)}</div>
  </>;
}
