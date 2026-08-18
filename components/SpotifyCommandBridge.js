import { useEffect, useRef } from "react";

const SPOTIFY = "http://127.0.0.1:3005";

function responseFor(url, reply, extra = {}) {
  if (url.endsWith("/api/chat")) return new Response(JSON.stringify({ reply, model: "spotify/local", tool: null, ...extra }), { status: 200, headers: { "Content-Type": "application/json" } });
  const sse = `data: ${JSON.stringify({ meta: { model: "spotify/local" } })}\n\ndata: ${JSON.stringify({ token: reply })}\n\ndata: [DONE]\n\n`;
  return new Response(sse, { status: 200, headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
function parseCommand(text) {
  const t = String(text || "").trim(); const l = t.toLowerCase();
  if (/\b(youtube|video)\b/.test(l)) return null;
  if (/\b(pause|stop)\b/.test(l) && /\b(music|spotify|song|track|this)\b/.test(l)) return { action: "pause" };
  if (/\b(skip|next)\b/.test(l) && /\b(song|track|music|spotify|this)\b/.test(l)) return { action: "next" };
  if (/\b(previous|last song|go back)\b/.test(l) && /\b(song|track|music|spotify)\b/.test(l)) return { action: "previous" };
  const volume = l.match(/(?:volume|sound)\s+(?:to\s+)?(\d{1,3})/); if (volume) return { action: "volume", volume: Math.max(0, Math.min(100, Number(volume[1]))) };
  const play = t.match(/^(?:jarvis[, ]+)?(?:play|put on)\s+(.+?)(?:\s+on\s+spotify)?[.!?]*$/i);
  if (play && !/^(?:music|spotify|it|this|resume)$/i.test(play[1].trim())) return { action: "play", query: play[1].trim() };
  if (/\b(?:resume|play)\b/.test(l) && /\b(music|spotify|it|this)\b/.test(l)) return { action: "play" };
  return null;
}

export default function SpotifyCommandBridge() {
  const native = useRef(null);
  useEffect(() => {
    native.current = window.fetch.bind(window); const previous = window.fetch;
    window.fetch = async function spotifyAwareFetch(input, options = {}) {
      const url = typeof input === "string" ? input : input?.url || "";
      if (!["/api/chat", "/api/stream"].some(x => url === x || url.endsWith(x))) return previous(input, options);
      let body = {}; try { body = JSON.parse(options?.body || "{}"); } catch {}
      const text = body.messages?.[body.messages.length - 1]?.content || ""; const command = parseCommand(text); if (!command) return previous(input, options);
      try {
        const health = await native.current(`${SPOTIFY}/health`, { signal: AbortSignal.timeout(1200) });
        if (!health.ok) return previous(input, options);
        const hd = await health.json();
        if (!hd.configured || !hd.connected) {
          const reply = hd.configured ? "Spotify is ready but not authorized yet. Open the local Spotify connect page once, then I can control playback." : "Spotify control is built, but it still needs your Spotify Client ID in the local companion settings.";
          window.dispatchEvent(new CustomEvent("jarvis:hud", { detail: { action: "show", panelType: "media", title: "SPOTIFY // CONNECTION", data: { status: reply } } }));
          return responseFor(url, reply);
        }
        const r = await native.current(`${SPOTIFY}/spotify/control`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command), signal: options.signal });
        const d = await r.json(); if (!r.ok || !d.ok) return responseFor(url, `Spotify couldn't complete that: ${d.error || "unknown error"}`);
        let reply = "Done, sir.";
        if (command.action === "pause") reply = "Paused, sir."; else if (command.action === "next") reply = "Skipping it, sir."; else if (command.action === "previous") reply = "Going back one track, sir."; else if (command.action === "volume") reply = `Volume set to ${command.volume} percent.`; else if (command.query && d.track) reply = `Playing ${d.track.name} by ${d.track.artists.join(", ")}.`; else if (command.action === "play") reply = "Resuming Spotify, sir.";
        window.dispatchEvent(new CustomEvent("jarvis:hud", { detail: { action: "show", panelType: "media", title: "SPOTIFY // NOW PLAYING", data: { status: reply, track: d.track || null } } }));
        return responseFor(url, reply);
      } catch { return previous(input, options); }
    };
    return () => { window.fetch = previous; };
  }, []);
  return null;
}
