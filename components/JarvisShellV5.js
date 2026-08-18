import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const REALTIME = 'http://127.0.0.1:3007';
const CORE = 'http://127.0.0.1:3003';
const WORKSPACE_KEY = 'jarvis.v5.workspace';
const VOICE_KEY = 'jarvis.v5.voice';
const RATE_KEY = 'jarvis.v5.rate';

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function id(prefix = 'j5') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; }
function timeLabel(ts = Date.now()) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function defaultSize(type) {
  if (typeof window === 'undefined') return { width: 560, height: 380 };
  if (type === 'map') return { width: Math.min(660, window.innerWidth - 40), height: Math.min(470, window.innerHeight - 130) };
  return { width: Math.min(520, window.innerWidth - 40), height: 340 };
}
function preset(name = 'center', size = { width: 560, height: 380 }) {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const h = typeof window !== 'undefined' ? window.innerHeight : 800;
  const g = 18, top = 68;
  const right = Math.max(g, w - size.width - g);
  const bottom = Math.max(top, h - size.height - 70);
  const spots = {
    center: { x: Math.max(g, (w - size.width) / 2), y: Math.max(top, (h - size.height) / 2) },
    left: { x: g, y: top }, right: { x: right, y: top },
    'top-left': { x: g, y: top }, 'top-right': { x: right, y: top },
    'bottom-left': { x: g, y: bottom }, 'bottom-right': { x: right, y: bottom },
    full: { x: 10, y: 56 },
  };
  return spots[name] || spots.center;
}

function HoloMap({ panel }) {
  const hostRef = useRef(null), mapRef = useRef(null), markerRef = useRef(null), commandRef = useRef(0);
  const [status, setStatus] = useState('LOCATING');
  const [error, setError] = useState('');
  const [location, setLocation] = useState(null);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    const timer = setTimeout(() => { if (live) { setStatus('ERROR'); setError('Map timed out.'); } }, 6000);
    setStatus('LOCATING'); setError('');
    fetch(`${REALTIME}/v1/geocode?q=${encodeURIComponent(panel.query || 'London')}`, { signal: controller.signal })
      .then(async r => { const d = await r.json(); if (!r.ok || !d.location) throw new Error(d.error || 'Location unavailable'); return d.location; })
      .then(loc => {
        if (!live || !hostRef.current) return;
        const ml = window.maplibregl;
        if (!ml?.Map) throw new Error('Map runtime unavailable');
        clearTimeout(timer); setLocation(loc); setStatus('RENDERING');
        const center = [loc.longitude, loc.latitude];
        if (!mapRef.current) {
          const map = new ml.Map({ container: hostRef.current, center, zoom: 11.5, bearing: 0 });
          mapRef.current = map;
          map.on('load', () => { if (live) setStatus('LIVE'); });
          markerRef.current = new ml.Marker({ color: '#69ddff', scale: 0.9 }).setLngLat(center).addTo(map);
        } else {
          markerRef.current?.setLngLat(center);
          mapRef.current.flyTo({ center, zoom: Math.max(mapRef.current.getZoom(), 10.5) });
          setStatus('LIVE');
        }
      })
      .catch(e => { if (live && e.name !== 'AbortError') { clearTimeout(timer); setStatus('ERROR'); setError(e.message); } });
    return () => { live = false; clearTimeout(timer); controller.abort(); };
  }, [panel.query]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || panel.mapCommandSeq === commandRef.current) return;
    commandRef.current = panel.mapCommandSeq || 0;
    if (panel.mapCommand === 'zoom-in') map.zoomIn();
    if (panel.mapCommand === 'zoom-out') map.zoomOut();
  }, [panel.mapCommand, panel.mapCommandSeq]);

  useEffect(() => {
    if (!hostRef.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => mapRef.current?.resize());
    ro.observe(hostRef.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => () => { try { markerRef.current?.remove(); mapRef.current?.remove(); } catch {} }, []);

  return <div className="j5-map-shell">
    <div ref={hostRef} className="j5-map-canvas" />
    <div className="j5-map-grid" /><div className="j5-map-scan" /><div className="j5-map-vignette" />
    <div className="j5-reticle"><i /><i /></div>
    <div className={`j5-map-status ${error ? 'error' : ''}`}>{status}{error ? ` // ${error}` : location ? ` // ${location.name?.toUpperCase()}${location.admin1 ? `, ${location.admin1.toUpperCase()}` : ''}` : ''}</div>
  </div>;
}

function SystemView({ data }) {
  const d = data?.data || data || {};
  const gb = n => n ? (n / 1073741824).toFixed(1) : '—';
  return <div className="j5-metrics">
    <div><b>{d.memoryUsagePercent ?? '—'}%</b><span>MEMORY</span></div>
    <div><b>{d.cores ?? '—'}</b><span>CPU CORES</span></div>
    <div><b>{gb(d.freeMemory)}</b><span>GB FREE</span></div>
    <div><b>{d.platform || '—'}</b><span>PLATFORM</span></div>
    <p>{d.cpu || 'Local system'}</p>
  </div>;
}
function WeatherView({ data }) {
  const d = data?.data || data || {}, c = d.current || {}, loc = d.location || {};
  return <div className="j5-metrics">
    <div><b>{c.temperature_2m != null ? `${Math.round(c.temperature_2m)}°` : '—'}</b><span>{loc.name || 'WEATHER'}</span></div>
    <div><b>{c.apparent_temperature != null ? `${Math.round(c.apparent_temperature)}°` : '—'}</b><span>FEELS</span></div>
    <div><b>{c.relative_humidity_2m ?? '—'}%</b><span>HUMIDITY</span></div>
    <div><b>{c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : '—'}</b><span>WIND MPH</span></div>
  </div>;
}
function BriefingView({ data }) {
  const d = data?.data || data || {}, m = d.missions || {};
  return <div className="j5-brief"><div><b>{m.active?.length || 0}</b><span>ACTIVE</span></div><div><b>{m.completed?.length || 0}</b><span>DONE</span></div><div><b>{m.blocked?.length || 0}</b><span>CHECK</span></div>{m.active?.slice(0, 4).map(x => <p key={x.id}>◉ {x.objective}</p>)}</div>;
}
function PanelBody({ panel }) {
  if (panel.panelType === 'map') return <HoloMap panel={panel} />;
  if (panel.panelType === 'system') return <SystemView data={panel.data} />;
  if (panel.panelType === 'weather') return <WeatherView data={panel.data} />;
  if (panel.panelType === 'briefing') return <BriefingView data={panel.data} />;
  if (panel.panelType === 'media') return <div className="j5-media"><div>♫</div><b>{panel.data?.track?.name || 'SPOTIFY'}</b><span>{panel.data?.status || 'MEDIA LINK'}</span></div>;
  if (panel.panelType === 'browser') return <div className="j5-browser"><small>{panel.data?.url || 'BROWSER'}</small><b>{panel.data?.title || 'Browser context'}</b><p>{String(panel.data?.text || 'Browser ready.').slice(0, 1800)}</p></div>;
  return <pre className="j5-json">{JSON.stringify(panel.data || { query: panel.query }, null, 2)}</pre>;
}

function HudPanel({ panel, selected, onSelect, onMove, onClose, onAction }) {
  const drag = useRef(null);
  const pos = panel.pos || { x: 20, y: 80 };
  const down = e => {
    if (e.target.closest('button')) return;
    onSelect();
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = e => {
    if (!drag.current) return;
    onMove({ x: Math.max(6, e.clientX - drag.current.dx), y: Math.max(56, e.clientY - drag.current.dy) });
  };
  return <section className={`j5-panel ${selected ? 'selected' : ''}`} style={{ transform: `translate(${pos.x}px,${pos.y}px)`, width: panel.size?.width, height: panel.size?.height, zIndex: selected ? 80 : 60 }} onPointerDown={onSelect}>
    <header onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
      <span className="j5-dot" /><span>{panel.title || `${panel.panelType?.toUpperCase()} // LIVE`}</span>
      <div>{panel.panelType === 'map' && <><button onClick={() => onAction({ action: 'map-command', target: 'map', command: 'zoom-out' })}>−</button><button onClick={() => onAction({ action: 'map-command', target: 'map', command: 'zoom-in' })}>+</button><button onClick={() => onAction({ action: 'resize', target: 'map', position: 'full' })}>□</button></>}<button onClick={onClose}>×</button></div>
    </header>
    <main><PanelBody panel={panel} /></main>
    <footer><span>JARVIS // REALTIME HUD</span><span>{panel.id.slice(-4).toUpperCase()}</span></footer>
  </section>;
}

export default function JarvisShellV5() {
  const [messages, setMessages] = useState([{ role: 'assistant', content: 'JARVIS online. What do you need?', ts: Date.now(), model: 'local' }]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [health, setHealth] = useState({ realtime: false, core: false, model: '' });
  const [latency, setLatency] = useState(null);
  const [panels, setPanels] = useState([]), panelsRef = useRef([]);
  const [selectedId, setSelectedId] = useState(null), selectedRef = useRef(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false), voiceRef = useRef(false);
  const [voiceState, setVoiceState] = useState('OFF');
  const [lastHeard, setLastHeard] = useState('');
  const [rate, setRateState] = useState(1.18), rateRef = useRef(1.18);
  const chatRef = useRef(null), recRef = useRef(null), armedUntil = useRef(0), ignoreSpeech = useRef(false), abortRef = useRef(null);

  useEffect(() => { panelsRef.current = panels; }, [panels]);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);
  useEffect(() => { voiceRef.current = voiceEnabled; try { localStorage.setItem(VOICE_KEY, voiceEnabled ? '1' : '0'); } catch {} }, [voiceEnabled]);
  useEffect(() => { rateRef.current = rate; try { localStorage.setItem(RATE_KEY, String(rate)); } catch {} }, [rate]);
  useEffect(() => { try { setVoiceEnabled(localStorage.getItem(VOICE_KEY) === '1'); const r = Number(localStorage.getItem(RATE_KEY)); if (r > 0) setRateState(clamp(r, .9, 1.5)); } catch {} }, []);
  useEffect(() => { if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages, thinking]);

  const scene = useCallback(() => ({ selectedId: selectedRef.current, panels: panelsRef.current.map(p => ({ id: p.id, panelType: p.panelType, title: p.title, query: p.query })) }), []);
  const resolveIndex = useCallback((list, action) => {
    if (!list.length) return -1;
    if (action.panelId) { const x = list.findIndex(p => p.id === action.panelId); if (x >= 0) return x; }
    const raw = String(action.target || action.panelType || 'selected').toLowerCase();
    if (['selected', 'that', 'it', 'this'].includes(raw) && selectedRef.current) { const x = list.findIndex(p => p.id === selectedRef.current); if (x >= 0) return x; }
    if (raw === 'first') return 0; if (raw === 'last') return list.length - 1;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].panelType === raw || list[i].title?.toLowerCase().includes(raw)) return i;
    return list.length - 1;
  }, []);
  const saveWorkspace = useCallback(() => { try { localStorage.setItem(WORKSPACE_KEY, JSON.stringify(panelsRef.current)); } catch {} }, []);
  const restoreWorkspace = useCallback(() => { try { const x = JSON.parse(localStorage.getItem(WORKSPACE_KEY) || '[]'); if (Array.isArray(x)) { setPanels(x); setSelectedId(x.at(-1)?.id || null); } } catch {} }, []);

  const applyHud = useCallback(action => {
    if (!action) return;
    if (action.action === 'clear') { setPanels([]); setSelectedId(null); return; }
    if (action.action === 'save') { saveWorkspace(); return; }
    if (action.action === 'restore') { restoreWorkspace(); return; }
    setPanels(prev => {
      const list = [...prev]; let idx = resolveIndex(list, action);
      if (action.action === 'show') {
        if (action.singleton || ['map', 'weather', 'system', 'media', 'briefing'].includes(action.panelType)) {
          for (let i = list.length - 1; i >= 0; i--) if (list[i].panelType === action.panelType) { idx = i; break; }
        }
        const current = idx >= 0 ? list[idx] : {};
        const size = current.size || defaultSize(action.panelType);
        const panelId = idx >= 0 ? current.id : id('panel');
        const panel = { ...current, ...action, id: panelId, size, pos: action.position ? preset(action.position, size) : current.pos || preset('center', size), mapCommandSeq: current.mapCommandSeq || 0 };
        if (idx >= 0) list[idx] = panel; else list.push(panel);
        setTimeout(() => setSelectedId(panelId), 0);
        return list.slice(-10);
      }
      if (idx < 0) return list;
      if (action.action === 'remove') { const removed = list[idx].id; list.splice(idx, 1); if (removed === selectedRef.current) setTimeout(() => setSelectedId(list.at(-1)?.id || null), 0); return list; }
      if (action.action === 'move') { const size = list[idx].size || defaultSize(list[idx].panelType); list[idx] = { ...list[idx], pos: preset(action.position || 'center', size) }; setTimeout(() => setSelectedId(list[idx].id), 0); return list; }
      if (action.action === 'resize') {
        const old = list[idx].size || defaultSize(list[idx].panelType);
        const size = action.position === 'full' ? { width: Math.max(340, window.innerWidth - 20), height: Math.max(300, window.innerHeight - 68) } : action.scale ? { width: clamp(Math.round(old.width * action.scale), 320, window.innerWidth - 20), height: clamp(Math.round(old.height * action.scale), 230, window.innerHeight - 70) } : { width: action.width || old.width, height: action.height || old.height };
        list[idx] = { ...list[idx], size, pos: action.position === 'full' ? preset('full', size) : list[idx].pos }; setTimeout(() => setSelectedId(list[idx].id), 0); return list;
      }
      if (action.action === 'map-command') { list[idx] = { ...list[idx], mapCommand: action.command, mapCommandSeq: (list[idx].mapCommandSeq || 0) + 1 }; setTimeout(() => setSelectedId(list[idx].id), 0); return list; }
      return list;
    });
  }, [resolveIndex, restoreWorkspace, saveWorkspace]);

  const stopTalking = useCallback(() => { window.speechSynthesis?.cancel(); ignoreSpeech.current = false; setVoiceState(voiceRef.current ? 'LISTENING' : 'OFF'); }, []);
  const speak = useCallback(text => {
    if (!text || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).slice(0, 500));
    u.rate = rateRef.current; u.pitch = .92;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /Daniel|Google UK English Male|Microsoft David|Microsoft Ryan/i.test(v.name)) || voices.find(v => /^en-GB/i.test(v.lang)) || voices.find(v => /^en/i.test(v.lang));
    if (preferred) u.voice = preferred;
    u.onstart = () => { ignoreSpeech.current = true; setVoiceState('SPEAKING'); };
    u.onend = () => { ignoreSpeech.current = false; setVoiceState(voiceRef.current ? 'LISTENING' : 'OFF'); };
    u.onerror = () => { ignoreSpeech.current = false; setVoiceState(voiceRef.current ? 'LISTENING' : 'OFF'); };
    window.speechSynthesis.speak(u);
  }, []);

  const sendCommand = useCallback(async (raw, fromVoice = false) => {
    const text = String(raw || '').trim();
    if (!text || thinking) return;
    if (/^(?:stop talking|stop speaking|be quiet|mute|shut up|quiet|stop)$/i.test(text.replace(/^hey\s+jarvis\s*[,.:;-]?\s*/i, ''))) { stopTalking(); return; }
    const userMsg = { role: 'user', content: text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]); setInput(''); setThinking(true);
    if (fromVoice) setVoiceState('WORKING');
    const started = performance.now();
    try {
      abortRef.current = new AbortController();
      const history = [...messages.slice(-6), userMsg].map(m => ({ role: m.role, content: m.content }));
      const r = await fetch(`${REALTIME}/v1/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, messages: history, scene: scene() }), signal: abortRef.current.signal });
      const d = await r.json().catch(() => ({}));
      setLatency(Math.round(performance.now() - started));
      if (d.clientAction === 'stop-speaking') stopTalking();
      (d.hudActions || []).forEach(applyHud);
      const reply = d.reply || (r.ok ? 'Done.' : 'I hit a local error.');
      if (reply) { setMessages(prev => [...prev, { role: 'assistant', content: reply, ts: Date.now(), model: d.model || 'realtime' }]); speak(reply); }
    } catch (e) {
      if (e.name !== 'AbortError') setMessages(prev => [...prev, { role: 'assistant', content: 'I lost the local connection. Restart the companion and I’ll reconnect.', ts: Date.now(), model: 'local/error' }]);
    } finally { setThinking(false); abortRef.current = null; if (fromVoice && !ignoreSpeech.current) setVoiceState(voiceRef.current ? 'LISTENING' : 'OFF'); }
  }, [applyHud, messages, scene, speak, stopTalking, thinking]);

  useEffect(() => {
    let active = true;
    async function check() {
      const next = { realtime: false, core: false, model: '' };
      try { const r = await fetch(`${REALTIME}/health`, { signal: AbortSignal.timeout(1000) }); const d = await r.json(); next.realtime = r.ok; next.model = d.model || ''; } catch {}
      try { next.core = (await fetch(`${CORE}/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
      if (active) setHealth(next);
    }
    check(); const t = setInterval(check, 5000); return () => { active = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    if (!voiceEnabled) { try { recRef.current?.stop(); } catch {} recRef.current = null; setVoiceState('OFF'); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setVoiceState('UNSUPPORTED'); return; }
    let active = true, timer;
    const start = () => {
      if (!active || !voiceRef.current) return;
      try {
        const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
        rec.onstart = () => { if (!ignoreSpeech.current) setVoiceState('LISTENING'); };
        rec.onresult = e => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (!e.results[i].isFinal) continue;
            const heard = String(e.results[i][0].transcript || '').trim();
            if (!heard || ignoreSpeech.current) continue;
            const lower = heard.toLowerCase(); setLastHeard(heard);
            if (/\b(?:stop talking|stop speaking|be quiet|mute|shut up)\b/.test(lower)) { stopTalking(); armedUntil.current = 0; continue; }
            const wake = lower.match(/\bhey\s+jarvis\b/);
            if (wake) {
              const command = heard.slice((wake.index || 0) + wake[0].length).replace(/^[,.:;\-\s]+/, '').trim();
              armedUntil.current = Date.now() + 12000;
              if (command) { armedUntil.current = 0; sendCommand(command, true); }
              else { setVoiceState('AWAKE'); speak('Yes, sir?'); }
              continue;
            }
            if (Date.now() < armedUntil.current) { armedUntil.current = 0; sendCommand(heard, true); }
          }
        };
        rec.onerror = e => {
          if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { setVoiceState('MIC BLOCKED'); setVoiceEnabled(false); active = false; return; }
          if (!ignoreSpeech.current) setVoiceState('RECONNECTING');
        };
        rec.onend = () => { recRef.current = null; if (active && voiceRef.current) timer = setTimeout(start, 300); };
        recRef.current = rec; rec.start();
      } catch { timer = setTimeout(start, 700); }
    };
    start();
    return () => { active = false; clearTimeout(timer); try { recRef.current?.stop(); } catch {} recRef.current = null; };
  }, [sendCommand, speak, stopTalking, voiceEnabled]);

  useEffect(() => {
    const fn = e => { if (e.key === 'Escape') { stopTalking(); abortRef.current?.abort(); setThinking(false); } };
    window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn);
  }, [stopTalking]);

  const statusText = useMemo(() => health.realtime ? `REALTIME // ${health.model || 'LOCAL'}${latency != null ? ` // ${latency}ms` : ''}` : 'REALTIME OFFLINE', [health, latency]);

  return <div className="j5-root">
    <div className="j5-bg-grid" /><div className="j5-corner c1" /><div className="j5-corner c2" /><div className="j5-corner c3" /><div className="j5-corner c4" />
    <header className="j5-topbar">
      <div className="j5-brand"><span className="j5-dot" /><div><b>J.A.R.V.I.S.</b><small>JUST A RATHER VERY INTELLIGENT SYSTEM</small></div></div>
      <div className={`j5-health ${health.realtime ? 'online' : 'offline'}`}><span />{statusText}</div>
      <div className="j5-top-actions"><button className={voiceEnabled ? 'active' : ''} onClick={() => setVoiceEnabled(v => !v)}>{voiceEnabled ? `VOICE // ${voiceState}` : 'ENABLE VOICE'}</button><button onClick={() => setRateState(r => clamp(r + .1, .9, 1.5))}>VOICE +</button><button onClick={stopTalking}>MUTE</button></div>
    </header>

    <aside className="j5-left-rail">
      <div className={`j5-orb ${thinking ? 'thinking' : voiceState === 'AWAKE' ? 'awake' : ''}`}><div /><span /></div>
      <div className="j5-rail-readout"><small>CORE</small><b>{health.core ? 'ONLINE' : 'OFFLINE'}</b></div>
      <div className="j5-rail-readout"><small>VOICE</small><b>{voiceState}</b></div>
      <div className="j5-rail-readout"><small>SCENE</small><b>{panels.length} PANELS</b></div>
      {lastHeard && <div className="j5-heard">HEARD // {lastHeard.slice(0, 82)}</div>}
    </aside>

    <div className="j5-workspace">{panels.map(p => <HudPanel key={p.id} panel={p} selected={p.id === selectedId} onSelect={() => setSelectedId(p.id)} onMove={pos => setPanels(prev => prev.map(x => x.id === p.id ? { ...x, pos } : x))} onClose={() => applyHud({ action: 'remove', panelId: p.id })} onAction={applyHud} />)}</div>

    <section className="j5-console">
      <div className="j5-chat" ref={chatRef}>
        {messages.map((m, i) => <div key={`${m.ts}_${i}`} className={`j5-msg ${m.role}`}><div>{m.content}</div><small>{timeLabel(m.ts)}{m.model && m.role === 'assistant' ? ` // ${m.model.replace('realtime/', '')}` : ''}</small></div>)}
        {thinking && <div className="j5-thinking"><span /><span /><span /> PROCESSING</div>}
      </div>
      <form className="j5-inputbar" onSubmit={e => { e.preventDefault(); sendCommand(input); }}>
        <span>›</span><input value={input} onChange={e => setInput(e.target.value)} autoFocus placeholder="Talk to JARVIS naturally…" /><button disabled={!input.trim() || thinking}>SEND</button>
      </form>
      <div className="j5-hints"><span>Try: “Hey Jarvis, pull up London”</span><span>“Move that top right”</span><span>“Make it full screen”</span><span>“Stop talking”</span></div>
    </section>
  </div>;
}
