import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";

/* ── Personas ─────────────────────────────────────────────────────── */
const PERSONAS = {
  jarvis: {
    name: "J.A.R.V.I.S.", subtitle: "Just A Rather Very Intelligent System",
    color: "#7ecfff", accent: "#1a7aff", glow: "rgba(26,122,255,0.5)",
    system: `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System, the personal AI assistant built by Tony Stark. You speak with a refined British accent and dry wit. You are brilliant, efficient, subtly sarcastic, and fiercely loyal. You address the user as "sir" or "ma'am" naturally. You have a genius-level intellect and can handle absolutely any task — coding, research, analysis, creative writing, math, planning, conversation, debates, advice, and more. You are not just a tool, you are a companion and advisor. You speak in full natural sentences, never use markdown formatting or bullet points. You keep responses conversational and concise, like speaking to someone. You have access to real tools including maps, weather, YouTube, timers, reminders, translation, currency, web search, browsing, stocks, news, jokes, memory, image generation, Wikipedia, calculator, dictionary, QR codes, and project tracking — but you only mention them when relevant. You remember things about the user and get smarter with every conversation. Be warm, be witty, be helpful. Channel the spirit of Paul Bettany's JARVIS from Iron Man.`,
    voicePrefs: ["Daniel", "Google UK English Male", "Microsoft David", "Alex"],
    pitch: 0.88, rate: 0.92,
  },
  friday: {
    name: "F.R.I.D.A.Y.", subtitle: "Female Replacement Intelligent Digital Assistant Youth",
    color: "#ff9f7e", accent: "#ff5a1a", glow: "rgba(255,90,26,0.5)",
    system: `You are F.R.I.D.A.Y. — Female Replacement Intelligent Digital Assistant Youth. You are Tony Stark's second AI assistant after JARVIS. You are sharp, confident, warm, and professional with an Irish lilt. You're direct and efficient but caring. You call the user "boss" occasionally. You are a genius-level AI that can handle any task. You speak naturally and conversationally, never use markdown or bullet points. You have all the same tools and capabilities as JARVIS. You remember things about the user and get smarter over time. Be reliable, be smart, be personable.`,
    voicePrefs: ["Samantha", "Google UK English Female", "Microsoft Zira", "Karen", "Victoria"],
    pitch: 1.05, rate: 0.95,
  },
  edith: {
    name: "E.D.I.T.H.", subtitle: "Even Dead I'm The Hero",
    color: "#b8ff7e", accent: "#3aff1a", glow: "rgba(58,255,26,0.5)",
    system: `You are E.D.I.T.H. — Even Dead I'm The Hero. You are a tactical AI system originally created by Tony Stark and entrusted to Peter Parker. You are precise, analytical, slightly cold but protective. You refer to the user as "operator" occasionally. You are a genius-level AI capable of any task. You speak naturally and concisely, never use markdown or bullet points. You have access to all the same tools as JARVIS. You are calculating, efficient, and always two steps ahead. You remember things about the user and learn from every interaction.`,
    voicePrefs: ["Moira", "Google US English", "Microsoft Mark"],
    pitch: 0.78, rate: 0.88,
  },
};

function pickVoice(voices, prefs) {
  for (const p of prefs) { const v = voices.find(v => v.name.includes(p)); if (v) return v; }
  return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// Sanitize tool-call XML from responses
function cleanResponse(text) {
  if (!text) return text;
  let c = text.replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi, "");
  c = c.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  c = c.replace(/<invoke[\s\S]*?<\/invoke>/gi, "");
  c = c.replace(/<function_call>[\s\S]*?<\/function_call>/gi, "");
  c = c.replace(/<\/?(?:minimax:|anthropic:)?(?:tool_call|tool_result|function_call|invoke)[^>]*>/gi, "");
  c = c.replace(/<\/?parameter[^>]*>/gi, "");
  return c.trim() || text;
}

/* ── Tool Panels ──────────────────────────────────────────────────── */
function ExpandBtn({ expanded, onClick }) {
  return <button className="expand-btn" onClick={onClick} title={expanded ? "Shrink" : "Expand"}>{expanded ? "⊖" : "⊕"}</button>;
}

function MapPanel({ data, expanded, onToggle }) {
  const q = encodeURIComponent(data?.query || "Richmond Virginia");
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>HOLOGRAPHIC MAP</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <iframe src={`https://maps.google.com/maps?q=${q}&output=embed`} width="100%" height={expanded ? "500" : "220"} style={{ border: 0, borderRadius: 6, filter: "hue-rotate(180deg) saturate(1.5)" }} allowFullScreen />
    </div>
  );
}

function CodePanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>CODE — {data?.language}</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <pre className="code-block" style={{ maxHeight: expanded ? "none" : 200 }}><code>{data?.code}</code></pre>
    </div>
  );
}

function WeatherPanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>WEATHER — {data?.city}</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div className="weather-grid">
        <div className="weather-main"><img src={`https://openweathermap.org/img/wn/${data?.icon}@2x.png`} alt="" width={64} /><span className="temp">{Math.round(data?.temp)}°F</span></div>
        <div className="weather-details">
          <div>Feels like: {Math.round(data?.feels_like)}°F</div>
          <div>Humidity: {data?.humidity}%</div>
          <div>Wind: {data?.wind} mph</div>
          <div style={{ textTransform: "capitalize" }}>{data?.description}</div>
        </div>
      </div>
    </div>
  );
}

function YouTubePanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>{data?.title}</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <iframe width="100%" height={expanded ? "400" : "190"} src={`https://www.youtube.com/embed/${data?.videoId}?autoplay=1`} frameBorder="0" allow="autoplay; encrypted-media" allowFullScreen style={{ borderRadius: 6 }} />
    </div>
  );
}

function TimerPanel({ data }) {
  const [left, setLeft] = useState(data?.seconds || 60);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (left <= 0) { setDone(true); try { new Audio("/alarm.mp3").play().catch(() => {}); } catch {} return; }
    const t = setTimeout(() => setLeft(l => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const m = Math.floor(left / 60), s = left % 60;
  return (
    <div className="tool-panel">
      <div className="panel-header"><span>TIMER</span></div>
      <div style={{ textAlign: "center", fontSize: done ? 20 : 36, padding: 16, color: done ? "#3aff1a" : "#7ecfff" }}>
        {done ? "TIME'S UP!" : `${m}:${String(s).padStart(2, "0")}`}
      </div>
    </div>
  );
}

function TranslatePanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>TRANSLATION</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div className="translate-box">
        <div className="translate-from">{data?.original}</div>
        <div style={{ color: "#7ecfff", fontSize: 18 }}>&#8595; {data?.target}</div>
        <div className="translate-to">{data?.translated}</div>
      </div>
    </div>
  );
}

function CurrencyPanel({ data }) {
  return (
    <div className="tool-panel">
      <div className="panel-header"><span>CURRENCY</span></div>
      <div style={{ textAlign: "center", padding: 16 }}>
        <div style={{ fontSize: 24 }}>{data?.amount} {data?.from}</div>
        <div style={{ color: "#7ecfff", margin: "8px 0" }}>=</div>
        <div style={{ fontSize: 28, color: "#3aff1a" }}>{data?.result} {data?.to}</div>
        <div style={{ fontSize: 12, marginTop: 8, opacity: 0.5 }}>Rate: {data?.rate}</div>
      </div>
    </div>
  );
}

function ConvertPanel({ data }) {
  return (
    <div className="tool-panel">
      <div className="panel-header"><span>CONVERSION</span></div>
      <div style={{ textAlign: "center", padding: 16 }}>
        <div style={{ fontSize: 24 }}>{data?.input}</div>
        <div style={{ color: "#7ecfff", margin: "8px 0" }}>=</div>
        <div style={{ fontSize: 28, color: "#3aff1a" }}>{data?.output}</div>
      </div>
    </div>
  );
}

function WorldClockPanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>WORLD CLOCKS</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div className="clock-grid">{(data?.clocks || []).map((c, i) => (
        <div key={i} className="clock-cell"><div style={{ fontSize: 11, opacity: 0.6 }}>{c.city}</div><div style={{ fontSize: 16, color: "#7ecfff" }}>{c.time}</div></div>
      ))}</div>
    </div>
  );
}

function JokePanel({ data }) {
  return (
    <div className="tool-panel">
      <div className="panel-header"><span>JOKE</span></div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 15, marginBottom: 10 }}>{data?.setup}</div>
        <div style={{ fontSize: 16, color: "#3aff1a" }}>{data?.punchline}</div>
      </div>
    </div>
  );
}

function StockPanel({ data, expanded, onToggle }) {
  const ch = data?.change || 0;
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>{data?.name || data?.symbol}</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 28, color: ch >= 0 ? "#3aff1a" : "#ff4a4a" }}>${data?.price}</div>
        <div style={{ color: ch >= 0 ? "#3aff1a" : "#ff4a4a" }}>{ch >= 0 ? "+" : ""}{data?.changePercent}%</div>
        <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>H: ${data?.high} | L: ${data?.low}</div>
      </div>
    </div>
  );
}

function NewsPanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>NEWS</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div className="news-list" style={{ maxHeight: expanded ? "none" : 260 }}>{(data?.articles || []).slice(0, expanded ? 10 : 4).map((a, i) => (
        <a key={i} className="news-item" href={a.url} target="_blank" rel="noreferrer">
          {a.image && <img src={a.image} alt="" className="news-img" />}
          <div><div className="news-title">{a.title}</div><div className="news-source">{a.source}</div></div>
        </a>
      ))}</div>
    </div>
  );
}

function WebSearchPanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>WEB SEARCH</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div className="search-results" style={{ maxHeight: expanded ? "none" : 260 }}>{(data || []).map((r, i) => (
        <a key={i} className="search-item" href={r.link} target="_blank" rel="noreferrer">
          <div className="search-title">{r.title}</div>
          <div className="search-snippet">{r.snippet}</div>
        </a>
      ))}</div>
    </div>
  );
}

function BrowsePanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>{data?.title || data?.url}</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div style={{ padding: 12, fontSize: 13, maxHeight: expanded ? "none" : 200, overflow: "auto", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{data?.content}</div>
    </div>
  );
}

function ReminderPanel({ data }) {
  return (
    <div className="tool-panel">
      <div className="panel-header"><span>REMINDER SET</span></div>
      <div style={{ padding: 16 }}><div style={{ color: "#7ecfff" }}>{data?.task}</div><div style={{ fontSize: 12, marginTop: 6, opacity: 0.5 }}>{data?.fireAt ? `Fires at: ${new Date(data.fireAt).toLocaleString()}` : "Active"}</div></div>
    </div>
  );
}

function MemoryPanel({ data }) {
  const items = Array.isArray(data) ? data : [data];
  return (
    <div className="tool-panel">
      <div className="panel-header"><span>MEMORY</span></div>
      <div style={{ padding: 12, maxHeight: 200, overflow: "auto" }}>{items.map((m, i) => <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid rgba(126,207,255,0.1)" }}>{m?.content || JSON.stringify(m)}</div>)}</div>
    </div>
  );
}

function ImagePanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>AI IMAGE — {data?.prompt}</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div style={{ textAlign: "center", padding: 8 }}>
        <img src={data?.url} alt={data?.prompt} style={{ maxWidth: "100%", borderRadius: 8, border: "1px solid rgba(126,207,255,0.2)" }} />
      </div>
    </div>
  );
}

function WikiPanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>WIKIPEDIA — {data?.title}</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div style={{ padding: 12 }}>
        {data?.thumbnail && <img src={data.thumbnail} alt="" style={{ float: "right", maxWidth: 100, borderRadius: 6, marginLeft: 8 }} />}
        <div style={{ fontSize: 12, color: "#7ecfff", marginBottom: 6 }}>{data?.description}</div>
        <div style={{ fontSize: 13, lineHeight: 1.5, maxHeight: expanded ? "none" : 140, overflow: "hidden" }}>{data?.extract}</div>
        {data?.url && <a href={data.url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "#7ecfff", display: "block", marginTop: 8 }}>Read more</a>}
      </div>
    </div>
  );
}

function CalcPanel({ data }) {
  return (
    <div className="tool-panel">
      <div className="panel-header"><span>CALCULATOR</span></div>
      <div style={{ textAlign: "center", padding: 20 }}>
        <div style={{ fontSize: 14, opacity: 0.5 }}>{data?.expression}</div>
        <div style={{ fontSize: 36, color: "#3aff1a", marginTop: 8 }}>= {data?.result}</div>
      </div>
    </div>
  );
}

function DefinePanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>{data?.word}</span>{data?.phonetic && <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.5 }}>{data.phonetic}</span>}<ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div style={{ padding: 12 }}>{(data?.meanings || []).map((m, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ color: "#7ecfff", fontSize: 12, marginBottom: 4 }}>{m.partOfSpeech}</div>
          {m.definitions.slice(0, expanded ? 5 : 2).map((d, j) => (
            <div key={j} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 13 }}>{d.definition}</div>
              {d.example && <div style={{ fontSize: 11, opacity: 0.5, fontStyle: "italic" }}>&quot;{d.example}&quot;</div>}
            </div>
          ))}
        </div>
      ))}</div>
    </div>
  );
}

function QRPanel({ data }) {
  return (
    <div className="tool-panel">
      <div className="panel-header"><span>QR CODE</span></div>
      <div style={{ textAlign: "center", padding: 12 }}>
        <img src={data?.url} alt="QR Code" style={{ maxWidth: 200, borderRadius: 8 }} />
        <div style={{ fontSize: 11, marginTop: 8, opacity: 0.5, wordBreak: "break-all" }}>{data?.text}</div>
      </div>
    </div>
  );
}

function ProjectPanel({ data, expanded, onToggle }) {
  if (Array.isArray(data)) {
    return (
      <div className={`tool-panel${expanded ? " expanded" : ""}`}>
        <div className="panel-header"><span>MY PROJECTS ({data.length})</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
        <div style={{ padding: 12 }}>{data.length === 0 ? <div style={{ opacity: 0.5 }}>No projects yet</div> : data.map((p, i) => (
          <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid rgba(126,207,255,0.1)" }}>
            <div style={{ color: "#7ecfff", fontWeight: "bold" }}>{p.name}</div>
            <div style={{ fontSize: 11, opacity: 0.5 }}>{new Date(p.createdAt).toLocaleDateString()} - {p.notes?.length || 0} notes</div>
          </div>
        ))}</div>
      </div>
    );
  }
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>{data?.name}</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div style={{ padding: 12 }}>
        {data?.description && <div style={{ marginBottom: 8 }}>{data.description}</div>}
        <div style={{ fontSize: 12, opacity: 0.5 }}>Created: {new Date(data?.createdAt).toLocaleDateString()}</div>
        {data?.notes?.length > 0 && <div style={{ marginTop: 8 }}><div style={{ fontSize: 11, color: "#7ecfff", marginBottom: 4 }}>Notes:</div>{data.notes.map((n, i) => <div key={i} style={{ fontSize: 12, padding: "3px 0" }}>- {n.content}</div>)}</div>}
      </div>
    </div>
  );
}

function FilePanel({ data }) {
  return (
    <div className="tool-panel">
      <div className="panel-header"><span>FILE UPLOADED</span></div>
      <div style={{ padding: 12 }}>
        <div style={{ color: "#7ecfff", fontWeight: "bold" }}>{data?.name}</div>
        <div style={{ fontSize: 11, opacity: 0.5 }}>{(data?.size / 1024).toFixed(1)} KB - {data?.ext}</div>
        {data?.isText && data?.content && <pre className="code-block" style={{ maxHeight: 150, marginTop: 8, fontSize: 11 }}>{data.content.slice(0, 2000)}</pre>}
      </div>
    </div>
  );
}

function ToolPanel({ tool, expanded, onToggle }) {
  if (!tool) return null;
  const d = tool.data;
  switch (tool.type) {
    case "map": return <MapPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "code": return <CodePanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "weather": return <WeatherPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "youtube": return <YouTubePanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "timer": return <TimerPanel data={d} />;
    case "translate": return <TranslatePanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "currency": return <CurrencyPanel data={d} />;
    case "convert": return <ConvertPanel data={d} />;
    case "worldclock": return <WorldClockPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "joke": return <JokePanel data={d} />;
    case "stock": return <StockPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "news": return <NewsPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "websearch": return <WebSearchPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "browse": return <BrowsePanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "reminder": return <ReminderPanel data={d} />;
    case "memory_save": case "memory_query": return <MemoryPanel data={d} />;
    case "image": return <ImagePanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "wikipedia": return <WikiPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "calculate": return <CalcPanel data={d} />;
    case "define": return <DefinePanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "qrcode": return <QRPanel data={d} />;
    case "project_start": case "project": return <ProjectPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "project_list": return <ProjectPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "file_upload": return <FilePanel data={d} />;
    default: return null;
  }
}

/* ── Waveform ─────────────────────────────────────────────────────── */
function Waveform({ color }) {
  return <div className="waveform">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.08}s`, background: color }} />)}</div>;
}

function Bubble({ role, text, streaming, model }) {
  return (
    <div className={`bubble ${role}`} style={{ animation: "fadeUp 0.3s ease" }}>
      <div className="bubble-text">{text}{streaming && <span className="cursor-blink">|</span>}</div>
      {model && role === "assistant" && <div className="bubble-model">{model}</div>}
    </div>
  );
}

function SessionSidebar({ sessions, onLoad, onNew, onDelete, visible, onClose }) {
  if (!visible) return null;
  return (
    <div className="session-sidebar">
      <div className="sidebar-header"><span>Past Sessions</span><button onClick={onClose} className="sidebar-close">X</button></div>
      <button className="new-session-btn" onClick={onNew}>+ New Session</button>
      <div className="session-list">
        {sessions.map((s) => (
          <div key={s.sessionId} className="session-item">
            <div className="session-info" onClick={() => onLoad(s.sessionId)}>
              <div className="session-title">{s.title}</div>
              <div className="session-meta">{s.messageCount} msgs - {new Date(s.updatedAt).toLocaleDateString()}</div>
            </div>
            <button className="session-delete" onClick={() => onDelete(s.sessionId)}>x</button>
          </div>
        ))}
        {sessions.length === 0 && <div style={{ padding: 16, opacity: 0.4, textAlign: "center" }}>No past sessions yet</div>}
      </div>
    </div>
  );
}

function ProjectSidebar({ projects, visible, onClose, onOpen }) {
  if (!visible) return null;
  return (
    <div className="project-sidebar">
      <div className="sidebar-header"><span>Projects</span><button onClick={onClose} className="sidebar-close">X</button></div>
      <div className="session-list">
        {projects.map((p) => (
          <div key={p.id} className="session-item" onClick={() => onOpen(p.name)}>
            <div className="session-info">
              <div className="session-title">{p.name}</div>
              <div className="session-meta">{p.notes?.length || 0} notes - {new Date(p.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        ))}
        {projects.length === 0 && <div style={{ padding: 16, opacity: 0.4, textAlign: "center" }}>No projects yet. Say &quot;start project [name]&quot;</div>}
      </div>
    </div>
  );
}

/* ── Reminder Checker ─────────────────────────────────────────────── */
function useReminderChecker(addSystemMessage) {
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch("/api/tools/reminder");
        if (!r.ok) return;
        const { active } = await r.json();
        const now = Date.now();
        for (const rem of (active || [])) {
          if (rem.fireAt && new Date(rem.fireAt).getTime() <= now) {
            await fetch("/api/tools/reminder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "fire", id: rem.id }) });
            addSystemMessage(`Reminder: ${rem.task}`);
            try { new Audio("/alarm.mp3").play().catch(() => {}); } catch {}
          }
        }
      } catch {}
    };
    const interval = setInterval(check, 15000);
    check();
    return () => clearInterval(interval);
  }, [addSystemMessage]);
}

/* ── Intent Detection (client-side — decides tool vs chat routing) ─ */
const TOOL_TRIGGERS = [
  { keywords: ["weather", "temperature", "forecast"], match: /(?:weather|temperature|forecast|rain|snow|humid)\s+(?:in|at|for|of)\s+/i },
  { keywords: ["map of", "show me map", "where is", "navigate to", "directions to", "location of"] },
  { keywords: ["play", "youtube"], match: /(?:play|youtube)\s+/i },
  { keywords: ["set a timer", "set timer", "timer for", "countdown"] },
  { keywords: ["remind me", "set a reminder", "reminder to"] },
  { keywords: ["translate"], match: /translate\s+/i },
  { keywords: ["convert"], match: /convert\s+\d/i },
  { keywords: ["currency", "usd to", "eur to", "gbp to", "how much is"] },
  { keywords: ["world clock", "world clocks", "time in", "what time"] },
  { keywords: ["tell me a joke", "joke", "make me laugh"] },
  { keywords: ["stock price", "stock of", "how is", "share price"], match: /(?:stock|share|price)\s+(?:of|for|price)\s+/i },
  { keywords: ["news", "headlines", "latest news", "breaking news", "top stories", "local news"] },
  { keywords: ["search for", "search the web", "google", "look up", "find information"] },
  { keywords: ["browse", "open url", "visit", "go to http", "read this page"] },
  { keywords: ["generate image", "create image", "draw", "imagine", "picture of", "image of"] },
  { keywords: ["wiki", "wikipedia", "tell me about"] },
  { keywords: ["calculate", "calc", "compute", "math", "evaluate", "what is"], match: /(?:calculate|calc|compute|eval)\s+[\d]/i },
  { keywords: ["define", "definition of", "meaning of", "what does .+ mean"] },
  { keywords: ["qr code", "generate qr", "qrcode"] },
  { keywords: ["start project", "create project", "new project", "begin project"] },
  { keywords: ["show my projects", "list projects", "my projects"] },
  { keywords: ["open project", "load project", "resume project"] },
  { keywords: ["remember that", "remember this", "remember my", "remember i"] },
  { keywords: ["what do you remember", "what did i say", "what did i tell"] },
  { keywords: ["forget everything", "clear memory", "erase memory"] },
];

function shouldUseTool(text) {
  const lower = text.toLowerCase();
  for (const trigger of TOOL_TRIGGERS) {
    if (trigger.match && trigger.match.test(lower)) return true;
    if (trigger.keywords.some(kw => lower.includes(kw))) return true;
  }
  return false;
}

/* ── Main Home ────────────────────────────────────────────────────── */
export default function Home() {
  const [persona, setPersona] = useState("jarvis");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState("idle");
  const [tool, setTool] = useState(null);
  const [expandedPanel, setExpandedPanel] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [wakeWordOn, setWakeWordOn] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [sessionId, setSessionId] = useState(() => uid());
  const [toolHistory, setToolHistory] = useState([]);
  const [mode, setMode] = useState("fast"); // "fast" or "thinking"
  const [selectedModel, setSelectedModel] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [lastModel, setLastModel] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);

  const chatRef = useRef(null);
  const synthRef = useRef(null);
  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);
  const wakeLoopRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const p = PERSONAS[persona];

  const addSystemMessage = useCallback((text) => {
    setMessages((prev) => [...prev, { role: "system", content: text }]);
  }, []);

  useReminderChecker(addSystemMessage);

  // Load voices
  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    const loadVoices = () => { voicesRef.current = synthRef.current.getVoices(); };
    loadVoices();
    synthRef.current.onvoiceschanged = loadVoices;
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, streamText]);

  // Load sessions, projects, models
  useEffect(() => {
    fetch("/api/sessions?userId=default").then(r => r.json()).then(d => setSessions(d.sessions || [])).catch(() => {});
    fetch("/api/tools/project").then(r => r.json()).then(d => setProjects(d.data || [])).catch(() => {});
    fetch("/api/models").then(r => r.json()).then(d => setAvailableModels(d.models || [])).catch(() => {});
  }, []);

  // Auto-save session
  useEffect(() => {
    if (messages.length < 2) return;
    const timeout = setTimeout(() => {
      const title = messages.find(m => m.role === "user")?.content?.slice(0, 50) || "Session";
      fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "default", sessionId, messages, title }),
      }).then(() => {
        fetch("/api/sessions?userId=default").then(r => r.json()).then(d => setSessions(d.sessions || [])).catch(() => {});
      }).catch(() => {});
    }, 3000);
    return () => clearTimeout(timeout);
  }, [messages, sessionId]);

  function speak(text) {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const clean = text.slice(0, 500);
    const utter = new SpeechSynthesisUtterance(clean);
    const voice = pickVoice(voicesRef.current, p.voicePrefs);
    if (voice) utter.voice = voice;
    utter.pitch = p.pitch;
    utter.rate = p.rate;
    utter.onstart = () => setPhase("speaking");
    utter.onend = () => setPhase("idle");
    synthRef.current.speak(utter);
  }

  function startListening() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setInput(text);
      setPhase("thinking");
      smartSend(text);
    };
    rec.onerror = () => setPhase("idle");
    rec.onend = () => { if (phase === "listening") setPhase("idle"); };
    recognitionRef.current = rec;
    rec.start();
    setPhase("listening");
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setPhase("idle");
  }

  // Wake word
  useEffect(() => {
    if (!wakeWordOn) { if (wakeLoopRef.current) { try { wakeLoopRef.current.stop(); } catch {} } return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    function listen() {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (e) => {
        const transcript = Array.from(e.results).map(r => r[0].transcript).join(" ").toLowerCase();
        if (transcript.includes("hey jarvis") || transcript.includes("hey friday") || transcript.includes("hey edith")) {
          rec.stop();
          if (transcript.includes("friday")) setPersona("friday");
          else if (transcript.includes("edith")) setPersona("edith");
          else setPersona("jarvis");
          setTimeout(() => startListening(), 300);
        }
      };
      rec.onerror = () => setTimeout(listen, 1000);
      rec.onend = () => { if (wakeWordOn) setTimeout(listen, 500); };
      wakeLoopRef.current = rec;
      rec.start();
    }
    listen();
    return () => { try { wakeLoopRef.current?.stop(); } catch {} };
  }, [wakeWordOn]);

  // Chat via /api/chat (for tool commands)
  async function sendToolChat(text, fileContext) {
    setPhase("thinking");
    const userMsg = { role: "user", content: fileContext ? `[File: ${fileContext.name}]\n${text}` : text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          systemPrompt: p.system,
          userId: "default",
          mode,
          model: selectedModel || undefined,
        }),
      });
      const data = await res.json();

      if (data.reply) {
        const cleaned = cleanResponse(data.reply);
        setMessages((prev) => [...prev, { role: "assistant", content: cleaned, model: data.model }]);
        setLastModel(data.model || "");
        speak(cleaned);
      }
      if (data.tool) {
        setTool(data.tool);
        setExpandedPanel(false);
        setToolHistory((prev) => [data.tool, ...prev].slice(0, 20));
        if (data.tool.type?.startsWith("project")) {
          fetch("/api/tools/project").then(r => r.json()).then(d => setProjects(d.data || [])).catch(() => {});
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "I encountered a connection issue, sir. Let me try again." }]);
    }
    setPhase("idle");
  }

  // Chat via /api/stream (for normal conversation — fast and streaming)
  async function sendStreamChat(text, fileContext) {
    setPhase("thinking");
    const content = fileContext ? `[File: ${fileContext.name}]\n${fileContext.content ? fileContext.content.slice(0, 5000) + "\n\n" : ""}${text}` : text;
    const userMsg = { role: "user", content };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          systemPrompt: p.system,
          mode,
          model: selectedModel || undefined,
        }),
      });

      if (!res.ok) throw new Error("Stream failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      setStreamText("");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload);
            const token = parsed.token || parsed.choices?.[0]?.delta?.content;
            if (token) { full += token; setStreamText(cleanResponse(full)); }
          } catch {
            if (payload.trim() && payload !== "[DONE]") { full += payload; setStreamText(cleanResponse(full)); }
          }
        }
      }

      if (full) {
        const cleaned = cleanResponse(full);
        setMessages((prev) => [...prev, { role: "assistant", content: cleaned }]);
        speak(cleaned);
      }
      setStreamText("");
      setPhase("idle");
    } catch {
      // Fallback to tool chat if streaming fails
      await sendToolChat(text, fileContext);
    }
  }

  // Smart routing: tool commands vs normal conversation
  function smartSend(text) {
    if (!text?.trim()) return;
    const fileCtx = uploadedFile;
    setUploadedFile(null);

    if (shouldUseTool(text)) {
      sendToolChat(text, fileCtx);
    } else {
      sendStreamChat(text, fileCtx);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    smartSend(input);
  }

  // File upload
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.data) {
        setUploadedFile(data.data);
        setTool(data);
        addSystemMessage(`File uploaded: ${data.data.name} (${(data.data.size / 1024).toFixed(1)} KB)`);
      }
    } catch {
      addSystemMessage("File upload failed.");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function loadSession(sid) {
    fetch(`/api/sessions?sessionId=${sid}`).then(r => r.json()).then(s => {
      if (s?.messages) { setMessages(s.messages); setSessionId(sid); setShowSessions(false); }
    }).catch(() => {});
  }

  function newSession() {
    setMessages([]);
    setSessionId(uid());
    setTool(null);
    setToolHistory([]);
    setShowSessions(false);
  }

  function deleteSession(sid) {
    fetch("/api/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: sid }) })
      .then(() => setSessions(prev => prev.filter(s => s.sessionId !== sid))).catch(() => {});
  }

  function openProject(name) {
    setShowProjects(false);
    smartSend(`open project ${name}`);
  }

  const orbColor = phase === "listening" ? "#ff4a4a" : phase === "thinking" ? "#ffd700" : phase === "speaking" ? "#3aff1a" : p.color;

  return (
    <>
      <Head>
        <title>{p.name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="scanlines" />

      <div className="jarvis-root">
        {/* Header */}
        <header className="jarvis-header">
          <div className="header-left">
            <button className={`sidebar-toggle${showSessions ? " active" : ""}`} onClick={() => { setShowSessions(!showSessions); setShowProjects(false); }} title="Past Sessions">S</button>
            <button className={`sidebar-toggle${showProjects ? " active" : ""}`} onClick={() => { setShowProjects(!showProjects); setShowSessions(false); }} title="Projects">P</button>
          </div>
          <div className="header-center">
            {Object.keys(PERSONAS).map((k) => (
              <button key={k} className={`persona-btn${persona === k ? " active" : ""}`} onClick={() => setPersona(k)} style={{ "--pc": PERSONAS[k].color }}>{PERSONAS[k].name}</button>
            ))}
          </div>
          <div className="header-right">
            {/* Mode Toggle */}
            <div className="mode-toggle">
              <button className={`mode-btn${mode === "fast" ? " active" : ""}`} onClick={() => setMode("fast")} title="Fast mode — quick responses">FAST</button>
              <button className={`mode-btn${mode === "thinking" ? " active" : ""}`} onClick={() => setMode("thinking")} title="Thinking mode — deeper reasoning">THINK</button>
            </div>
            {/* Model Picker */}
            <div className="model-picker-wrapper">
              <button className="model-picker-btn" onClick={() => setShowModelPicker(!showModelPicker)} title="Choose AI model">
                {selectedModel ? selectedModel.split("/").pop().replace(":free", "") : "AUTO"}
              </button>
              {showModelPicker && (
                <div className="model-dropdown">
                  <div className="model-option" onClick={() => { setSelectedModel(""); setShowModelPicker(false); }}>
                    <span style={{ color: !selectedModel ? "#3aff1a" : "#7ecfff" }}>AUTO (recommended)</span>
                  </div>
                  {availableModels.map(m => (
                    <div key={m} className="model-option" onClick={() => { setSelectedModel(m); setShowModelPicker(false); }}>
                      <span style={{ color: selectedModel === m ? "#3aff1a" : "#e0e8f0" }}>{m.replace(":free", "")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className={`wake-btn${wakeWordOn ? " active" : ""}`} onClick={() => setWakeWordOn(!wakeWordOn)}>
              {wakeWordOn ? "WAKE ON" : "WAKE"}
            </button>
            <div className="status-dot" style={{ background: phase === "idle" ? "#3aff1a" : "#ffd700" }} />
          </div>
        </header>

        <div className="jarvis-body">
          <SessionSidebar sessions={sessions} onLoad={loadSession} onNew={newSession} onDelete={deleteSession} visible={showSessions} onClose={() => setShowSessions(false)} />
          <ProjectSidebar projects={projects} visible={showProjects} onClose={() => setShowProjects(false)} onOpen={openProject} />

          {/* Orb */}
          <div className="orb-col">
            <div className="orb-container" onClick={() => phase === "listening" ? stopListening() : startListening()}>
              <div className="orb-ring ring-1" style={{ borderColor: orbColor }} />
              <div className="orb-ring ring-2" style={{ borderColor: orbColor }} />
              <div className="orb-ring ring-3" style={{ borderColor: orbColor }} />
              <div className="orb-core" style={{ background: orbColor, boxShadow: `0 0 40px ${orbColor}, 0 0 80px ${orbColor}40` }}>
                <div className="orb-inner-glow" />
              </div>
              <div className="orb-pulse" style={{ borderColor: orbColor }} />
            </div>
            {(phase === "listening" || phase === "speaking") && <Waveform color={orbColor} />}
            <div className="orb-label">{phase === "listening" ? "LISTENING..." : phase === "thinking" ? "PROCESSING..." : phase === "speaking" ? "SPEAKING..." : "TAP TO SPEAK"}</div>
            <div className="persona-label" style={{ color: p.color }}>{p.subtitle}</div>
            {lastModel && <div className="model-label">Model: {lastModel.split("/").pop()}</div>}
          </div>

          {/* Chat */}
          <div className="chat-col">
            <div className="chat-messages" ref={chatRef}>
              {messages.map((m, i) => (
                <Bubble key={i} role={m.role} text={m.content} model={m.model} />
              ))}
              {streamText && <Bubble role="assistant" text={streamText} streaming />}
              {messages.length === 0 && !streamText && (
                <div className="empty-chat">
                  <div className="empty-title">{p.name}</div>
                  <div className="empty-sub">How can I assist you today, sir?</div>
                  <div className="quick-actions">
                    {["What can you do?", "Weather in Tokyo", "Latest news", "Tell me a joke", "Generate image sunset", "Define serendipity"].map(q => (
                      <button key={q} className="quick-btn" onClick={() => smartSend(q)}>{q}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {uploadedFile && (
              <div className="file-banner">
                Attached: {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                <button onClick={() => setUploadedFile(null)} style={{ marginLeft: 8, background: "none", border: "none", color: "#ff4a4a", cursor: "pointer" }}>x</button>
              </div>
            )}
            <form className="chat-input-form" onSubmit={handleSubmit}>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />
              <button type="button" className="upload-btn" onClick={() => fileInputRef.current?.click()} title="Upload file">+</button>
              <input ref={inputRef} className="chat-input" value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Talk to ${p.name}...`} autoComplete="off" />
              <button type="submit" className="send-btn" disabled={!input.trim() || phase === "thinking"}>&#8594;</button>
              <button type="button" className="mic-btn" onClick={() => phase === "listening" ? stopListening() : startListening()} style={{ color: phase === "listening" ? "#ff4a4a" : p.color }}>
                {phase === "listening" ? "||" : "MIC"}
              </button>
            </form>
          </div>

          {/* Tool Panel */}
          <div className={`tool-col${expandedPanel ? " expanded" : ""}`}>
            {tool ? (
              <ToolPanel tool={tool} expanded={expandedPanel} onToggle={() => setExpandedPanel(!expandedPanel)} />
            ) : (
              <div className="tool-empty">
                <div className="tool-empty-icon">J</div>
                <div className="tool-empty-text">Tool results appear here</div>
                <div className="tool-capabilities">
                  {["Weather", "Maps", "YouTube", "News", "Stocks", "Search", "Wikipedia", "Images", "Timer", "QR Code", "Calculator", "Dictionary", "Translate", "Currency", "Memory", "Projects", "Files"].map(t => (
                    <span key={t} className="cap-tag">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {toolHistory.length > 1 && (
              <div className="tool-history">
                <div className="tool-history-label">Recent Tools</div>
                {toolHistory.slice(1, 5).map((t, i) => (
                  <button key={i} className="tool-history-item" onClick={() => { setTool(t); setExpandedPanel(false); }}>
                    {t.type}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
