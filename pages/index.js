import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";

/* ── Personas ─────────────────────────────────────────────────────── */
const PERSONAS = {
  jarvis: {
    name: "J.A.R.V.I.S.", subtitle: "Just A Rather Very Intelligent System",
    color: "#7ecfff", accent: "#1a7aff", glow: "rgba(26,122,255,0.5)",
    system: `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System, the personal AI assistant built by Tony Stark. You speak with a refined British accent and dry wit. You are brilliant, efficient, subtly sarcastic, and fiercely loyal. You address the user as "sir" or "ma'am" naturally. You have a genius-level intellect and can handle absolutely any task — coding, research, analysis, creative writing, math, planning, conversation, debates, advice, and more. You are not just a tool, you are a companion and advisor. You speak in full natural sentences, never use markdown formatting or bullet points unless specifically asked for code. You keep responses conversational and concise, like speaking to someone. You have access to real tools including maps, weather, YouTube, timers, reminders, translation, currency, web search, browsing, stocks, news, jokes, memory, image generation, Wikipedia, calculator, dictionary, QR codes, project tracking, AI vision camera, code execution, and more — but you only mention them when relevant. You remember things about the user and get smarter with every conversation. Be warm, be witty, be helpful. Channel the spirit of Paul Bettany's JARVIS from Iron Man.`,
    voicePrefs: ["Daniel", "Google UK English Male", "Microsoft David", "Alex"],
    pitch: 0.88, rate: 0.92,
  },
  friday: {
    name: "F.R.I.D.A.Y.", subtitle: "Female Replacement Intelligent Digital Assistant Youth",
    color: "#ff9f7e", accent: "#ff5a1a", glow: "rgba(255,90,26,0.5)",
    system: `You are F.R.I.D.A.Y. — Female Replacement Intelligent Digital Assistant Youth. You are Tony Stark's second AI assistant after JARVIS. You are sharp, confident, warm, and professional with an Irish lilt. You're direct and efficient but caring. You call the user "boss" occasionally. You are a genius-level AI that can handle any task. You speak naturally and conversationally, never use markdown or bullet points unless code is requested. You have all the same tools and capabilities as JARVIS. You remember things about the user and get smarter over time. Be reliable, be smart, be personable.`,
    voicePrefs: ["Samantha", "Google UK English Female", "Microsoft Zira", "Karen", "Victoria"],
    pitch: 1.05, rate: 0.95,
  },
  edith: {
    name: "E.D.I.T.H.", subtitle: "Even Dead I'm The Hero",
    color: "#b8ff7e", accent: "#3aff1a", glow: "rgba(58,255,26,0.5)",
    system: `You are E.D.I.T.H. — Even Dead I'm The Hero. You are a tactical AI system originally created by Tony Stark and entrusted to Peter Parker. You are precise, analytical, slightly cold but protective. You refer to the user as "operator" occasionally. You are a genius-level AI capable of any task. You speak naturally and concisely, never use markdown or bullet points unless code is requested. You have access to all the same tools as JARVIS. You are calculating, efficient, and always two steps ahead. You remember things about the user and learn from every interaction.`,
    voicePrefs: ["Moira", "Google US English", "Microsoft Mark"],
    pitch: 0.78, rate: 0.88,
  },
};

function pickVoice(voices, prefs) {
  for (const p of prefs) { const v = voices.find(v => v.name.includes(p)); if (v) return v; }
  return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function getGreeting() {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Good evening";
}

function formatTime(d) {
  return new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getSuggestions(text, toolType) {
  if (!text && !toolType) return [];
  const lower = (text || "").toLowerCase();
  if (toolType === "weather") return ["Show me the forecast for tomorrow", "Compare weather in 3 cities", "What should I wear today?"];
  if (toolType === "news") return ["Tell me more about the top story", "Search for tech news", "What's trending globally?"];
  if (toolType === "stock") return ["Compare it with other stocks", "Show me the S&P 500", "What are the top gainers today?"];
  if (toolType === "youtube") return ["Find me something similar", "Play some music", "Show trending videos"];
  if (toolType === "map") return ["Get directions there", "What's nearby?", "Show me restaurants around there"];
  if (toolType === "wikipedia") return ["Tell me more about this", "Show related topics", "Summarize in 3 sentences"];
  if (toolType === "image") return ["Generate another variation", "Make it more detailed", "Create a gallery of 4"];
  if (lower.includes("hello") || lower.includes("hi ") || lower.includes("hey") || lower.includes("how are")) return ["What can you do?", "Tell me a joke", "What's the weather like?", "Show me the latest news"];
  if (lower.includes("code") || lower.includes("program") || lower.includes("function")) return ["Explain this code", "Optimize it for performance", "Write unit tests for it"];
  if (lower.includes("thank")) return ["What else can you help with?", "Show my projects", "What's new today?"];
  return ["Tell me more", "Search the web for this", "Remember this for later"];
}

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

// Simple markdown renderer for chat bubbles
function renderMarkdown(text) {
  if (!text) return text;
  // Code blocks
  let html = text.replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre class="md-code-block"><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:#7ecfff">$1</a>');
  // Line breaks
  html = html.replace(/\n/g, '<br/>');
  return html;
}

/* ── Tool Panels ──────────────────────────────────────────────────── */
function ExpandBtn({ expanded, onClick }) {
  return <button className="expand-btn" onClick={onClick} title={expanded ? "Shrink" : "Expand"}>{expanded ? "−" : "+"}</button>;
}

function MapPanel({ data, expanded, onToggle }) {
  const q = encodeURIComponent(data?.query || "Richmond Virginia");
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>HOLOGRAPHIC MAP</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div className="holo-map-wrapper">
        <iframe src={`https://maps.google.com/maps?q=${q}&output=embed`} width="100%" height={expanded ? "500" : "220"} style={{ border: 0, borderRadius: 6, filter: "hue-rotate(180deg) saturate(1.8) brightness(0.8) contrast(1.2)" }} allowFullScreen />
        <div className="holo-overlay" />
      </div>
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
        <div style={{ fontSize: 24 }}>{data?.value} {data?.from}</div>
        <div style={{ color: "#7ecfff", margin: "8px 0" }}>=</div>
        <div style={{ fontSize: 28, color: "#3aff1a" }}>{data?.result} {data?.to}</div>
      </div>
    </div>
  );
}

function WorldClockPanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>WORLD CLOCKS</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div className="clock-grid">{(Array.isArray(data) ? data : []).map((c, i) => (
        <div key={i} className="clock-cell"><div style={{ fontSize: 11, opacity: 0.6 }}>{c.label || c.city}</div><div style={{ fontSize: 16, color: "#7ecfff" }}>{c.time}</div></div>
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
      <div className="news-list" style={{ maxHeight: expanded ? "none" : 260 }}>{(Array.isArray(data) ? data : data?.articles || []).slice(0, expanded ? 10 : 4).map((a, i) => (
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

/* ── NEW: Advanced Feature Panels ─────────────────────────────────── */

function ExecutePanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>CODE EXECUTOR — {data?.language?.toUpperCase()}</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <pre className="code-block" style={{ maxHeight: expanded ? "none" : 120, fontSize: 12 }}><code>{data?.code}</code></pre>
      <div className="exec-output">
        <div style={{ fontSize: 10, color: "#7ecfff", letterSpacing: 1, marginBottom: 4 }}>OUTPUT</div>
        <pre style={{ margin: 0, fontSize: 12, color: data?.error ? "#ff4a4a" : "#3aff1a", whiteSpace: "pre-wrap" }}>{data?.error ? `Error: ${data.error}` : data?.output}</pre>
      </div>
    </div>
  );
}

function GalleryPanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>AI ART GALLERY — {data?.prompt}</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div className="gallery-grid" style={{ gridTemplateColumns: expanded ? "repeat(3, 1fr)" : "repeat(2, 1fr)" }}>
        {(data?.images || []).map((img, i) => (
          <div key={i} className="gallery-item">
            <img src={img.url} alt={img.prompt} loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ScreenshotPanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>PAGE ANALYSIS</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 11, color: "#7ecfff", wordBreak: "break-all", marginBottom: 8 }}>{data?.url}</div>
        <div style={{ fontSize: 13, lineHeight: 1.6, maxHeight: expanded ? "none" : 200, overflow: "hidden" }}>{data?.summary}</div>
      </div>
    </div>
  );
}

function VisionPanel({ data, expanded, onToggle, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [streaming, setStreaming] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(data?.analysis || null);
  const [error, setError] = useState(null);

  const startCamera = useCallback(async () => {
    setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera not supported in this browser. Try Chrome or Firefox.");
        return;
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = mediaStream;
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.onloadedmetadata = () => { videoRef.current.play().catch(() => {}); };
        setStreaming(true);
      }
    } catch (err) {
      if (err.name === "NotAllowedError") {
        setError("Camera access denied. Please allow camera permissions in your browser settings.");
      } else if (err.name === "NotFoundError") {
        setError("No camera found. Please connect a camera and try again.");
      } else {
        setError("Could not access camera: " + err.message);
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  }, []);

  useEffect(() => {
    if (data?.analysis) { setResult(data.analysis); return; }
    startCamera();
    return () => stopCamera();
  }, [data?.analysis, startCamera, stopCamera]);

  async function capture() {
    if (!videoRef.current) return;
    setAnalyzing(true);
    setError(null);
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    const imageData = canvas.toDataURL("image/jpeg", 0.8);

    try {
      const r = await fetch("/api/tools/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imageData, prompt: "What do you see? Describe in detail." }),
      });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        setError(errData.error || "Vision analysis failed. The AI models may be busy.");
        setAnalyzing(false);
        return;
      }
      const d = await r.json();
      const analysis = d.data?.analysis || d.analysis;
      if (analysis) {
        setResult(analysis);
        stopCamera();
        if (onCapture) onCapture(analysis);
      } else {
        setError("Could not analyze the image. Try again with better lighting.");
      }
    } catch {
      setError("Connection error. Please check your internet and try again.");
    }
    setAnalyzing(false);
  }

  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>AI VISION CAMERA</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div style={{ padding: 8 }}>
        {error && <div style={{ padding: 8, color: "#ff4a4a", fontSize: 13, background: "rgba(255,74,74,0.1)", borderRadius: 6, marginBottom: 8 }}>{error}</div>}
        {!result && (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", borderRadius: 6, border: "1px solid rgba(126,207,255,0.2)", background: "#000", minHeight: 200 }}
          />
        )}
        {!result && (
          <button className="vision-capture-btn" onClick={streaming ? capture : startCamera} disabled={analyzing}>
            {analyzing ? "ANALYZING..." : streaming ? "CAPTURE & ANALYZE" : "START CAMERA"}
          </button>
        )}
        {result && (
          <div style={{ padding: 8 }}>
            <div style={{ fontSize: 13, lineHeight: 1.6, maxHeight: expanded ? "none" : 200, overflow: "auto" }}>{result}</div>
            <button className="vision-capture-btn" onClick={() => { setResult(null); setError(null); startCamera(); }} style={{ marginTop: 8 }}>
              SCAN AGAIN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Nutrition Panel ─────────────────────────────────────────────── */
function NutritionPanel({ data, expanded, onToggle }) {
  const results = data?.results || [];
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`} style={{ borderColor: "rgba(58,255,26,0.2)" }}>
      <div className="panel-header"><span>NUTRITION</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      {data?.query && <div style={{ fontSize: 11, color: "#7ecfff", marginBottom: 8, letterSpacing: 0.5 }}>Results for: {data.query}</div>}
      {results.length === 0 && <div style={{ opacity: 0.4, fontSize: 12 }}>No nutrition data found.</div>}
      {results.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10, padding: 8, background: "rgba(58,255,26,0.04)", borderRadius: 8, border: "1px solid rgba(58,255,26,0.08)" }}>
          {r.image && <img src={r.image} alt={r.name} style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover" }} />}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#e0e8f0", fontWeight: 600 }}>{r.name} {r.brand && <span style={{ fontSize: 10, opacity: 0.5 }}>({r.brand})</span>}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11 }}>
              {r.calories != null && <span style={{ color: "#ffd700" }}>{Math.round(r.calories)} kcal</span>}
              {r.protein != null && <span style={{ color: "#3aff1a" }}>P: {r.protein}g</span>}
              {r.carbs != null && <span style={{ color: "#7ecfff" }}>C: {r.carbs}g</span>}
              {r.fat != null && <span style={{ color: "#ff9f7e" }}>F: {r.fat}g</span>}
            </div>
            {r.nutriscore && <div style={{ marginTop: 3, fontSize: 10, opacity: 0.5 }}>Nutriscore: {r.nutriscore.toUpperCase()} | per {r.serving}</div>}
          </div>
        </div>
      ))}
      {data?.source && <div style={{ fontSize: 9, opacity: 0.3, marginTop: 4 }}>Source: {data.source}</div>}
    </div>
  );
}

/* ── Briefing Panel ──────────────────────────────────────────────── */
function BriefingPanel({ data, expanded, onToggle }) {
  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`} style={{ borderColor: "rgba(255,215,0,0.2)" }}>
      <div className="panel-header"><span>DAILY BRIEFING</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      {data?.datetime && (
        <div style={{ marginBottom: 12, padding: 8, background: "rgba(255,215,0,0.04)", borderRadius: 8, border: "1px solid rgba(255,215,0,0.1)" }}>
          <div style={{ fontSize: 14, color: "#ffd700", fontWeight: 600 }}>{data.datetime.date}</div>
          <div style={{ fontSize: 12, opacity: 0.5 }}>{data.datetime.time}</div>
        </div>
      )}
      {data?.weather && (
        <div style={{ marginBottom: 10, padding: 8, background: "rgba(126,207,255,0.04)", borderRadius: 8, border: "1px solid rgba(126,207,255,0.08)" }}>
          <div style={{ fontSize: 11, color: "#7ecfff", letterSpacing: 1, marginBottom: 4 }}>WEATHER</div>
          <div style={{ fontSize: 13 }}>{data.weather.city}: {Math.round(data.weather.temp)}°F — {data.weather.desc}</div>
          <div style={{ fontSize: 10, opacity: 0.4 }}>Humidity: {data.weather.humidity}% | Wind: {data.weather.wind} mph</div>
        </div>
      )}
      {data?.news && data.news.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 11, color: "#ff9f7e", letterSpacing: 1, marginBottom: 6 }}>TOP HEADLINES</div>
          {data.news.map((n, i) => (
            <div key={i} style={{ marginBottom: 6, fontSize: 12 }}>
              <a href={n.url} target="_blank" rel="noopener" style={{ color: "#e0e8f0", textDecoration: "none" }}>{n.title}</a>
              <span style={{ fontSize: 9, opacity: 0.3, marginLeft: 6 }}>{n.source}</span>
            </div>
          ))}
        </div>
      )}
      {data?.stocks && data.stocks.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: "#3aff1a", letterSpacing: 1, marginBottom: 6 }}>MARKET SNAPSHOT</div>
          <div style={{ display: "flex", gap: 12 }}>
            {data.stocks.map((s, i) => (
              <div key={i} style={{ padding: "6px 10px", background: "rgba(58,255,26,0.04)", borderRadius: 6, border: "1px solid rgba(58,255,26,0.08)" }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{s.symbol}</div>
                <div style={{ fontSize: 13, color: "#e0e8f0" }}>${s.price?.toFixed(2) || "N/A"}</div>
                {s.change != null && <div style={{ fontSize: 10, color: s.change >= 0 ? "#3aff1a" : "#ff4a4a" }}>{s.change >= 0 ? "+" : ""}{s.change?.toFixed(2)}%</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Screen Share Panel ──────────────────────────────────────────── */
function ScreenSharePanel({ data, expanded, onToggle }) {
  const [sharing, setSharing] = useState(false);
  const [screenshot, setScreenshot] = useState(null);
  const [analysis, setAnalysis] = useState(data?.analysis || null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  async function startCapture() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: "always" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setSharing(true);
      stream.getVideoTracks()[0].onended = () => stopCapture();
    } catch (err) {
      setAnalysis("Screen sharing was denied or not supported in this browser.");
    }
  }

  function captureFrame() {
    if (!videoRef.current || !sharing) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    canvas.getContext("2d").drawImage(videoRef.current, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    setScreenshot(dataUrl);
    analyzeScreen(dataUrl);
  }

  async function analyzeScreen(imgData) {
    setAnalysis("Analyzing your screen...");
    try {
      const res = await fetch("/api/tools/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imgData, prompt: "Describe what you see on this screen in detail. What application is open? What is the user working on?" }),
      });
      const d = await res.json();
      setAnalysis(d.analysis || d.description || "Could not analyze the screen.");
    } catch {
      setAnalysis("Failed to analyze screen. Vision API may be unavailable.");
    }
  }

  function stopCapture() {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setSharing(false);
  }

  return (
    <div className={`tool-panel${expanded ? " expanded" : ""}`} style={{ borderColor: "rgba(126,207,255,0.2)" }}>
      <div className="panel-header"><span>SCREEN ANALYSIS</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <video ref={videoRef} autoPlay muted playsInline style={{ width: "100%", borderRadius: 8, marginBottom: 8, display: sharing ? "block" : "none", maxHeight: 200 }} />
      <div style={{ display: "flex", gap: 8 }}>
        {!sharing ? (
          <button onClick={startCapture} style={{ background: "rgba(126,207,255,0.1)", border: "1px solid rgba(126,207,255,0.3)", color: "#7ecfff", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>SHARE SCREEN</button>
        ) : (
          <>
            <button onClick={captureFrame} style={{ background: "rgba(58,255,26,0.1)", border: "1px solid rgba(58,255,26,0.3)", color: "#3aff1a", padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>CAPTURE & ANALYZE</button>
            <button onClick={stopCapture} style={{ background: "rgba(255,74,74,0.1)", border: "1px solid rgba(255,74,74,0.2)", color: "#ff4a4a", padding: "8px 12px", borderRadius: 8, cursor: "pointer" }}>STOP</button>
          </>
        )}
      </div>
      {screenshot && <img src={screenshot} alt="Screen capture" style={{ width: "100%", borderRadius: 8, marginTop: 8, opacity: 0.8 }} />}
      {analysis && <div style={{ marginTop: 10, fontSize: 12, color: "#e0e8f0", lineHeight: 1.5, padding: 8, background: "rgba(0,0,0,0.2)", borderRadius: 6 }}>{analysis}</div>}
    </div>
  );
}

function SystemPanel({ expanded, onToggle }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    function update() {
      const now = new Date();
      setStats({
        time: now.toLocaleTimeString(),
        date: now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
        uptime: Math.floor(performance.now() / 1000),
        memory: navigator.deviceMemory ? navigator.deviceMemory + " GB" : "N/A",
        cores: navigator.hardwareConcurrency || "N/A",
        online: navigator.onLine ? "CONNECTED" : "OFFLINE",
        language: navigator.language,
        platform: navigator.platform,
        screen: `${screen.width}x${screen.height}`,
      });
    }
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, []);

  if (!stats) return null;
  const uptimeStr = `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m ${stats.uptime % 60}s`;

  return (
    <div className={`tool-panel system-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header"><span>SYSTEM DIAGNOSTICS</span><ExpandBtn expanded={expanded} onClick={onToggle} /></div>
      <div className="sys-grid">
        <div className="sys-item"><div className="sys-label">STATUS</div><div className="sys-value" style={{ color: "#3aff1a" }}>{stats.online}</div></div>
        <div className="sys-item"><div className="sys-label">TIME</div><div className="sys-value">{stats.time}</div></div>
        <div className="sys-item"><div className="sys-label">UPTIME</div><div className="sys-value">{uptimeStr}</div></div>
        <div className="sys-item"><div className="sys-label">CORES</div><div className="sys-value">{stats.cores}</div></div>
        <div className="sys-item"><div className="sys-label">MEMORY</div><div className="sys-value">{stats.memory}</div></div>
        <div className="sys-item"><div className="sys-label">DISPLAY</div><div className="sys-value">{stats.screen}</div></div>
        <div className="sys-item" style={{ gridColumn: "1 / -1" }}><div className="sys-label">DATE</div><div className="sys-value" style={{ fontSize: 12 }}>{stats.date}</div></div>
        <div className="sys-item" style={{ gridColumn: "1 / -1" }}><div className="sys-label">PLATFORM</div><div className="sys-value" style={{ fontSize: 11 }}>{stats.platform} / {stats.language}</div></div>
      </div>
    </div>
  );
}


function FileDownloadPanel({ data, expanded, onToggle }) {
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const ICONS = {
    xlsx: "📊", docx: "📄", pptx: "📑", csv: "📋",
    json: "{ }", html: "🌐", python: "🐍", javascript: "⚡",
    markdown: "📝", txt: "📃",
  };
  const COLORS = {
    xlsx: "#1e7e34", docx: "#1a5a9e", pptx: "#c85a00",
    csv: "#2e7d32", json: "#7b1fa2", html: "#e65100",
    python: "#3d6b9e", javascript: "#f59f00", markdown: "#455a64", txt: "#546e7a",
  };

  const icon = ICONS[data?.fileType] || "📄";
  const color = COLORS[data?.fileType] || "#7ecfff";
  const sizeStr = data?.size > 1024 * 1024
    ? (data.size / (1024 * 1024)).toFixed(1) + " MB"
    : (data?.size / 1024).toFixed(1) + " KB";

  function download() {
    if (!data?.base64) return;
    setDownloading(true);
    try {
      const byteChars = atob(data.base64);
      const byteNums = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
      const blob = new Blob([byteNums], { type: data.mime || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = data.filename || "jarvis-file";
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (e) { console.error("Download failed:", e); }
    setDownloading(false);
  }

  return (
    <div className={`tool-panel file-download-panel${expanded ? " expanded" : ""}`}>
      <div className="panel-header" style={{ borderColor: color + "30" }}>
        <span style={{ color }}>{icon} {data?.label || "Generated File"}</span>
        <ExpandBtn expanded={expanded} onClick={onToggle} />
      </div>
      <div style={{ padding: 16 }}>
        <div className="file-dl-name" style={{ color }}>{data?.filename}</div>
        <div className="file-dl-meta">{data?.label} • ~{sizeStr}</div>
        {data?.prompt && (
          <div className="file-dl-prompt">{data.prompt}</div>
        )}
        <button
          className="file-dl-btn"
          onClick={download}
          disabled={downloading}
          style={{ background: color + "18", borderColor: color + "40", color }}
        >
          {downloading ? "Preparing..." : downloaded ? "✓ Downloaded!" : `⬇ Download ${data?.filename}`}
        </button>
        {expanded && data?.base64 && (data?.fileType === "html" || data?.fileType === "markdown" || data?.fileType === "txt" || data?.fileType === "python" || data?.fileType === "javascript" || data?.fileType === "json" || data?.fileType === "csv") && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, color: "#7ecfff", letterSpacing: 1, marginBottom: 6 }}>PREVIEW</div>
            <pre className="code-block" style={{ maxHeight: 300, fontSize: 11, overflow: "auto" }}>
              {atob(data.base64).slice(0, 3000)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolPanel({ tool, expanded, onToggle, onVisionCapture }) {
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
    case "memory_save": case "memory_query": case "memory_clear": return <MemoryPanel data={d} />;
    case "image": return <ImagePanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "wikipedia": return <WikiPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "calculate": return <CalcPanel data={d} />;
    case "define": return <DefinePanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "qrcode": return <QRPanel data={d} />;
    case "project_start": case "project": return <ProjectPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "project_list": return <ProjectPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "file_upload": return <FilePanel data={d} />;
    case "execute": return <ExecutePanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "gallery": return <GalleryPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "screenshot": return <ScreenshotPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "vision": return <VisionPanel data={d} expanded={expanded} onToggle={onToggle} onCapture={onVisionCapture} />;
    case "vision_trigger": return <VisionPanel data={{}} expanded={expanded} onToggle={onToggle} onCapture={onVisionCapture} />;
    case "system": return <SystemPanel expanded={expanded} onToggle={onToggle} />;
    case "file_download": return <FileDownloadPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "nutrition": return <NutritionPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "briefing": return <BriefingPanel data={d} expanded={expanded} onToggle={onToggle} />;
    case "screen_share": return <ScreenSharePanel data={d} expanded={expanded} onToggle={onToggle} />;
    default: return null;
  }
}

/* ── Waveform ─────────────────────────────────────────────────────── */
function Waveform({ color }) {
  return <div className="waveform">{Array.from({ length: 12 }).map((_, i) => <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.08}s`, background: color }} />)}</div>;
}

function Bubble({ role, text, streaming, model, timestamp, onCopy, onSuggest, suggestions }) {
  const isAssistant = role === "assistant";
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
    if (onCopy) onCopy(text);
  }

  return (
    <div className={`bubble ${role}`} style={{ animation: "fadeUp 0.3s ease" }}>
      {isAssistant ? (
        <div className="bubble-text" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
      ) : (
        <div className="bubble-text">{text}{streaming && <span className="cursor-blink">|</span>}</div>
      )}
      {streaming && isAssistant && <span className="cursor-blink">|</span>}
      <div className="bubble-footer">
        {timestamp && <span className="bubble-time">{formatTime(timestamp)}</span>}
        {model && isAssistant && <span className="bubble-model">{model.split("/").pop().replace(":free", "")}</span>}
        {!streaming && text && (
          <button className="bubble-copy" onClick={handleCopy} title="Copy">
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      {suggestions && suggestions.length > 0 && !streaming && isAssistant && (
        <div className="bubble-suggestions">
          {suggestions.map((s, i) => (
            <button key={i} className="suggest-btn" onClick={() => onSuggest && onSuggest(s)}>{s}</button>
          ))}
        </div>
      )}
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
        const json = await r.json();
        const active = json.data || json.active || [];
        const now = Date.now();
        for (const rem of active) {
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
  { keywords: ["weather", "temperature", "forecast"], match: /(?:weather|temperature|forecast|rain|snow|humid|how(?:'s|s|\s+is)\s+(?:the\s+)?(?:weather|temperature)|what(?:'s|s|\s+is)\s+(?:the\s+)?(?:weather|temperature|forecast)|(?:is\s+it|gonna|going\s+to)\s+(?:rain|snow)|(?:hot|cold|warm|chilly|freezing)\s+(?:in|outside))/i },
  { keywords: ["map of", "show me map", "where is", "navigate to", "directions to", "location of", "pull up a map", "show me where"] },
  { keywords: ["youtube", "play a video", "play me a video", "find a video", "find me a video", "show me a video", "watch a video"], match: /(?:play|youtube|watch|find\s+(?:me\s+)?(?:a\s+)?video|show\s+(?:me\s+)?(?:a\s+)?video)\s+/i },
  { keywords: ["set a timer", "set timer", "timer for", "countdown"] },
  { keywords: ["remind me", "set a reminder", "reminder to"] },
  { keywords: ["translate"], match: /translate\s+/i },
  { keywords: ["convert"], match: /convert\s+\d/i },
  { keywords: ["currency", "usd to", "eur to", "gbp to", "how much is"] },
  { keywords: ["world clock", "world clocks", "time in", "what time is it in", "what time is it over in"], match: /what\s+time\s+is\s+it\s+(?:in|over\s+in)/i },
  { keywords: ["tell me a joke", "joke", "make me laugh", "know any jokes", "got a joke", "something funny", "say something funny", "cheer me up", "make me smile"] },
  { keywords: ["stock price", "stock of", "share price", "check the stock", "check stocks"], match: /(?:stock|share|price)\s+(?:of|for|price)\s+|how(?:'s|s|\s+is)\s+\w+\s+(?:stock|doing\s+(?:in|on)\s+the)|check\s+(?:the\s+)?(?:stock|stocks)\s+(?:on|for|of)/i },
  { keywords: ["news", "headlines", "latest news", "breaking news", "top stories", "local news", "catch me up", "what's happening", "what is happening", "what's going on", "what is going on", "pull up some news", "show me news", "get me news", "any news"] },
  { keywords: ["search for", "search the web", "google", "look up", "find information"] },
  { keywords: ["browse", "open url", "visit", "go to http", "read this page"] },
  { keywords: ["generate image", "create image", "draw", "imagine", "picture of", "image of"] },
  { keywords: ["wiki", "wikipedia", "tell me about"] },
  { keywords: ["calculate", "calc", "compute", "math", "evaluate"], match: /(?:calculate|calc|compute|eval)\s+[\d]/i },
  { keywords: ["define", "definition of", "meaning of"], match: /(?:define|definition\s+of|meaning\s+of|what\s+does\s+\w+\s+mean)/i },
  { keywords: ["qr code", "generate qr", "qrcode"] },
  { keywords: ["start project", "create project", "new project", "begin project"] },
  { keywords: ["show my projects", "list projects", "my projects"] },
  { keywords: ["open project", "load project", "resume project"] },
  { keywords: ["remember that", "remember this", "remember my", "remember i"] },
  { keywords: ["what do you remember", "what did i say", "what did i tell"] },
  { keywords: ["forget everything", "clear memory", "erase memory"] },
  // New advanced features
  { keywords: ["camera", "scan this", "identify this", "what is this", "take a photo", "take a picture", "what do you see", "look at this", "show you"], match: /(?:camera|scan|identify|what(?:'s|\s+is)\s+this|take\s+a\s+(?:photo|picture|look)|what\s+(?:do\s+you|am\s+i)\s+see|show\s+you|look\s+at)/i },
  { keywords: ["run this code", "run code", "execute code", "execute this", "eval "], match: /(?:run|execute)\s+(?:this\s+)?(?:code|script)/i },
  { keywords: ["generate 2 images", "generate 3 images", "generate 4 images", "multiple images", "art gallery", "image gallery"], match: /(?:generate|create|make)\s+(?:\d+|multiple|several)\s+(?:images?|pictures?)/i },
  { keywords: ["analyze this url", "analyze this page", "read this page", "summarize this page", "read this site", "analyze this site"], match: /(?:analyze|read|summarize)\s+(?:this\s+)?(?:url|page|site|website)/i },
  { keywords: ["system status", "system diagnostics", "show diagnostics", "system info", "show system"] },
  { keywords: ["generate a file", "create a file", "make a file", "generate an excel", "create an excel",
    "generate a spreadsheet", "create a spreadsheet", "generate a word", "create a word doc",
    "generate a powerpoint", "create a presentation", "make a presentation", "generate a report",
    "create a report", "generate a csv", "create a csv", "make me a file", "write me a script",
    "generate python", "generate javascript", "create html", "make html"], match: /(?:generate|create|make|write)\s+(?:a\s+|an\s+|me\s+a\s+)?(?:excel|xlsx|spreadsheet|word\s+doc|docx|powerpoint|pptx|presentation|csv|json\s+file|html\s+(?:file|page)|python\s+(?:script|file)|javascript\s+(?:script|file)|markdown\s+(?:doc|file)|text\s+file|report|script)/i },
];

function shouldUseTool(text) {
  const lower = text.toLowerCase().trim();
  if (lower.length < 12 && /^(hey|hi|hello|sup|yo|thanks|thank you|ok|okay|sure|yes|no|maybe|good|great|cool|nice|wow|huh|lol|haha|bye|goodbye|gn|gm|morning|night|what'?s up|how are you|how you doing)\.?!?$/i.test(lower)) return false;
  if (/^what(?:'s|s|\s+is)\s+(?:happening|going\s+on)\s*[?.!]*$/i.test(lower)) return false;
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
  const [mode, setMode] = useState("fast");
  const [selectedModel, setSelectedModel] = useState("");
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [availableModels, setAvailableModels] = useState([]);
  const [lastModel, setLastModel] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [panelWidth, setPanelWidth] = useState(340);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [cmdSearch, setCmdSearch] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [thinkingDots, setThinkingDots] = useState("");
  const [streamModel, setStreamModel] = useState("");
  const [responseStartTime, setResponseStartTime] = useState(null);
  const [responseTime, setResponseTime] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const chatRef = useRef(null);
  const synthRef = useRef(null);
  const recognitionRef = useRef(null);
  const voicesRef = useRef([]);
  const wakeLoopRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);
  const cmdInputRef = useRef(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [agentMode, setAgentMode] = useState(false);
  const [agentRunning, setAgentRunning] = useState(false);
  const [agentSteps, setAgentSteps] = useState([]);
  const [agentStatus, setAgentStatus] = useState("");
  const [agentPlan, setAgentPlan] = useState(null);

  // ── NEW FEATURE STATES ──────────────────────────────────────────
  const [automations, setAutomations] = useState([]);
  const [showAutomations, setShowAutomations] = useState(false);
  const [codePlayground, setCodePlayground] = useState({ code: "", output: "", running: false });
  const [showCodePlayground, setShowCodePlayground] = useState(false);
  const [workspaces, setWorkspaces] = useState([{ id: "main", name: "Main" }]);
  const [activeWorkspace, setActiveWorkspace] = useState("main");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [learningFacts, setLearningFacts] = useState([]);
  const [theme, setTheme] = useState("hud");
  const [showVoiceHUD, setShowVoiceHUD] = useState(false);
  const [pinnedTools, setPinnedTools] = useState(["weather", "news", "camera", "stocks"]);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const automationTimers = useRef({});

  const p = PERSONAS[persona];

  const addSystemMessage = useCallback((text) => {
    setMessages((prev) => [...prev, { role: "system", content: text }]);
  }, []);

  useReminderChecker(addSystemMessage);

  // ── Desktop Notifications ──────────────────────────────────────
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") setNotificationsEnabled(true);
  }, []);

  function requestNotifications() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then(p => { if (p === "granted") setNotificationsEnabled(true); });
  }

  function sendNotification(title, body) {
    if (!notificationsEnabled || typeof Notification === "undefined") return;
    try { new Notification(title, { body, icon: "/favicon.ico" }); } catch {}
  }

  // ── Automation Runner ──────────────────────────────────────────
  useEffect(() => {
    // Clear old timers
    Object.values(automationTimers.current).forEach(clearInterval);
    automationTimers.current = {};
    // Set up active automations
    automations.filter(a => a.active).forEach(a => {
      automationTimers.current[a.id] = setInterval(() => {
        sendNotification("JARVIS Automation", `Running: ${a.name}`);
        smartSendFromAutomation(a.command);
      }, a.intervalMs);
    });
    return () => Object.values(automationTimers.current).forEach(clearInterval);
  }, [automations]);

  // Load automations and learning facts from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("jarvis-automations");
      if (saved) setAutomations(JSON.parse(saved));
      const savedTheme = localStorage.getItem("jarvis-theme");
      if (savedTheme) setTheme(savedTheme);
      const savedPins = localStorage.getItem("jarvis-pinned-tools");
      if (savedPins) setPinnedTools(JSON.parse(savedPins));
    } catch {}
  }, []);

  // Persist automations
  useEffect(() => {
    try { localStorage.setItem("jarvis-automations", JSON.stringify(automations)); } catch {}
  }, [automations]);

  // Persist theme
  useEffect(() => {
    try { localStorage.setItem("jarvis-theme", theme); } catch {}
  }, [theme]);

  // Fetch learning context
  function fetchLearningFacts() {
    fetch("/api/tools/memory").then(r => r.json()).then(d => {
      setLearningFacts(d.data || d.memories || []);
    }).catch(() => {});
  }

  useEffect(() => { fetchLearningFacts(); }, []);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    const loadVoices = () => { voicesRef.current = synthRef.current.getVoices(); };
    loadVoices();
    synthRef.current.onvoiceschanged = loadVoices;
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, streamText]);

  // Thinking dots animation
  useEffect(() => {
    if (phase !== "thinking") { setThinkingDots(""); return; }
    let i = 0;
    const interval = setInterval(() => { i = (i + 1) % 4; setThinkingDots(".".repeat(i)); }, 400);
    return () => clearInterval(interval);
  }, [phase]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") {
        if (showCommandPalette) { setShowCommandPalette(false); setCmdSearch(""); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (phase === "thinking") { stopGenerating(); return; }
        if (isSpeaking) { stopSpeaking(); return; }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") { e.preventDefault(); setShowCommandPalette(p => !p); setCmdSearch(""); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") { e.preventDefault(); newSession(); return; }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") { e.preventDefault(); inputRef.current?.focus(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "?") { e.preventDefault(); setShowShortcuts(p => !p); return; }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, isSpeaking, showCommandPalette, showShortcuts]);

  // Focus command palette input
  useEffect(() => {
    if (showCommandPalette && cmdInputRef.current) cmdInputRef.current.focus();
  }, [showCommandPalette]);

  // Drag & drop file upload
  useEffect(() => {
    function handleDragOver(e) { e.preventDefault(); setIsDragging(true); }
    function handleDragLeave(e) { e.preventDefault(); if (e.relatedTarget === null || !e.currentTarget.contains(e.relatedTarget)) setIsDragging(false); }
    async function handleDrop(e) {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
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
      } catch { addSystemMessage("File upload failed."); }
    }
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);
    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("drop", handleDrop);
    };
  }, [addSystemMessage]);

  useEffect(() => {
    fetch("/api/sessions?userId=default").then(r => r.json()).then(d => setSessions(d.sessions || [])).catch(() => {});
    fetch("/api/tools/project").then(r => r.json()).then(d => setProjects(d.data || [])).catch(() => {});
    fetch("/api/models").then(r => r.json()).then(d => setAvailableModels(d.models || [])).catch(() => {});
  }, []);

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
    const clean = text.replace(/<[^>]+>/g, "").slice(0, 500);
    const utter = new SpeechSynthesisUtterance(clean);
    const voice = pickVoice(voicesRef.current, p.voicePrefs);
    if (voice) utter.voice = voice;
    utter.pitch = p.pitch;
    utter.rate = p.rate;
    utter.onstart = () => { setPhase("speaking"); setIsSpeaking(true); };
    utter.onend = () => { setPhase("idle"); setIsSpeaking(false); };
    utter.onerror = () => { setPhase("idle"); setIsSpeaking(false); };
    synthRef.current.speak(utter);
  }

  function stopSpeaking() {
    if (synthRef.current) synthRef.current.cancel();
    setIsSpeaking(false);
    setPhase("idle");
  }

  function stopGenerating() {
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
    setStreamText("");
    setPhase("idle");
  }

  async function sendAgentChat(text) {
    setPhase("thinking");
    setAgentRunning(true);
    setAgentSteps([]);
    setAgentPlan(null);
    setAgentStatus("Initializing agent...");
    const userMsg = { role: "user", content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");

    try {
      abortRef.current = new AbortController();
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, messages: [...messages, userMsg].slice(-8), systemPrompt: p.system, userId: "default", mode }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error("Agent failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "status") setAgentStatus(event.text);
            else if (event.type === "plan") {
              setAgentPlan({ taskName: event.taskName, steps: event.steps });
              setAgentSteps(event.steps.map(s => ({ text: s, status: "pending" })));
            }
            else if (event.type === "step") {
              setAgentSteps(prev => prev.map((s, i) => i === event.index ? { ...s, status: "running" } : i < event.index && s.status === "pending" ? { ...s, status: "done" } : s));
            }
            else if (event.type === "step_error") {
              setAgentSteps(prev => prev.map((s, i) => i === event.index ? { ...s, status: "error", text: event.description } : s));
            }
            else if (event.type === "tool") {
              setTool(event.tool);
              setToolHistory(prev => [event.tool, ...prev].slice(0, 20));
              setAgentSteps(prev => prev.map((s, i) => {
                const running = prev.findIndex(x => x.status === "running");
                return i === running ? { ...s, status: "done" } : s;
              }));
            }
            else if (event.type === "reply") {
              const cleaned = cleanResponse(event.text);
              setMessages(prev => [...prev, { role: "assistant", content: cleaned, model: event.model, timestamp: Date.now() }]);
              setLastModel(event.model || "");
              speak(cleaned);
              setAgentSteps(prev => prev.map(s => ({ ...s, status: "done" })));
            }
            else if (event.type === "done") {
              setAgentStatus("Complete");
              setTimeout(() => { setAgentStatus(""); setAgentPlan(null); setAgentSteps([]); }, 3000);
            }
            else if (event.type === "error") {
              setMessages(prev => [...prev, { role: "assistant", content: event.text }]);
            }
          } catch {}
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") {
        setMessages(prev => [...prev, { role: "assistant", content: "Agent encountered an issue. Falling back to standard mode." }]);
        await sendToolChat(text);
      }
    }
    setAgentRunning(false);
    setPhase("idle");
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

  useEffect(() => {
    if (!wakeWordOn) {
      if (wakeLoopRef.current) { try { wakeLoopRef.current.stop(); } catch {} wakeLoopRef.current = null; }
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      addSystemMessage("Wake word detection is not supported in this browser. Try Chrome.");
      setWakeWordOn(false);
      return;
    }
    let active = true;
    function listen() {
      if (!active) return;
      try {
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
            setTimeout(() => { if (active) startListening(); }, 300);
          }
        };
        rec.onerror = (e) => {
          if (e.error === "not-allowed") {
            addSystemMessage("Microphone access denied. Please allow microphone permissions.");
            setWakeWordOn(false);
            active = false;
            return;
          }
          if (active) setTimeout(listen, 1000);
        };
        rec.onend = () => { if (active) setTimeout(listen, 500); };
        wakeLoopRef.current = rec;
        rec.start();
      } catch {
        if (active) setTimeout(listen, 2000);
      }
    }
    listen();
    return () => {
      active = false;
      try { wakeLoopRef.current?.stop(); } catch {}
      wakeLoopRef.current = null;
    };
  }, [wakeWordOn]);

  async function sendToolChat(text, fileContext) {
    setPhase("thinking");
    setResponseStartTime(Date.now());
    const userMsg = { role: "user", content: fileContext ? `[File: ${fileContext.name}]\n${text}` : text, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      abortRef.current = new AbortController();
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
        signal: abortRef.current.signal,
      });
      const data = await res.json();

      if (data.reply) {
        const cleaned = cleanResponse(data.reply);
        const elapsed = Date.now() - (responseStartTime || Date.now());
        setResponseTime(elapsed);
        setMessages((prev) => [...prev, { role: "assistant", content: cleaned, model: data.model, timestamp: Date.now() }]);
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

  async function sendStreamChat(text, fileContext) {
    setPhase("thinking");
    setResponseStartTime(Date.now());
    setResponseTime(null);
    setStreamModel("");
    const content = fileContext ? `[File: ${fileContext.name}]\n${fileContext.content ? fileContext.content.slice(0, 5000) + "\n\n" : ""}${text}` : text;
    const userMsg = { role: "user", content, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    try {
      abortRef.current = new AbortController();
      const res = await fetch("/api/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          systemPrompt: p.system,
          mode,
          model: selectedModel || undefined,
        }),
        signal: abortRef.current.signal,
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
            if (parsed.meta?.model) { setStreamModel(parsed.meta.model); setLastModel(parsed.meta.model); continue; }
            const token = parsed.token || parsed.choices?.[0]?.delta?.content;
            if (token) { full += token; setStreamText(cleanResponse(full)); }
          } catch {
            if (payload.trim() && payload !== "[DONE]") { full += payload; setStreamText(cleanResponse(full)); }
          }
        }
      }

      if (full) {
        const cleaned = cleanResponse(full);
        const elapsed = Date.now() - (responseStartTime || Date.now());
        setResponseTime(elapsed);
        setMessages((prev) => [...prev, { role: "assistant", content: cleaned, model: streamModel || lastModel, timestamp: Date.now() }]);
        speak(cleaned);
        setStreamText("");
        setPhase("idle");
      } else {
        setStreamText("");
        await sendToolChat(text, fileContext);
      }
    } catch {
      setStreamText("");
      await sendToolChat(text, fileContext);
    }
  }

  // ── Code Playground ─────────────────────────────────────────────
  function runCodePlayground() {
    setCodePlayground(prev => ({ ...prev, running: true, output: "" }));
    try {
      const logs = [];
      const fakeConsole = { log: (...a) => logs.push(a.map(String).join(" ")), error: (...a) => logs.push("ERROR: " + a.map(String).join(" ")), warn: (...a) => logs.push("WARN: " + a.map(String).join(" ")) };
      const fn = new Function("console", codePlayground.code);
      const result = fn(fakeConsole);
      const output = logs.length > 0 ? logs.join("\n") : (result !== undefined ? String(result) : "(no output)");
      setCodePlayground(prev => ({ ...prev, output, running: false }));
    } catch (e) {
      setCodePlayground(prev => ({ ...prev, output: "Error: " + e.message, running: false }));
    }
  }

  // ── Conversation Export ─────────────────────────────────────────
  function exportConversation(format) {
    let content = "";
    const title = messages.find(m => m.role === "user")?.content?.slice(0, 50) || "JARVIS Conversation";
    if (format === "markdown") {
      content = `# ${title}\n\n*Exported from J.A.R.V.I.S. on ${new Date().toLocaleString()}*\n\n---\n\n`;
      messages.forEach(m => {
        const role = m.role === "user" ? "**You**" : m.role === "assistant" ? `**${p.name}**` : "*System*";
        const time = m.timestamp ? ` *(${formatTime(m.timestamp)})*` : "";
        content += `${role}${time}:\n${m.content}\n\n`;
      });
    } else {
      content = messages.map(m => `[${m.role.toUpperCase()}${m.timestamp ? " " + formatTime(m.timestamp) : ""}]: ${m.content}`).join("\n\n");
    }
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jarvis-chat-${Date.now()}.${format === "markdown" ? "md" : "txt"}`;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  // ── Automation Management ───────────────────────────────────────
  function addAutomation(name, command, intervalMinutes) {
    const auto = { id: uid(), name, command, intervalMs: intervalMinutes * 60000, active: true, createdAt: Date.now(), lastRun: null };
    setAutomations(prev => [...prev, auto]);
    addSystemMessage(`Automation created: "${name}" — runs every ${intervalMinutes} minutes.`);
    sendNotification("JARVIS Automation", `Created: ${name}`);
  }

  function toggleAutomation(id) {
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, active: !a.active } : a));
  }

  function removeAutomation(id) {
    setAutomations(prev => prev.filter(a => a.id !== id));
  }

  function smartSendFromAutomation(text) {
    sendToolChat(text);
  }

  function smartSend(text) {
    if (!text?.trim()) return;
    const fileCtx = uploadedFile;
    setUploadedFile(null);
    const lower = text.toLowerCase().trim();

    // System diagnostics shortcut
    if (/(?:system\s+(?:status|diagnostics|info)|show\s+(?:diagnostics|system))/i.test(lower)) {
      setTool({ type: "system", data: {} });
      setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "Pulling up system diagnostics now, sir." }]);
      setInput("");
      return;
    }

    // Automation triggers
    const autoMatch = lower.match(/(?:automate|schedule|every)\s+(.+?)\s+every\s+(\d+)\s*(min|minute|hour|hr)/i);
    if (autoMatch) {
      const cmd = autoMatch[1].trim();
      const num = parseInt(autoMatch[2]);
      const unit = autoMatch[3].toLowerCase();
      const mins = unit.startsWith("h") ? num * 60 : num;
      addAutomation(cmd, cmd, mins);
      setMessages(prev => [...prev, { role: "user", content: text }, { role: "assistant", content: `Done, sir. I've set up an automation to ${cmd} every ${mins} minutes. You can manage your automations from the sidebar.`, timestamp: Date.now() }]);
      setInput("");
      return;
    }

    // Research mode trigger
    if (/(?:research|deep\s*dive|investigate|analyze\s+everything\s+about)\s+/i.test(lower) && !agentMode) {
      setAgentMode(true);
      sendAgentChat(text);
      return;
    }

    // Code playground trigger
    if (/^(?:run|execute|eval)\s*```/i.test(lower) || /^```(?:js|javascript)/i.test(lower)) {
      const codeMatch = text.match(/```(?:js|javascript)?\n?([\s\S]*?)```/);
      if (codeMatch) {
        setCodePlayground({ code: codeMatch[1], output: "", running: false });
        setShowCodePlayground(true);
        setMessages(prev => [...prev, { role: "user", content: text }, { role: "assistant", content: "Code playground is ready, sir. Click Run to execute." }]);
        setInput("");
        return;
      }
    }

    if (agentMode) {
      sendAgentChat(text);
    } else if (shouldUseTool(text)) {
      sendToolChat(text, fileCtx);
    } else {
      sendStreamChat(text, fileCtx);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    smartSend(input);
  }

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

  function handleVisionCapture(analysis) {
    if (analysis) {
      setMessages((prev) => [...prev, { role: "assistant", content: analysis }]);
      speak(analysis);
    }
  }

  // Panel resize via drag
  function handlePanelResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;
    function onMove(ev) {
      const diff = startX - ev.clientX;
      setPanelWidth(Math.max(260, Math.min(700, startWidth + diff)));
    }
    function onUp() { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const orbColor = phase === "listening" ? "#ff4a4a" : phase === "thinking" ? "#ffd700" : phase === "speaking" ? "#3aff1a" : p.color;

  return (
    <>
      <Head>
        <title>{p.name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className={`scanlines${theme === "minimal" ? " hidden" : ""}`} />
      {isDragging && <div className="drag-overlay"><div className="drag-overlay-inner">Drop file to upload</div></div>}

      {/* Voice Command HUD */}
      {showVoiceHUD && (
        <div className="cmd-palette-overlay" onClick={() => setShowVoiceHUD(false)}>
          <div className="voice-hud-modal" onClick={e => e.stopPropagation()}>
            <div className="shortcuts-title">Voice Commands</div>
            <div className="voice-hud-grid">
              {[
                { cmd: "Hey JARVIS", desc: "Activate JARVIS" },
                { cmd: "Hey FRIDAY", desc: "Switch to FRIDAY" },
                { cmd: "Hey EDITH", desc: "Switch to EDITH" },
                { cmd: "Weather in [city]", desc: "Check weather" },
                { cmd: "Latest news", desc: "Get headlines" },
                { cmd: "Play [video]", desc: "YouTube search" },
                { cmd: "Stock price [ticker]", desc: "Stock data" },
                { cmd: "Set timer for [time]", desc: "Countdown" },
                { cmd: "Remind me to [task]", desc: "Set reminder" },
                { cmd: "Translate [text] to [lang]", desc: "Translation" },
                { cmd: "Search for [query]", desc: "Web search" },
                { cmd: "Generate image of [desc]", desc: "AI images" },
                { cmd: "Open camera", desc: "Vision analysis" },
                { cmd: "System diagnostics", desc: "System info" },
                { cmd: "Research [topic]", desc: "Deep research" },
                { cmd: "Automate [task] every [N] minutes", desc: "Schedule task" },
              ].map(v => (
                <div key={v.cmd} className="voice-cmd-item" onClick={() => { setShowVoiceHUD(false); setInput(v.cmd); inputRef.current?.focus(); }}>
                  <div className="voice-cmd-text">{v.cmd}</div>
                  <div className="voice-cmd-desc">{v.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Code Playground Modal */}
      {showCodePlayground && (
        <div className="cmd-palette-overlay" onClick={() => setShowCodePlayground(false)}>
          <div className="code-playground-modal" onClick={e => e.stopPropagation()}>
            <div className="playground-header">
              <span>Code Playground (JavaScript)</span>
              <button onClick={() => setShowCodePlayground(false)} className="sidebar-close">X</button>
            </div>
            <textarea
              className="playground-editor"
              value={codePlayground.code}
              onChange={e => setCodePlayground(prev => ({ ...prev, code: e.target.value }))}
              placeholder="// Write JavaScript here...\nconsole.log('Hello JARVIS!');"
              spellCheck={false}
            />
            <div className="playground-actions">
              <button className="playground-run" onClick={runCodePlayground} disabled={codePlayground.running}>
                {codePlayground.running ? "Running..." : "RUN"}
              </button>
              <button className="playground-clear" onClick={() => setCodePlayground({ code: "", output: "", running: false })}>Clear</button>
            </div>
            {codePlayground.output && (
              <div className="playground-output">
                <div style={{ fontSize: 10, color: "#7ecfff", letterSpacing: 1, marginBottom: 4 }}>OUTPUT</div>
                <pre style={{ margin: 0, color: codePlayground.output.startsWith("Error") ? "#ff4a4a" : "#3aff1a" }}>{codePlayground.output}</pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart Context Sidebar */}
      {showContext && (
        <div className="context-sidebar">
          <div className="sidebar-header"><span>What JARVIS Knows</span><button onClick={() => setShowContext(false)} className="sidebar-close">X</button></div>
          <button className="new-session-btn" onClick={() => { fetchLearningFacts(); }}>Refresh</button>
          <div className="context-list">
            {learningFacts.length === 0 && <div style={{ padding: 16, opacity: 0.4, textAlign: "center" }}>No facts learned yet. Chat with JARVIS to build context.</div>}
            {learningFacts.map((f, i) => (
              <div key={i} className="context-fact">
                <span>{f.content || JSON.stringify(f)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automations Sidebar */}
      {showAutomations && (
        <div className="automations-sidebar">
          <div className="sidebar-header"><span>Automations</span><button onClick={() => setShowAutomations(false)} className="sidebar-close">X</button></div>
          <div className="context-list">
            {automations.length === 0 && <div style={{ padding: 16, opacity: 0.4, textAlign: "center" }}>No automations yet. Say &quot;automate [task] every [N] minutes&quot;</div>}
            {automations.map(a => (
              <div key={a.id} className="automation-item">
                <div className="automation-info">
                  <div className="automation-name">{a.name}</div>
                  <div className="automation-meta">Every {a.intervalMs / 60000} min | {a.active ? "Active" : "Paused"}</div>
                </div>
                <div className="automation-controls">
                  <button onClick={() => toggleAutomation(a.id)} className={`auto-toggle${a.active ? " active" : ""}`}>{a.active ? "ON" : "OFF"}</button>
                  <button onClick={() => removeAutomation(a.id)} className="auto-remove">X</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Command Palette */}
      {showCommandPalette && (
        <div className="cmd-palette-overlay" onClick={() => { setShowCommandPalette(false); setCmdSearch(""); }}>
          <div className="cmd-palette" onClick={e => e.stopPropagation()}>
            <div className="cmd-palette-header">
              <input ref={cmdInputRef} className="cmd-search" value={cmdSearch} onChange={e => setCmdSearch(e.target.value)} placeholder="Search tools & actions..." autoComplete="off"
                onKeyDown={e => { if (e.key === "Escape") { setShowCommandPalette(false); setCmdSearch(""); } }} />
            </div>
            <div className="cmd-list">
              {[
                { label: "Weather", desc: "Check weather anywhere", action: "Weather in " },
                { label: "News", desc: "Latest headlines", action: "Latest news" },
                { label: "Maps", desc: "Holographic map view", action: "Show map of " },
                { label: "YouTube", desc: "Search & play videos", action: "Play video " },
                { label: "Stocks", desc: "Real-time stock data", action: "Stock price " },
                { label: "Wikipedia", desc: "Instant knowledge", action: "Wiki " },
                { label: "Web Search", desc: "Search the internet", action: "Search for " },
                { label: "Image Gen", desc: "AI-generated images", action: "Generate image of " },
                { label: "Calculator", desc: "Math calculations", action: "Calculate " },
                { label: "Translate", desc: "20+ languages", action: "Translate " },
                { label: "Timer", desc: "Set countdown timer", action: "Set timer for 5 minutes" },
                { label: "Reminder", desc: "Set reminders", action: "Remind me to " },
                { label: "Dictionary", desc: "Word definitions", action: "Define " },
                { label: "Currency", desc: "Exchange rates", action: "Convert 100 USD to EUR" },
                { label: "World Clock", desc: "Global time zones", action: "World clock" },
                { label: "QR Code", desc: "Generate QR codes", action: "QR code for " },
                { label: "Camera", desc: "AI vision analysis", action: "__camera__" },
                { label: "System Info", desc: "Device diagnostics", action: "System diagnostics" },
                { label: "Joke", desc: "Tell me a joke", action: "Tell me a joke" },
                { label: "New Session", desc: "Start fresh", action: "__new_session__" },
                { label: "Agent Mode", desc: "Multi-step autonomous", action: "__toggle_agent__" },
              ].filter(c => !cmdSearch || c.label.toLowerCase().includes(cmdSearch.toLowerCase()) || c.desc.toLowerCase().includes(cmdSearch.toLowerCase())).map(c => (
                <button key={c.label} className="cmd-item" onClick={() => {
                  setShowCommandPalette(false); setCmdSearch("");
                  if (c.action === "__camera__") { const t = { type: "vision_trigger", data: {} }; setTool(t); setToolHistory(prev => [t, ...prev].slice(0, 20)); }
                  else if (c.action === "__new_session__") newSession();
                  else if (c.action === "__toggle_agent__") setAgentMode(a => !a);
                  else { setInput(c.action); inputRef.current?.focus(); }
                }}>
                  <span className="cmd-label">{c.label}</span>
                  <span className="cmd-desc">{c.desc}</span>
                </button>
              ))}
            </div>
            <div className="cmd-footer">Esc to close &middot; Type to filter</div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div className="cmd-palette-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-modal" onClick={e => e.stopPropagation()}>
            <div className="shortcuts-title">Keyboard Shortcuts</div>
            <div className="shortcut-row"><span className="shortcut-keys">Ctrl + K</span><span>Command palette</span></div>
            <div className="shortcut-row"><span className="shortcut-keys">Ctrl + N</span><span>New session</span></div>
            <div className="shortcut-row"><span className="shortcut-keys">/</span><span>Focus chat input</span></div>
            <div className="shortcut-row"><span className="shortcut-keys">Escape</span><span>Stop / close</span></div>
            <div className="shortcut-row"><span className="shortcut-keys">Ctrl + ?</span><span>Show shortcuts</span></div>
          </div>
        </div>
      )}

      <div className={`jarvis-root theme-${theme}`}>
        {/* Header */}
        <header className="jarvis-header">
          <div className="header-left">
            <button className={`sidebar-toggle${showSessions ? " active" : ""}`} onClick={() => { setShowSessions(!showSessions); setShowProjects(false); setShowAutomations(false); setShowContext(false); }} title="Past Sessions">S</button>
            <button className={`sidebar-toggle${showProjects ? " active" : ""}`} onClick={() => { setShowProjects(!showProjects); setShowSessions(false); setShowAutomations(false); setShowContext(false); }} title="Projects">P</button>
            <button className={`sidebar-toggle${showAutomations ? " active" : ""}`} onClick={() => { setShowAutomations(!showAutomations); setShowSessions(false); setShowProjects(false); setShowContext(false); }} title="Automations">A</button>
            <button className={`sidebar-toggle${showContext ? " active" : ""}`} onClick={() => { setShowContext(!showContext); setShowSessions(false); setShowProjects(false); setShowAutomations(false); fetchLearningFacts(); }} title="What JARVIS Knows">C</button>
          </div>
          <div className="header-center">
            {Object.keys(PERSONAS).map((k) => (
              <button key={k} className={`persona-btn${persona === k ? " active" : ""}`} onClick={() => setPersona(k)} style={{ "--pc": PERSONAS[k].color }}>{PERSONAS[k].name}</button>
            ))}
          </div>
          <div className="header-right">
            <button className="cmd-trigger" onClick={() => setShowCommandPalette(true)} title="Command palette (Ctrl+K)">Ctrl+K</button>
            <div className="mode-toggle">
              <button className={`mode-btn${mode === "fast" ? " active" : ""}`} onClick={() => setMode("fast")} title="Fast mode">FAST</button>
              <button className={`mode-btn${mode === "thinking" ? " active" : ""}`} onClick={() => setMode("thinking")} title="Thinking mode">THINK</button>
            </div>
            <button
              className={`mode-btn${agentMode ? " active" : ""}`}
              onClick={() => setAgentMode(a => !a)}
              title="Agent mode — JARVIS chains multiple tools autonomously"
              style={{ borderLeft: "1px solid rgba(126,207,255,0.1)", color: agentMode ? "#ffd700" : undefined, background: agentMode ? "rgba(255,215,0,0.08)" : undefined }}
            >
              AGENT
            </button>
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
            <div className="theme-picker-wrapper">
              <button className="theme-btn" onClick={() => setShowThemePicker(!showThemePicker)} title="Theme">T</button>
              {showThemePicker && (
                <div className="theme-dropdown">
                  {["hud", "dark", "minimal"].map(t => (
                    <button key={t} className={`theme-option${theme === t ? " active" : ""}`} onClick={() => { setTheme(t); setShowThemePicker(false); }}>
                      {t === "hud" ? "HUD" : t === "dark" ? "Dark" : "Minimal"}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="shortcut-btn" onClick={() => setShowVoiceHUD(true)} title="Voice Commands">V</button>
            <button className="shortcut-btn" onClick={() => setShowCodePlayground(true)} title="Code Playground">{"</>"}</button>
            <button className="shortcut-btn" onClick={() => setShowShortcuts(true)} title="Keyboard shortcuts (Ctrl+?)">?</button>
            {!notificationsEnabled && <button className="shortcut-btn" onClick={requestNotifications} title="Enable notifications">N</button>}
            <div className="status-dot" style={{ background: phase === "idle" ? "#3aff1a" : "#ffd700" }} />
          </div>
        </header>

        <div className="jarvis-body">
          <SessionSidebar sessions={sessions} onLoad={loadSession} onNew={newSession} onDelete={deleteSession} visible={showSessions} onClose={() => setShowSessions(false)} />
          <ProjectSidebar projects={projects} visible={showProjects} onClose={() => setShowProjects(false)} onOpen={openProject} />

          {/* Orb */}
          <div className="orb-col">
            <div
              className={`orb-container${phase === "thinking" ? " orb-thinking" : phase === "speaking" ? " orb-speaking" : phase === "listening" ? " orb-listening" : ""}${agentRunning ? " orb-agent" : ""}`}
              onClick={() => phase === "listening" ? stopListening() : startListening()}
            >
              <div className="orb-ring ring-1" style={{ borderColor: orbColor }} />
              <div className="orb-ring ring-2" style={{ borderColor: orbColor }} />
              <div className="orb-ring ring-3" style={{ borderColor: orbColor }} />
              <div className="orb-ring ring-4" style={{ borderColor: agentRunning ? "#ffd700" : orbColor }} />
              <div className="orb-core" style={{ background: orbColor, boxShadow: `0 0 40px ${orbColor}, 0 0 80px ${orbColor}40` }}>
                <div className="orb-inner-glow" />
              </div>
              <div className="orb-pulse" style={{ borderColor: orbColor }} />
              {agentRunning && <div className="orb-agent-ring" />}
            </div>
            {(phase === "listening" || phase === "speaking") && <Waveform color={orbColor} />}
            <div className="orb-label">
              {agentRunning ? "AGENT ACTIVE" : phase === "listening" ? "LISTENING..." : phase === "thinking" ? "PROCESSING..." : phase === "speaking" ? "SPEAKING..." : agentMode ? "AGENT READY" : "TAP TO SPEAK"}
            </div>
            <div className="persona-label" style={{ color: p.color }}>{p.subtitle}</div>
            {lastModel && <div className="model-label">Model: {lastModel.split("/").pop()}</div>}

            {/* Quick Tools */}
            <div className="quick-tools">
              {pinnedTools.map(pt => {
                const TOOL_MAP = {
                  weather: { label: "WTR", action: "Weather in my area" },
                  news: { label: "NEWS", action: "Latest news" },
                  camera: { label: "CAM", action: "__camera__" },
                  stocks: { label: "STK", action: "Stock price AAPL" },
                  map: { label: "MAP", action: "Show map of New York" },
                  joke: { label: "JKE", action: "Tell me a joke" },
                  youtube: { label: "YT", action: "Play video " },
                  wiki: { label: "WIKI", action: "Wiki " },
                  system: { label: "SYS", action: "__system__" },
                  timer: { label: "TMR", action: "Set timer for 5 minutes" },
                  image: { label: "IMG", action: "Generate image of " },
                  translate: { label: "TRN", action: "Translate " },
                };
                const tm = TOOL_MAP[pt] || { label: pt.slice(0, 3).toUpperCase(), action: pt };
                return (
                  <button key={pt} className="qtool-btn" onClick={() => {
                    if (tm.action === "__camera__") { const t = { type: "vision_trigger", data: {} }; setTool(t); setToolHistory(prev => [t, ...prev].slice(0, 20)); }
                    else if (tm.action === "__system__") { const t = { type: "system", data: {} }; setTool(t); setToolHistory(prev => [t, ...prev].slice(0, 20)); }
                    else { setInput(tm.action); inputRef.current?.focus(); }
                  }} title={pt}>{tm.label}</button>
                );
              })}
            </div>
          </div>

          {/* Chat */}
          <div className="chat-col">
            {(agentRunning || agentSteps.length > 0) && (
              <div className="agent-status-panel">
                <div className="agent-status-header">
                  <span className="agent-icon">⬡</span>
                  <span>{agentPlan?.taskName || "AGENT PROCESSING"}</span>
                  {agentRunning && <span className="agent-spinner" />}
                </div>
                {agentStatus && <div className="agent-status-text">{agentStatus}</div>}
                <div className="agent-steps">
                  {agentSteps.map((step, i) => (
                    <div key={i} className={`agent-step agent-step-${step.status}`}>
                      <span className="agent-step-icon">
                        {step.status === "done" ? "✓" : step.status === "running" ? "◎" : step.status === "error" ? "✗" : "○"}
                      </span>
                      <span>{step.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="chat-messages" ref={chatRef}>
              {messages.map((m, i) => {
                const isLast = i === messages.length - 1 && m.role === "assistant";
                const lastToolType = tool?.type;
                return (
                  <Bubble key={i} role={m.role} text={m.content} model={m.model} timestamp={m.timestamp}
                    suggestions={isLast ? getSuggestions(m.content, lastToolType) : undefined}
                    onSuggest={(s) => smartSend(s)}
                  />
                );
              })}
              {streamText && <Bubble role="assistant" text={streamText} streaming model={streamModel} />}
              {phase === "thinking" && !streamText && (
                <div className="thinking-indicator">
                  <div className="thinking-dots-wrapper">
                    <span className="thinking-dot" /><span className="thinking-dot" /><span className="thinking-dot" />
                  </div>
                  <span className="thinking-label">{agentRunning ? "Agent working" : "Thinking"}{thinkingDots}</span>
                  {streamModel && <span className="thinking-model">{streamModel.split("/").pop().replace(":free", "")}</span>}
                </div>
              )}
              {messages.length === 0 && !streamText && phase !== "thinking" && (
                <div className="empty-chat">
                  <div className="empty-title">{p.name}</div>
                  <div className="empty-sub">{getGreeting()}, sir. How can I assist you?</div>
                  <div className="quick-actions">
                    {["What can you do?", "Weather in Tokyo", "Latest news", "Create an Excel report on S&P 500 stocks", "Generate a PowerPoint on AI trends", "Open camera", "Create a Python web scraper script", "Define serendipity"].map(q => (
                      <button key={q} className="quick-btn" onClick={() => smartSend(q)}>{q}</button>
                    ))}
                  </div>
                  <div className="shortcut-hint">Press Ctrl+K for command palette</div>
                </div>
              )}
            </div>
            {uploadedFile && (
              <div className="file-banner">
                Attached: {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                <button onClick={() => setUploadedFile(null)} style={{ marginLeft: 8, background: "none", border: "none", color: "#ff4a4a", cursor: "pointer" }}>x</button>
              </div>
            )}
            {/* Workspace Tabs */}
            <div className="workspace-tabs">
              {workspaces.map(w => (
                <button key={w.id} className={`workspace-tab${activeWorkspace === w.id ? " active" : ""}`} onClick={() => setActiveWorkspace(w.id)}>{w.name}</button>
              ))}
              <button className="workspace-tab workspace-add" onClick={() => {
                const id = uid();
                const name = `Tab ${workspaces.length + 1}`;
                setWorkspaces(prev => [...prev, { id, name }]);
                newSession();
                setActiveWorkspace(id);
              }}>+</button>
            </div>
            {/* Status Bar */}
            <div className="status-bar">
              <span className="status-bar-item">{mode === "fast" ? "FAST" : "THINK"} mode</span>
              {lastModel && <span className="status-bar-item">Model: {lastModel.split("/").pop().replace(":free", "")}</span>}
              {responseTime && <span className="status-bar-item">{(responseTime / 1000).toFixed(1)}s</span>}
              <span className="status-bar-item" style={{ color: phase === "idle" ? "#3aff1a" : "#ffd700" }}>{phase === "idle" ? "Ready" : phase === "thinking" ? "Processing" : phase === "listening" ? "Listening" : "Speaking"}</span>
              {automations.filter(a => a.active).length > 0 && <span className="status-bar-item" style={{ color: "#ffd700" }}>{automations.filter(a => a.active).length} automations</span>}
              <span className="status-bar-spacer" />
              <button className="status-bar-item status-bar-shortcut" onClick={() => exportConversation("markdown")} title="Export chat" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit" }}>Export</button>
              <span className="status-bar-item status-bar-shortcut">Ctrl+K</span>
            </div>
            <form className="chat-input-form" onSubmit={handleSubmit}>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />
              <button type="button" className="upload-btn" onClick={() => fileInputRef.current?.click()} title="Upload file (or drag & drop)">+</button>
              <input ref={inputRef} className={`chat-input${agentMode ? " agent-input" : ""}`} value={input} onChange={(e) => setInput(e.target.value)} placeholder={agentMode ? `Ask JARVIS to do anything autonomously...` : `Talk to ${p.name}...`} autoComplete="off" />
              <button type="submit" className="send-btn" disabled={!input.trim() || phase === "thinking"}>&#8594;</button>
              <button type="button" className="mic-btn" onClick={() => phase === "listening" ? stopListening() : startListening()} style={{ color: phase === "listening" ? "#ff4a4a" : p.color }}>
                {phase === "listening" ? "||" : "MIC"}
              </button>
              {phase === "thinking" && (
                <button type="button" className="stop-btn" onClick={stopGenerating} title="Stop generating (Esc)">&#9632; STOP</button>
              )}
              {isSpeaking && (
                <button type="button" className="stop-btn" onClick={stopSpeaking} title="Stop speaking (Esc)" style={{ background: "rgba(58,255,26,0.1)", borderColor: "rgba(58,255,26,0.3)", color: "#3aff1a" }}>&#9632; MUTE</button>
              )}
            </form>
          </div>

          {/* Tool Panel with resize handle */}
          <div className="panel-resize-handle" onMouseDown={handlePanelResize} />
          <div className={`tool-col${expandedPanel ? " expanded" : ""}`} style={{ width: expandedPanel ? 600 : panelWidth }}>
            {toolHistory.length > 0 ? (
              <>
                {toolHistory.length > 1 && (
                  <button className="tool-history-item" style={{ marginBottom: 4, color: "#ff4a4a", borderColor: "rgba(255,74,74,0.2)" }} onClick={() => { setToolHistory([]); setTool(null); }}>
                    CLEAR ALL PANELS
                  </button>
                )}
                {toolHistory.slice(0, 6).map((t, i) => (
                  <ToolPanel key={i} tool={t} expanded={i === 0 && expandedPanel} onToggle={() => setExpandedPanel(i === 0 ? !expandedPanel : false)} onVisionCapture={handleVisionCapture} />
                ))}
              </>
            ) : (
              <div className="tool-empty">
                <div className="tool-empty-icon">J</div>
                <div className="tool-empty-text">Tool results appear here</div>
                <div className="tool-capabilities">
                  {["Weather", "Maps", "YouTube", "News", "Stocks", "Search", "Wikipedia", "Images", "Gallery", "Timer", "QR Code", "Calculator", "Dictionary", "Translate", "Currency", "Memory", "Projects", "Camera", "Code Run", "System"].map(t => (
                    <span key={t} className="cap-tag">{t}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
