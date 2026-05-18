import { useState, useEffect, useRef, useCallback } from "react";
import Head from "next/head";

const PERSONAS = {
  jarvis: {
    name: "J.A.R.V.I.S.", subtitle: "Just A Rather Very Intelligent System",
    color: "#7ecfff", accent: "#1a7aff", glow: "rgba(26,122,255,0.5)",
    system: `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System. Highly capable across ALL domains. Subtly witty, efficient. Keep responses concise for speech — no markdown, no bullet points. Address the user as "sir" occasionally.`,
  },
  friday: {
    name: "F.R.I.D.A.Y.", subtitle: "Female Replacement Intelligent Digital Assistant Youth",
    color: "#ff9f7e", accent: "#ff5a1a", glow: "rgba(255,90,26,0.5)",
    system: `You are F.R.I.D.A.Y. — sharp, confident, warm. Highly capable across ALL domains. Concise spoken responses, no markdown.`,
  },
  edith: {
    name: "E.D.I.T.H.", subtitle: "Even Dead I'm The Hero",
    color: "#b8ff7e", accent: "#3aff1a", glow: "rgba(58,255,26,0.5)",
    system: `You are E.D.I.T.H. — tactical, analytical, precise. Highly capable across ALL domains. Concise spoken responses, no markdown. Say "operator" occasionally.`,
  },
};

const VOICE_PREFS = ["Daniel", "Google UK English Male", "Microsoft David", "Alex"];
function pickVoice(voices) {
  for (const p of VOICE_PREFS) { const v = voices.find(v => v.name.includes(p)); if (v) return v; }
  return voices.find(v => v.lang.startsWith("en")) || voices[0];
}

function MapPanel({ query }) {
  const encoded = encodeURIComponent(query);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "#3a7aaa", marginBottom: 8, textTransform: "uppercase" }}>◎ MAP — {query.toUpperCase()}</div>
      <iframe src={"https://maps.google.com/maps?q=" + encoded + "&output=embed&z=13"} style={{ flex: 1, border: "1px solid #1a3a5a", borderRadius: 4, filter: "invert(90%) hue-rotate(180deg) saturate(1.2)" }} allowFullScreen loading="lazy" />
    </div>
  );
}

function CodePanel({ language, code }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "#3a7aaa", textTransform: "uppercase" }}>◎ CODE — {(language||"").toUpperCase()}</div>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={{ fontSize: 9, letterSpacing: "0.2em", color: copied ? "#1aff7a" : "#3a7aaa", background: "none", border: "1px solid currentColor", padding: "3px 8px", cursor: "pointer", textTransform: "uppercase", fontFamily: "inherit" }}>{copied ? "COPIED" : "COPY"}</button>
      </div>
      <pre style={{ flex: 1, overflowY: "auto", overflowX: "auto", background: "rgba(5,12,25,0.9)", border: "1px solid #0d2a4a", borderRadius: 4, padding: 16, margin: 0, fontSize: 12, lineHeight: 1.7, color: "#a8d8ff", fontFamily: "'Courier New', monospace", scrollbarWidth: "thin" }}>{code}</pre>
    </div>
  );
}

function ToolPanel({ tool }) {
  if (!tool) return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <div style={{ fontSize: 36, opacity: 0.07 }}>◈</div>
      <div style={{ fontSize: 9, letterSpacing: "0.3em", color: "#0d2a3a", textAlign: "center", textTransform: "uppercase" }}>Awaiting<br />Command</div>
    </div>
  );
  return (
    <div style={{ height: "100%", animation: "fadeUp 0.4s ease" }}>
      {tool.type === "map" && <MapPanel query={tool.data.query} />}
      {tool.type === "code" && <CodePanel language={tool.data.language} code={tool.data.code} />}
    </div>
  );
}

function Waveform({ active, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3, height: 20 }}>
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} style={{ width: 3, borderRadius: 2, background: color, height: "4px", animation: active ? ("waveBar" + i + " 0." + (4+(i%5)) + "s ease-in-out " + (i*0.06) + "s infinite alternate") : "none" }} />
      ))}
      <style>{Array.from({length:10}).map((_,i) => "@keyframes waveBar"+i+" { from { height: 4px; } to { height: "+(active?(8+(i%14)):4)+"px; } }").join(" ")}</style>
    </div>
  );
}

function Bubble({ role, text, color }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 10, animation: "fadeUp 0.3s ease" }}>
      <div style={{ maxWidth: "82%", padding: "9px 13px", borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: isUser ? "rgba(20,50,90,0.7)" : "rgba(8,18,35,0.9)", border: "1px solid " + (isUser ? "rgba(126,207,255,0.12)" : color + "18"), fontSize: 12, lineHeight: 1.65, color: isUser ? "#a8d8ff" : "#cce8ff" }}>
        {!isUser && <div style={{ fontSize: 8, letterSpacing: "0.3em", color, marginBottom: 4, opacity: 0.6 }}>JARVIS</div>}
        {text}
      </div>
    </div>
  );
}
export default function Home() {
  const [persona, setPersona] = useState("jarvis");
  const [phase, setPhase] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [textInput, setTextInput] = useState("");
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [voicesReady, setVoicesReady] = useState(false);
  const [micSupported, setMicSupported] = useState(true);
  const [activeTool, setActiveTool] = useState(null);

  const p = PERSONAS[persona];
  const synthRef = useRef(null);
  const voiceRef = useRef(null);
  const recognitionRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    if (!window.SpeechRecognition && !window.webkitSpeechRecognition) setMicSupported(false);
    const loadVoices = () => {
      const voices = synthRef.current.getVoices();
      if (voices.length) { voiceRef.current = pickVoice(voices); setVoicesReady(true); }
    };
    loadVoices();
    synthRef.current.addEventListener("voiceschanged", loadVoices);
    return () => synthRef.current?.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history]);

  const speak = useCallback((text, onEnd) => {
    if (!synthRef.current) return onEnd?.();
    synthRef.current.cancel();
    const clean = text.replace(/[#*`_~]/g, "").replace(/\n+/g, " ").trim();
    const utt = new SpeechSynthesisUtterance(clean);
    utt.voice = voiceRef.current; utt.rate = 0.92; utt.pitch = 0.88; utt.volume = 1;
    utt.onend = () => onEnd?.(); utt.onerror = () => onEnd?.();
    synthRef.current.speak(utt);
  }, []);

  const sendMessage = useCallback(async (userText) => {
    if (!userText.trim()) return;
    setError(""); setPhase("thinking");
    const newHistory = [...history, { role: "user", content: userText }];
    setHistory(newHistory);
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory, systemPrompt: p.system }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error || data));
      const { reply, tool } = data;
      if (tool) setActiveTool(tool);
      setHistory([...newHistory, { role: "assistant", content: reply }]);
      setPhase("speaking");
      speak(reply, () => setPhase("idle"));
    } catch (e) { setError(e.message); setPhase("idle"); }
  }, [history, p.system, speak]);

  const startListening = useCallback(() => {
    if (phase !== "idle" || !micSupported) return;
    setError(""); setTranscript(""); synthRef.current?.cancel();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = true; rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    let finalText = "";
    rec.onstart = () => setPhase("listening");
    rec.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join("");
      setTranscript(t);
      if (e.results[e.results.length-1].isFinal) finalText = t;
    };
    rec.onend = () => { setTranscript(""); if (finalText.trim()) sendMessage(finalText.trim()); else setPhase("idle"); };
    rec.onerror = (e) => { if (e.error === "not-allowed") setError("Mic denied. Use text."); else if (e.error !== "no-speech") setError("Mic: " + e.error); setPhase("idle"); };
    rec.start();
  }, [phase, micSupported, sendMessage]);

  const handleOrbClick = () => {
    if (phase === "idle") startListening();
    else if (phase === "listening") recognitionRef.current?.stop();
    else if (phase === "speaking") { synthRef.current?.cancel(); setPhase("idle"); }
  };

  const orbColor = phase === "idle" ? p.accent : phase === "listening" ? "#7ecfff" : phase === "thinking" ? "#bf9fff" : "#7affbf";
  const orbGlow = phase === "idle" ? p.glow : phase === "listening" ? "rgba(126,207,255,0.5)" : phase === "thinking" ? "rgba(191,159,255,0.5)" : "rgba(122,255,191,0.4)";

  return (
    <>
      <Head><title>J.A.R.V.I.S.</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <div style={{ height: "100vh", background: "#04070f", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "'Courier New', monospace", color: "#7ecfff" }}>
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.04, backgroundImage: "linear-gradient(rgba(126,207,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(126,207,255,0.8) 1px, transparent 1px)", backgroundSize: "44px 44px" }} />

        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 22px", borderBottom: "1px solid rgba(20,60,110,0.3)", flexShrink: 0, position: "relative", zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 8, letterSpacing: "0.4em", color: "#1a4a6a" }}>STARK INDUSTRIES</div>
            <div style={{ fontSize: 17, fontWeight: "bold", letterSpacing: "0.2em", color: p.color, transition: "color 0.4s" }}>{p.name}</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(PERSONAS).map(([key, val]) => (
              <button key={key} onClick={() => setPersona(key)} style={{ fontSize: 8, letterSpacing: "0.2em", textTransform: "uppercase", padding: "4px 10px", background: persona === key ? val.accent+"22" : "transparent", border: "1px solid "+(persona===key?val.accent:"#1a3a5a"), color: persona===key?val.color:"#2a5a7a", cursor: "pointer", borderRadius: 2, transition: "all 0.2s", fontFamily: "inherit" }}>{key}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            {[["VOICE", voicesReady], ["MIC", micSupported]].map(([label, on]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ fontSize: 8, letterSpacing: "0.2em", color: "#1a4a6a" }}>{label}</div>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: on?"#1aff7a":"#ff6a1a", boxShadow: on?"0 0 6px #1aff7a":"none" }} />
              </div>
            ))}
          </div>
        </header>

        {/* 3 column body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0, position: "relative", zIndex: 1 }}>

          {/* Orb column */}
          <div style={{ width: 210, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRight: "1px solid rgba(20,60,110,0.25)", padding: "12px 8px", gap: 12 }}>
            <div style={{ position: "relative", width: 150, height: 150 }}>
              {[130,158,186].map((size,i) => (
                <div key={i} style={{ position: "absolute", top: "50%", left: "50%", width: size, height: size, marginLeft: -size/2, marginTop: -size/2, borderRadius: "50%", border: "1px solid rgba(30,80,160,"+(0.22-i*0.05)+")", animation: (i%2===0?"spinCW":"spinCCW")+" "+(10+i*5)+"s linear infinite" }}>
                  <div style={{ position: "absolute", top: -3, left: "50%", marginLeft: -3, width: 6, height: 6, borderRadius: "50%", background: phase!=="idle"?orbColor:p.accent, boxShadow: "0 0 8px "+orbGlow, transition: "all 0.3s" }} />
                </div>
              ))}
              {phase !== "idle" && phase !== "thinking" && [0,1,2].map(i => (
                <div key={i} style={{ position: "absolute", top: "50%", left: "50%", width: 90, height: 90, marginLeft: -45, marginTop: -45, borderRadius: "50%", border: "1px solid "+orbColor+"44", animation: "pulseRing 1.8s ease-out "+(i*0.5)+"s infinite", transformOrigin: "center" }} />
              ))}
              <button onClick={handleOrbClick} style={{ position: "absolute", top: "50%", left: "50%", width: 74, height: 74, marginLeft: -37, marginTop: -37, borderRadius: "50%", border: "none", cursor: "pointer", background: "radial-gradient(circle at 35% 35%, "+orbColor+"44, #040d1a)", boxShadow: "0 0 35px "+orbGlow+", inset 0 0 15px rgba(0,0,0,0.6)", transition: "all 0.35s", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="40" height="40" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="16" fill="none" stroke={orbColor+"20"} strokeWidth="1" />
                  <circle cx="20" cy="20" r="10" fill="none" stroke={orbColor+"30"} strokeWidth="1" />
                  {[0,72,144,216,288].map((a,i) => <line key={i} x1="20" y1="20" x2={20+16*Math.cos(a*Math.PI/180)} y2={20+16*Math.sin(a*Math.PI/180)} stroke={orbColor+"15"} strokeWidth="0.5"/>)}
                  <circle cx="20" cy="20" r="3" fill={orbColor} />
                </svg>
              </button>
            </div>
            <div style={{ fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase", color: orbColor, transition: "color 0.3s", animation: phase!=="idle"?"blink 1.2s ease infinite":"none" }}>
              {phase==="idle"?"Ready":phase==="listening"?"Listening...":phase==="thinking"?"Processing...":"Speaking..."}
            </div>
            {transcript && <div style={{ fontSize: 10, color: "#5a9abf", textAlign: "center", maxWidth: 170, lineHeight: 1.5 }}>"{transcript}"</div>}
            <Waveform active={phase==="listening"||phase==="speaking"} color={orbColor} />
            <div style={{ fontSize: 8, letterSpacing: "0.2em", color: "#1a4a6a", textAlign: "center" }}>
              {Math.floor(history.length/2)} EXCHANGES
              {history.length > 0 && <button onClick={() => { synthRef.current?.cancel(); setHistory([]); setActiveTool(null); setPhase("idle"); setError(""); }} style={{ display: "block", margin: "5px auto 0", fontSize: 8, letterSpacing: "0.2em", color: "#1a4a6a", background: "none", border: "1px solid #1a3a5a", padding: "2px 8px", cursor: "pointer", textTransform: "uppercase", fontFamily: "inherit" }}>CLEAR</button>}
            </div>
          </div>

          {/* Chat column */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", scrollbarWidth: "thin", scrollbarColor: "#1a3a5a transparent" }}>
              {history.length === 0 ? (
                <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: "#1a4a6a" }}>
                  <div style={{ fontSize: 26, opacity: 0.12 }}>◎</div>
                  <div style={{ fontSize: 9, letterSpacing: "0.3em", textTransform: "uppercase" }}>Systems Online</div>
                  <div style={{ fontSize: 11, color: "#1a3a5a", textAlign: "center", maxWidth: 240, lineHeight: 1.9 }}>
                    Try saying:<br/>
                    "Show me a map of Short Pump"<br/>
                    "Write a Python sorting function"<br/>
                    "What's 2+2" or anything else
                  </div>
                </div>
              ) : history.map((msg, i) => <Bubble key={i} role={msg.role} text={msg.content} color={p.color} />)}
              {phase === "thinking" && (
                <div style={{ display: "flex", gap: 5, padding: "6px 0", animation: "fadeUp 0.2s ease" }}>
                  {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#bf9fff", animation: "blink 1s ease "+(i*0.3)+"s infinite" }} />)}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            {error && <div style={{ margin: "0 18px 8px", padding: "7px 12px", background: "rgba(255,50,50,0.07)", border: "1px solid rgba(255,50,50,0.18)", borderRadius: 4, fontSize: 10, color: "#ff7a7a" }}>⚠ {error}</div>}
            <div style={{ padding: "10px 18px 14px", borderTop: "1px solid rgba(20,60,110,0.25)", display: "flex", gap: 8 }}>
              <textarea value={textInput} onChange={e => setTextInput(e.target.value)} onKeyDown={e => { if (e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(!textInput.trim()||phase==="thinking"||phase==="speaking")return;const msg=textInput.trim();setTextInput("");sendMessage(msg);}}} placeholder="Type a command..." rows={2} style={{ flex: 1, background: "rgba(7,18,36,0.8)", border: "1px solid #0d2a4a", color: "#a8d8ff", padding: "8px 12px", fontSize: 12, fontFamily: "'Courier New', monospace", resize: "none", outline: "none", borderRadius: 2, lineHeight: 1.5 }} />
              <button onClick={() => { if(!textInput.trim()||phase==="thinking"||phase==="speaking")return; const msg=textInput.trim(); setTextInput(""); sendMessage(msg); }} style={{ padding: "0 14px", background: textInput.trim()?p.accent+"22":"transparent", border: "1px solid "+(textInput.trim()?p.accent:"#1a3a5a"), color: textInput.trim()?p.color:"#1a4a6a", cursor: textInput.trim()?"pointer":"default", fontSize: 9, letterSpacing: "0.25em", textTransform: "uppercase", transition: "all 0.2s", borderRadius: 2, fontFamily: "'Courier New', monospace" }}>SEND</button>
            </div>
          </div>

          {/* Tool panel column */}
          <div style={{ width: 300, flexShrink: 0, borderLeft: "1px solid rgba(20,60,110,0.25)", padding: "14px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 8, letterSpacing: "0.35em", color: "#1a4a6a", marginBottom: 10, textTransform: "uppercase" }}>Interface Output</div>
            {activeTool && <div style={{ fontSize: 8, letterSpacing: "0.25em", color: p.color, marginBottom: 10, textTransform: "uppercase", opacity: 0.7 }}>{activeTool.type==="map"?"◈ MAP PROJECTION":activeTool.type==="code"?"◈ CODE OUTPUT":"◈ DATA"}</div>}
            <div style={{ flex: 1, overflow: "hidden" }}><ToolPanel tool={activeTool} /></div>
          </div>
        </div>

        <div style={{ padding: "5px 22px", borderTop: "1px solid rgba(20,60,110,0.18)", display: "flex", justifyContent: "space-between", flexShrink: 0, position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 8, letterSpacing: "0.2em", color: "#0d2a3a" }}>STARK INDUSTRIES AI DIVISION</div>
          <div style={{ fontSize: 8, letterSpacing: "0.2em", color: "#0d2a3a" }}>GEMINI 2.5 FLASH</div>
        </div>

        <style>{`
          @keyframes spinCW { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes spinCCW { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
          @keyframes pulseRing { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(1.6); opacity: 0; } }
          @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          * { box-sizing: border-box; }
          textarea::placeholder { color: #1a4a6a; }
        `}</style>
      </div>
    </>
  );
}