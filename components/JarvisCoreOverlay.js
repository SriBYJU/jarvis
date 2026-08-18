import { useCallback, useEffect, useRef, useState } from "react";

const CORE = "http://127.0.0.1:3003";
const STORAGE_KEY = "jarvis.hud.workspace.v3";

function dispatchHud(actions) {
  if (typeof window === "undefined") return;
  (Array.isArray(actions) ? actions : actions ? [actions] : []).forEach(action => window.dispatchEvent(new CustomEvent("jarvis:hud", { detail: action })));
}
function preset(name = "center", index = 0) {
  const w = typeof window !== "undefined" ? window.innerWidth : 1200;
  const h = typeof window !== "undefined" ? window.innerHeight : 800;
  const panelW = Math.min(420, w - 24), panelH = 310, gap = 16;
  const spots = {
    left: { x: gap, y: 90 + index * 18 }, right: { x: Math.max(gap, w - panelW - gap), y: 90 + index * 18 },
    center: { x: Math.max(gap, (w - panelW) / 2), y: 100 + index * 16 },
    "top-left": { x: gap, y: 64 }, "top-right": { x: Math.max(gap, w - panelW - gap), y: 64 },
    "bottom-left": { x: gap, y: Math.max(64, h - panelH - gap) }, "bottom-right": { x: Math.max(gap, w - panelW - gap), y: Math.max(64, h - panelH - gap) },
    full: { x: gap, y: 58 },
  };
  return spots[name] || spots.center;
}
function HoloMap({ query }) {
  const [coords, setCoords] = useState(null);
  useEffect(() => {
    let live = true; const q = query || "London";
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`).then(r => r.json()).then(d => {
      const x = d.results?.[0]; if (live && x) setCoords({ lat: x.latitude, lon: x.longitude, name: x.name, country: x.country });
    }).catch(() => {});
    return () => { live = false; };
  }, [query]);
  if (!coords) return <div className="jc-map-loading"><div className="jc-scan-ring" />SCANNING GEO // {query}</div>;
  const span = 0.08; const bbox = `${coords.lon - span},${coords.lat - span},${coords.lon + span},${coords.lat + span}`;
  return <div className="jc-holo-map"><iframe title={`Map of ${coords.name}`} src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${coords.lat}%2C${coords.lon}`} /><div className="jc-map-grid" /><div className="jc-map-scan" /><div className="jc-map-readout">{coords.name?.toUpperCase()} // {coords.lat.toFixed(4)}° / {coords.lon.toFixed(4)}°</div></div>;
}
function WeatherView({ data }) {
  const w = data?.current || data?.data?.current || {}; const location = data?.location || data?.data?.location || {};
  return <div className="jc-metric-grid"><div><b>{Math.round(w.temperature_2m ?? 0)}°F</b><span>{location.name || "CURRENT"}</span></div><div><b>{Math.round(w.apparent_temperature ?? 0)}°</b><span>FEELS LIKE</span></div><div><b>{w.relative_humidity_2m ?? "—"}%</b><span>HUMIDITY</span></div><div><b>{Math.round(w.wind_speed_10m ?? 0)}</b><span>WIND MPH</span></div></div>;
}
function SystemView({ data }) {
  const d = data?.data || data || {}; const gb = n => n ? (n / 1073741824).toFixed(1) : "—";
  return <div className="jc-system-list"><div><span>HOST</span><b>{d.hostname || "LOCAL"}</b></div><div><span>CPU</span><b>{d.cpu || "—"}</b></div><div><span>CORES</span><b>{d.cores ?? "—"}</b></div><div><span>MEMORY</span><b>{d.memoryUsagePercent ?? "—"}% / {gb(d.totalMemory)} GB</b></div><div><span>OS</span><b>{d.platform || "—"} {d.release || ""}</b></div></div>;
}
function MissionView({ data }) { const d = data?.data || data || {}; return <div className="jc-mission"><div className={`jc-mission-state ${d.status || "queued"}`}>{String(d.status || "queued").toUpperCase()}</div><div className="jc-mission-objective">{d.objective || "Background mission"}</div><div className="jc-mission-agent">AGENT // {(d.agent || "jarvis").toUpperCase()}</div></div>; }
function GenericView({ panel }) {
  if (panel.panelType === "map") return <HoloMap query={panel.query || panel.data?.query} />;
  if (panel.panelType === "weather") return <WeatherView data={panel.data} />;
  if (panel.panelType === "system") return <SystemView data={panel.data} />;
  if (panel.panelType === "mission") return <MissionView data={panel.data} />;
  if (panel.panelType === "media") return <div className="jc-media"><div className="jc-media-orb">♪</div><div>{panel.data?.status || panel.query || "MEDIA READY"}</div></div>;
  if (panel.data?.url) return <iframe className="jc-frame" title={panel.title || "JARVIS panel"} src={panel.data.url} />;
  return <pre className="jc-json">{JSON.stringify(panel.data || { query: panel.query }, null, 2)}</pre>;
}
function Panel({ panel, onClose, onMove, onFocus }) {
  const drag = useRef(null); const pos = panel.pos || { x: 24, y: 80 };
  const down = e => { if (e.target.closest("button")) return; onFocus(); drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const move = e => { if (!drag.current) return; onMove({ x: Math.max(8, e.clientX - drag.current.dx), y: Math.max(54, e.clientY - drag.current.dy) }); };
  return <section className="jc-panel" style={{ transform: `translate(${pos.x}px, ${pos.y}px)`, zIndex: panel.z || 30, width: panel.size?.width || undefined, height: panel.size?.height || undefined }} onPointerDown={down} onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
    <header><span className="jc-dot" /><span>{panel.title || `${panel.panelType || "DATA"} // LIVE`}</span><button onClick={onClose}>×</button></header><div className="jc-panel-body"><GenericView panel={panel} /></div><footer><span>JARVIS HUD</span><span>{panel.id?.slice(-6)?.toUpperCase()}</span></footer>
  </section>;
}

export default function JarvisCoreOverlay() {
  const [health, setHealth] = useState({ online: false, ollama: false, model: "", agents: 0 });
  const [panels, setPanels] = useState([]); const panelsRef = useRef([]); const onlineRef = useRef(false); const nativeFetchRef = useRef(null); const patchedRef = useRef(false);
  useEffect(() => { panelsRef.current = panels; }, [panels]);
  const findIndex = (list, action) => {
    if (action.panelId) return list.findIndex(p => p.id === action.panelId);
    const target = String(action.target || action.panelType || "last").toLowerCase();
    if (target === "first") return list.length ? 0 : -1; if (["last", "selected", "that", "it"].includes(target)) return list.length - 1;
    const byType = list.map((p, i) => ({ p, i })).reverse().find(x => x.p.panelType === target || x.p.title?.toLowerCase().includes(target)); return byType?.i ?? list.length - 1;
  };
  const save = useCallback(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(panelsRef.current)); } catch {} }, []);
  const restore = useCallback(() => { try { const x = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); if (Array.isArray(x)) setPanels(x); } catch {} }, []);
  const applyHud = useCallback(action => {
    if (!action) return; if (action.action === "clear") return setPanels([]); if (action.action === "save") { save(); return; } if (action.action === "restore") { restore(); return; }
    setPanels(prev => {
      const list = [...prev]; const idx = findIndex(list, action);
      if (action.action === "remove") { if (idx >= 0) list.splice(idx, 1); return list; }
      if (action.action === "move" && idx >= 0) { list[idx] = { ...list[idx], pos: preset(action.position || "center", idx) }; return list; }
      if (action.action === "resize" && idx >= 0) {
        if (action.position === "full" || action.target === "full") list[idx] = { ...list[idx], pos: preset("full"), size: { width: Math.max(320, window.innerWidth - 32), height: Math.max(260, window.innerHeight - 84) } };
        else list[idx] = { ...list[idx], size: { width: action.width || list[idx].size?.width || 520, height: action.height || list[idx].size?.height || 360 } };
        return list;
      }
      if (action.action === "show") {
        const n = list.length; const position = action.position || "center"; const panel = { ...action, id: action.id || `hud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, pos: preset(position, n), size: position === "full" ? { width: Math.max(320, window.innerWidth - 32), height: Math.max(260, window.innerHeight - 84) } : undefined, z: Date.now() % 100000 };
        return [...list, panel].slice(-10);
      }
      return list;
    });
  }, [restore, save]);
  useEffect(() => { const fn = e => applyHud(e.detail); window.addEventListener("jarvis:hud", fn); return () => window.removeEventListener("jarvis:hud", fn); }, [applyHud]);

  useEffect(() => {
    nativeFetchRef.current = window.fetch.bind(window); let active = true;
    const check = async () => { try { const r = await nativeFetchRef.current(`${CORE}/health`, { signal: AbortSignal.timeout(1800) }); const d = await r.json(); const next = { online: r.ok, ollama: Boolean(d.ollama?.online), model: d.ollama?.models?.[0] || "", agents: d.agents?.length || 0 }; if (active) { setHealth(next); onlineRef.current = next.online; } } catch { if (active) { const next = { online: false, ollama: false, model: "", agents: 0 }; setHealth(next); onlineRef.current = false; } } };
    check(); const timer = setInterval(check, 8000); return () => { active = false; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (patchedRef.current || !nativeFetchRef.current) return; patchedRef.current = true; const original = nativeFetchRef.current;
    const bodyOf = options => { try { return JSON.parse(options?.body || "{}"); } catch { return {}; } };
    window.fetch = async function jarvisFetch(input, options = {}) {
      const url = typeof input === "string" ? input : input?.url || ""; const match = ["/api/chat", "/api/stream", "/api/agent"].find(x => url === x || url.endsWith(x));
      if (!onlineRef.current || !match) return original(input, options); const body = bodyOf(options);
      if (match === "/api/agent") {
        try {
          const r = await original(`${CORE}/v1/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: options.signal }); if (!r.ok || !r.body) return original(input, options);
          const decoder = new TextDecoder(); let buffer = "";
          const stream = r.body.pipeThrough(new TransformStream({ transform(chunk, controller) { buffer += decoder.decode(chunk, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || ""; for (const line of lines) { if (!line.startsWith("data: ")) continue; try { const e = JSON.parse(line.slice(6)); if (e.type === "hud" && e.action) dispatchHud(e.action); } catch {} } controller.enqueue(chunk); } }));
          return new Response(stream, { status: r.status, headers: r.headers });
        } catch { return original(input, options); }
      }
      try {
        const payload = { ...body, message: body.messages?.[body.messages.length - 1]?.content || "" }; const r = await original(`${CORE}/v1/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: options.signal });
        if (!r.ok) return original(input, options); const d = await r.json(); dispatchHud(d.hudActions || []);
        if (match === "/api/chat") return new Response(JSON.stringify({ reply: d.reply, model: d.model, tool: d.tool || null, local: true }), { status: 200, headers: { "Content-Type": "application/json" } });
        const chunks = String(d.reply || "").match(/.{1,28}(?:\s|$)/g) || [String(d.reply || "")]; const sse = [`data: ${JSON.stringify({ meta: { model: d.model || "local" } })}\n\n`, ...chunks.map(token => `data: ${JSON.stringify({ token })}\n\n`), "data: [DONE]\n\n"].join("");
        return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
      } catch { return original(input, options); }
    };
    return () => { window.fetch = original; patchedRef.current = false; };
  }, []);

  return <><div className={`jc-core-badge ${health.online ? "online" : "offline"}`} title={health.online ? "Local JARVIS Core connected" : "Local core offline — cloud fallback remains available"}><span className="jc-core-pulse" /><div><b>{health.online ? "LOCAL CORE" : "CLOUD FALLBACK"}</b><small>{health.online ? (health.ollama ? `${health.agents} AGENTS // UNLIMITED AI` : "CORE ONLINE // START OLLAMA") : "COMPANION OFFLINE"}</small></div>{panels.length > 0 && <div className="jc-mini-controls"><button onClick={save}>SAVE</button><button onClick={restore}>LOAD</button><button onClick={() => setPanels([])}>CLEAR</button></div>}</div><div className="jc-workspace-layer">{panels.map((p, i) => <Panel key={p.id} panel={{ ...p, z: 40 + i }} onClose={() => setPanels(prev => prev.filter(x => x.id !== p.id))} onMove={pos => setPanels(prev => prev.map(x => x.id === p.id ? { ...x, pos } : x))} onFocus={() => setPanels(prev => [...prev.filter(x => x.id !== p.id), p])} />)}</div></>;
}
