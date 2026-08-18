const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.JARVIS_SPOTIFY_PORT || 3005);
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || `http://127.0.0.1:${PORT}/spotify/callback`;
const STORE = path.join(process.env.JARVIS_DATA_DIR || path.join(os.homedir(), ".jarvis"), "spotify.json");
const SCOPES = ["user-read-playback-state", "user-modify-playback-state", "user-read-currently-playing"].join(" ");
fs.mkdirSync(path.dirname(STORE), { recursive: true });

function allowedOrigins() { return new Set(["https://sribyju.github.io", ...(process.env.JARVIS_WEB_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean)]); }
function originAllowed(origin) { return !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || allowedOrigins().has(origin); }
app.use(cors({ origin(origin, cb) { cb(originAllowed(origin) ? null : new Error("Origin not paired with JARVIS Spotify adapter"), originAllowed(origin)); } }));
app.use(express.json({ limit: "1mb" }));

function load() { try { return JSON.parse(fs.readFileSync(STORE, "utf8")); } catch { return {}; } }
function save(x) { fs.writeFileSync(STORE, JSON.stringify(x, null, 2), "utf8"); }
function b64url(buf) { return Buffer.from(buf).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
function challenge(verifier) { return b64url(crypto.createHash("sha256").update(verifier).digest()); }

async function tokenRequest(params) {
  const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params), signal: AbortSignal.timeout(12000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.error || `Spotify token HTTP ${r.status}`);
  return d;
}
async function accessToken() {
  const s = load();
  if (s.access_token && Date.now() < (s.expires_at || 0) - 30000) return s.access_token;
  if (!s.refresh_token || !CLIENT_ID) throw new Error("Spotify is not connected");
  const d = await tokenRequest({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: s.refresh_token });
  const next = { ...s, ...d, refresh_token: d.refresh_token || s.refresh_token, expires_at: Date.now() + Number(d.expires_in || 3600) * 1000 };
  save(next); return next.access_token;
}
async function api(endpoint, options = {}) {
  const token = await accessToken();
  const r = await fetch(`https://api.spotify.com/v1${endpoint}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }, signal: AbortSignal.timeout(12000) });
  if (r.status === 204) return { ok: true };
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || `Spotify API HTTP ${r.status}`);
  return d;
}

app.get("/health", (_req, res) => res.json({ ok: true, configured: Boolean(CLIENT_ID), connected: Boolean(load().refresh_token), redirectUri: REDIRECT_URI }));
app.get("/spotify/connect", (_req, res) => {
  if (!CLIENT_ID) return res.status(503).send("Set SPOTIFY_CLIENT_ID in companion/.env first.");
  const verifier = b64url(crypto.randomBytes(48)); const state = b64url(crypto.randomBytes(16)); save({ ...load(), verifier, state });
  const q = new URLSearchParams({ client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI, scope: SCOPES, code_challenge_method: "S256", code_challenge: challenge(verifier), state });
  res.redirect(`https://accounts.spotify.com/authorize?${q}`);
});
app.get("/spotify/callback", async (req, res) => {
  try {
    const s = load(); if (!req.query.code || req.query.state !== s.state) throw new Error("Spotify authorization state mismatch");
    const d = await tokenRequest({ client_id: CLIENT_ID, grant_type: "authorization_code", code: req.query.code, redirect_uri: REDIRECT_URI, code_verifier: s.verifier });
    save({ ...d, refresh_token: d.refresh_token, expires_at: Date.now() + Number(d.expires_in || 3600) * 1000 });
    res.send("<!doctype html><body style='background:#020713;color:#7ecfff;font-family:system-ui;padding:40px'>Spotify connected to J.A.R.V.I.S. You may close this tab.</body>");
  } catch (e) { res.status(400).send(`Spotify connection failed: ${e.message}`); }
});
app.get("/spotify/status", async (_req, res) => {
  try {
    const p = await api("/me/player");
    res.json({ ok: true, connected: true, playing: Boolean(p.is_playing), item: p.item ? { name: p.item.name, artists: (p.item.artists || []).map(a => a.name), uri: p.item.uri, durationMs: p.item.duration_ms } : null, volume: p.device?.volume_percent, device: p.device?.name || null });
  } catch (e) { res.json({ ok: false, connected: Boolean(load().refresh_token), error: e.message }); }
});
app.post("/spotify/control", async (req, res) => {
  try {
    const action = req.body?.action; const query = req.body?.query; const volume = Number(req.body?.volume);
    if (action === "play" && query) {
      const s = await api(`/search?q=${encodeURIComponent(query)}&type=track&limit=1`); const track = s.tracks?.items?.[0]; if (!track) throw new Error(`No Spotify track found for ${query}`);
      await api("/me/player/play", { method: "PUT", body: JSON.stringify({ uris: [track.uri] }) });
      return res.json({ ok: true, action, track: { name: track.name, artists: track.artists.map(a => a.name), uri: track.uri } });
    }
    if (action === "play") await api("/me/player/play", { method: "PUT" });
    else if (action === "pause") await api("/me/player/pause", { method: "PUT" });
    else if (action === "next") await api("/me/player/next", { method: "POST" });
    else if (action === "previous") await api("/me/player/previous", { method: "POST" });
    else if (action === "volume" && Number.isFinite(volume)) await api(`/me/player/volume?volume_percent=${Math.max(0, Math.min(100, Math.round(volume)))}`, { method: "PUT" });
    else throw new Error("Unknown Spotify control action");
    res.json({ ok: true, action });
  } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

app.listen(PORT, "127.0.0.1", () => console.log(`JARVIS Spotify adapter online at http://127.0.0.1:${PORT}`));
