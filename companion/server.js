const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { listAgents, systemPromptFor } = require("./agents");
const { canAutoRun, approvalResult } = require("./policy");

const app = express();
const PORT = Number(process.env.JARVIS_PORT || 3003);
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const MCP_URL = `http://127.0.0.1:${Number(process.env.JARVIS_MCP_PORT || 3004)}`;
const SPOTIFY_URL = `http://127.0.0.1:${Number(process.env.JARVIS_SPOTIFY_PORT || 3005)}`;
const BROWSER_URL = `http://127.0.0.1:${Number(process.env.JARVIS_BROWSER_PORT || 3006)}`;
const DEFAULT_MODEL = process.env.JARVIS_MODEL || "qwen3:4b";
const DATA_DIR = process.env.JARVIS_DATA_DIR || path.join(os.homedir(), ".jarvis");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function allowedOrigins() { const extra = (process.env.JARVIS_WEB_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean); return new Set(["https://sribyju.github.io", ...extra]); }
function originAllowed(origin) { return !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || allowedOrigins().has(origin); }
app.use(cors({ origin(origin, cb) { const ok = originAllowed(origin); cb(ok ? null : new Error("Origin not paired with JARVIS"), ok); } }));
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => { const origin = req.headers.origin; if (origin && !originAllowed(origin)) return res.status(403).json({ error: "Origin not paired with JARVIS local core" }); next(); });

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8"); }
function makeId(prefix = "j") { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`; }
function getSettings() { return { allowLocalWrites: true, ...readJson(SETTINGS_FILE, {}) }; }
function roots() { const envRoots = (process.env.JARVIS_WORKSPACES || "").split(path.delimiter).filter(Boolean); return [...new Set([path.join(os.homedir(), "Desktop"), path.join(os.homedir(), "Documents"), path.join(os.homedir(), "Downloads"), ...envRoots].map(p => path.resolve(p)))]; }
function expandHome(p) { return String(p || "").replace(/^~(?=$|[\\/])/, os.homedir()); }
function safePath(input) { const resolved = path.resolve(expandHome(input)); if (!roots().some(root => resolved === root || resolved.startsWith(root + path.sep))) throw new Error(`Path is outside approved JARVIS workspaces: ${resolved}`); return resolved; }
function clip(v, n = 10000) { const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…" : s; }
function memories() { return readJson(MEMORY_FILE, []); }
function saveMemory(content, tags = []) { const all = memories(); const x = { id: makeId("mem"), content: String(content), tags, createdAt: new Date().toISOString() }; all.push(x); writeJson(MEMORY_FILE, all.slice(-1000)); return x; }
function recall(query) { const q = String(query || "").toLowerCase().trim(); const all = memories(); if (!q || q === "*") return all.slice(-20); return all.filter(x => `${x.content} ${(x.tags || []).join(" ")}`.toLowerCase().includes(q)).slice(-20); }

async function jsonFetch(url, options = {}, timeout = 12000) {
  try { const r = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(timeout) }); const d = await r.json().catch(() => ({})); return { ok: r.ok && d.ok !== false, status: r.status, data: d, error: r.ok ? d.error : (d.error || `HTTP ${r.status}`) }; }
  catch (e) { return { ok: false, status: 0, data: {}, error: e.message }; }
}
async function ollamaHealth() { try { const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2200) }); if (!r.ok) return { online: false, models: [] }; const d = await r.json(); return { online: true, models: (d.models || []).map(m => m.name) }; } catch { return { online: false, models: [] }; } }
async function geocode(place) { const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`, { signal: AbortSignal.timeout(5000) }); if (!r.ok) return null; const d = await r.json(); const x = d.results?.[0]; return x ? { name: x.name, country: x.country, latitude: x.latitude, longitude: x.longitude, timezone: x.timezone } : null; }
async function weather(place) { try { const location = await geocode(place); if (!location) return { ok: false, error: `Could not locate ${place}` }; const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`, { signal: AbortSignal.timeout(6000) }); if (!r.ok) return { ok: false, error: "Weather service unavailable" }; const d = await r.json(); return { ok: true, location, current: d.current || {} }; } catch (e) { return { ok: false, error: e.message }; } }
function systemInfo() { const cpus = os.cpus(); return { hostname: os.hostname(), platform: process.platform, release: os.release(), arch: os.arch(), uptimeSeconds: Math.floor(os.uptime()), cpu: cpus[0]?.model || "Unknown", cores: cpus.length, totalMemory: os.totalmem(), freeMemory: os.freemem(), memoryUsagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100), workspaces: roots() }; }
function safeLaunchTarget(target, isUrl) { const raw = String(target || "").trim(); if (!raw) throw new Error("No target provided"); if (isUrl) { const u = new URL(raw); if (!["http:", "https:", "spotify:"].includes(u.protocol)) throw new Error("URL protocol is not allowed"); return raw; } if (!/^[\w .:\-\\/()]+$/.test(raw)) throw new Error("Application target contains unsupported characters"); return raw; }
function openTarget(target, isUrl = false) { if (!canAutoRun(isUrl ? "open_url" : "open_app", getSettings())) return approvalResult(isUrl ? "open_url" : "open_app", target); try { const clean = safeLaunchTarget(target, isUrl); let child; if (process.platform === "win32") child = spawn("cmd.exe", ["/c", "start", "", clean], { detached: true, stdio: "ignore", windowsHide: true }); else if (process.platform === "darwin") child = spawn("open", isUrl ? [clean] : ["-a", clean], { detached: true, stdio: "ignore" }); else child = spawn(isUrl ? "xdg-open" : clean, isUrl ? [clean] : [], { detached: true, stdio: "ignore" }); child.unref(); return { ok: true, opened: clean }; } catch (e) { return { ok: false, error: e.message }; } }
function readFileTool(filePath) { try { const p = safePath(filePath); const st = fs.statSync(p); if (st.size > 2 * 1024 * 1024) return { ok: false, error: "File exceeds 2MB read limit" }; return { ok: true, path: p, content: fs.readFileSync(p, "utf8"), size: st.size }; } catch (e) { return { ok: false, error: e.message }; } }
function listFilesTool(dir) { try { const p = safePath(dir); return { ok: true, path: p, entries: fs.readdirSync(p, { withFileTypes: true }).slice(0, 250).map(e => ({ name: e.name, type: e.isDirectory() ? "directory" : "file", path: path.join(p, e.name) })) }; } catch (e) { return { ok: false, error: e.message }; } }
function writeFileTool(filePath, content) { if (!canAutoRun("write_file", getSettings())) return approvalResult("write_file", filePath); try { const p = safePath(filePath); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, String(content ?? ""), "utf8"); return { ok: true, path: p, bytes: Buffer.byteLength(String(content ?? "")) }; } catch (e) { return { ok: false, error: e.message }; } }

function riskyBrowserAction(args = {}) { const action = String(args.action || "").toLowerCase(); const text = String(args.text || args.label || args.key || "").toLowerCase(); if (action === "press" && /^(enter|return)$/i.test(text)) return true; if (action === "click" && /(submit|send|purchase|buy|pay|delete|remove|publish|post|confirm|book|reserve|place order|sign out|log out)/i.test(text)) return true; return false; }
function riskyMcpTool(name = "") { return /(send|reply|post|publish|delete|remove|purchase|pay|submit|book|reserve|invite|create.*event|update.*event|cancel)/i.test(String(name)); }

const HUD_ACTIONS = ["show", "move", "resize", "clear", "save", "restore", "remove"];
const TOOL_DEFS = [
  { type: "function", function: { name: "hud", description: "Control the live JARVIS HUD. If panelId is unknown, target can be first, last, selected, map, weather, media, system, mission, briefing, browser, or integration.", parameters: { type: "object", properties: { action: { type: "string", enum: HUD_ACTIONS }, panelType: { type: "string" }, title: { type: "string" }, query: { type: "string" }, position: { type: "string" }, target: { type: "string" }, panelId: { type: "string" }, width: { type: "number" }, height: { type: "number" }, data: { type: "object" } }, required: ["action"] } } },
  { type: "function", function: { name: "weather", description: "Get current weather using a free no-key service.", parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] } } },
  { type: "function", function: { name: "system_info", description: "Read local CPU, memory, OS and workspace information.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "open_app", description: "Open a local application.", parameters: { type: "object", properties: { app: { type: "string" } }, required: ["app"] } } },
  { type: "function", function: { name: "open_url", description: "Open an http/https/spotify URL in the default browser/app.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
  { type: "function", function: { name: "browser", description: "Operate the dedicated persistent JARVIS Chrome profile. Use open/new_tab/tabs/select_tab/extract/click/fill/press/screenshot. Prefer extract before clicking when the page structure is uncertain.", parameters: { type: "object", properties: { action: { type: "string", enum: ["open", "new_tab", "tabs", "select_tab", "extract", "click", "fill", "press", "screenshot"] }, url: { type: "string" }, index: { type: "number" }, text: { type: "string" }, label: { type: "string" }, value: { type: "string" }, key: { type: "string" } }, required: ["action"] } } },
  { type: "function", function: { name: "spotify", description: "Control connected Spotify playback without using an AI API. Supports status, play, pause, next, previous, volume; play may include a song/artist query.", parameters: { type: "object", properties: { action: { type: "string", enum: ["status", "play", "pause", "next", "previous", "volume"] }, query: { type: "string" }, volume: { type: "number" } }, required: ["action"] } } },
  { type: "function", function: { name: "mcp", description: "Use a configured MCP integration (gmail, calendar, buffer). First list tools if you do not know the exact tool name. External/destructive MCP calls are permission-gated.", parameters: { type: "object", properties: { integration: { type: "string", enum: ["gmail", "calendar", "buffer"] }, action: { type: "string", enum: ["list", "call"] }, tool: { type: "string" }, args: { type: "object" } }, required: ["integration", "action"] } } },
  { type: "function", function: { name: "briefing", description: "Build an executive briefing from local missions, system health, integration status, and recent memory.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_files", description: "List files inside an approved workspace.", parameters: { type: "object", properties: { directory: { type: "string" } }, required: ["directory"] } } },
  { type: "function", function: { name: "read_file", description: "Read a UTF-8 file inside an approved workspace.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "Create/update a file inside an approved workspace.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "remember", description: "Save a preference, decision, project fact or instruction to local memory.", parameters: { type: "object", properties: { content: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["content"] } } },
  { type: "function", function: { name: "recall", description: "Search local long-term memory.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "delegate", description: "Delegate a bounded task to TOM, SCOUT, F.R.I.D.A.Y., ATLAS, ECHO or ARGUS.", parameters: { type: "object", properties: { agent: { type: "string", enum: ["tom", "scout", "friday", "atlas", "echo", "argus"] }, task: { type: "string" } }, required: ["agent", "task"] } } },
  { type: "function", function: { name: "background_task", description: "Create a persistent background mission processed while the local companion is running.", parameters: { type: "object", properties: { agent: { type: "string" }, objective: { type: "string" } }, required: ["objective"] } } },
];

async function browserTool(args) {
  if (riskyBrowserAction(args)) return approvalResult(`browser_${args.action}`, args);
  const action = args.action; let pathName = `/browser/${action.replace("new_tab", "new-tab").replace("select_tab", "select-tab")}`; let method = "POST"; let body = { ...args };
  if (["tabs", "extract", "screenshot"].includes(action)) method = "GET";
  const r = await jsonFetch(`${BROWSER_URL}${pathName}`, method === "GET" ? {} : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }, 35000);
  if (!r.ok) return { ok: false, error: r.error };
  const d = r.data;
  const hud = action === "screenshot" ? [{ action: "show", panelType: "browser", title: "BROWSER // SCREEN", data: { image: d.image, url: d.url, title: d.title } }] : action === "extract" ? [{ action: "show", panelType: "browser", title: `BROWSER // ${(d.title || "PAGE").toUpperCase()}`, data: { url: d.url, title: d.title, text: clip(d.text, 5000), links: d.links?.slice(0, 12), buttons: d.buttons?.slice(0, 12) } }] : [];
  return { ok: true, browser: d, hudActions: hud };
}
async function spotifyTool(args) {
  const endpoint = args.action === "status" ? "/spotify/status" : "/spotify/control"; const r = await jsonFetch(`${SPOTIFY_URL}${endpoint}`, args.action === "status" ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (!r.ok) return { ok: false, error: r.error || "Spotify unavailable" };
  const d = r.data; const status = d.track ? `Playing ${d.track.name} by ${(d.track.artists || []).join(", ")}` : d.item ? `${d.playing ? "Playing" : "Paused"}: ${d.item.name} by ${(d.item.artists || []).join(", ")}` : `Spotify ${args.action} complete`;
  return { ok: true, spotify: d, hudActions: [{ action: "show", panelType: "media", title: "SPOTIFY // LIVE", data: { status, track: d.track || d.item || null, volume: d.volume, device: d.device } }] };
}
async function mcpTool(args) {
  const integration = args.integration; if (!integration) return { ok: false, error: "integration is required" };
  if (args.action === "list") { const r = await jsonFetch(`${MCP_URL}/${integration}/tools`); return r.ok ? { ok: true, integration, tools: r.data.tools || [], hudActions: [{ action: "show", panelType: "integration", title: `${integration.toUpperCase()} // TOOLS`, data: { count: (r.data.tools || []).length, tools: (r.data.tools || []).map(t => t.name) } }] } : { ok: false, error: r.error }; }
  if (!args.tool) return { ok: false, error: "tool is required for MCP call" }; if (riskyMcpTool(args.tool)) return approvalResult(`mcp_${integration}_${args.tool}`, args.args || {});
  const r = await jsonFetch(`${MCP_URL}/${integration}/call`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool: args.tool, args: args.args || {} }) }, 35000);
  return r.ok ? { ok: true, integration, result: r.data.result } : { ok: false, error: r.error };
}
async function briefingTool() {
  const allTasks = tasks(); const recent = allTasks.slice(-12); const completed = recent.filter(t => t.status === "complete"); const active = recent.filter(t => ["queued", "running"].includes(t.status)); const blocked = recent.filter(t => ["blocked", "failed"].includes(t.status));
  const [mcp, spotify, browser] = await Promise.all([jsonFetch(`${MCP_URL}/health`, {}, 1800), jsonFetch(`${SPOTIFY_URL}/health`, {}, 1800), jsonFetch(`${BROWSER_URL}/health`, {}, 2500)]);
  const data = { generatedAt: new Date().toISOString(), system: systemInfo(), missions: { active, completed, blocked }, integrations: { mcp: mcp.data?.integrations || {}, spotify: spotify.data || {}, browser: browser.data || {} }, recentMemory: memories().slice(-8) };
  return { ok: true, data, hudActions: [{ action: "show", panelType: "briefing", title: "JARVIS // EXECUTIVE BRIEFING", position: "center", data }] };
}

async function executeTool(name, args, context = {}) {
  switch (name) {
    case "hud": return { ok: true, hudActions: [{ ...args, id: args.panelId || makeId("panel") }] };
    case "weather": { const r = await weather(args.location); return { ...r, hudActions: r.ok ? [{ action: "show", panelType: "weather", title: `WEATHER — ${r.location.name}`, query: args.location, data: r }] : [] }; }
    case "system_info": { const data = systemInfo(); return { ok: true, data, hudActions: [{ action: "show", panelType: "system", title: "SYSTEM // LIVE", data }] }; }
    case "open_app": return openTarget(args.app, false);
    case "open_url": return openTarget(args.url, true);
    case "browser": return browserTool(args);
    case "spotify": return spotifyTool(args);
    case "mcp": return mcpTool(args);
    case "briefing": return briefingTool();
    case "list_files": return listFilesTool(args.directory);
    case "read_file": return readFileTool(args.path);
    case "write_file": return writeFileTool(args.path, args.content);
    case "remember": return { ok: true, memory: saveMemory(args.content, args.tags || []) };
    case "recall": return { ok: true, memories: recall(args.query) };
    case "delegate": { if (context.noDelegate) return { ok: false, error: "Nested delegation disabled" }; const r = await runAgent(args.agent, args.task, [], { noDelegate: true, maxSteps: 5 }); return { ok: r.ok, agent: args.agent, result: r.reply, error: r.error, hudActions: r.hudActions || [] }; }
    case "background_task": { const task = createTask(args.objective, args.agent || "jarvis"); return { ok: true, task, hudActions: [{ action: "show", panelType: "mission", title: "MISSION CREATED", data: task }] }; }
    default: return { ok: false, error: `Unknown tool: ${name}` };
  }
}

function instantRoute(text) {
  const t = String(text || "").trim();
  if (/^(?:clear|wipe|close|remove|get rid of) (?:the )?(?:hud|screen|everything|all(?: of it)?)/i.test(t)) return { reply: "Clearing the workspace, sir.", model: "instant/local", hudActions: [{ action: "clear" }] };
  if (/save (?:this |the )?(?:hud|layout|workspace)/i.test(t)) return { reply: "Workspace saved, sir.", model: "instant/local", hudActions: [{ action: "save" }] };
  if (/(?:restore|bring back|load) (?:my |the )?(?:hud|layout|workspace)/i.test(t)) return { reply: "Restoring your workspace, sir.", model: "instant/local", hudActions: [{ action: "restore" }] };
  if (/\b(?:what did i miss|brief me|give me (?:a )?briefing|how(?:'s| is) everything doing|catch me up on everything)\b/i.test(t)) return { instantTool: { name: "briefing", args: {} } };
  const wm = t.match(/(?:weather|temperature|forecast).*?(?:in|for|at)\s+(.+)/i); if (wm) return { instantTool: { name: "weather", args: { location: wm[1].replace(/[?.!]+$/, "") } } };
  if (/^(?:system status|system info|diagnostics|how(?:'s| is) (?:my )?computer)/i.test(t)) return { instantTool: { name: "system_info", args: {} } };
  const map = t.match(/(?:map|show me|pull up|bring up|zoom (?:into|in on))\s+(?:a map of\s+|the map of\s+|of\s+)?(.+)/i); if (map && /(map|zoom|where|location)/i.test(t)) return { reply: `Pulling up ${map[1]}, sir.`, model: "instant/local", hudActions: [{ action: "show", panelType: "map", title: `GEO // ${map[1].toUpperCase()}`, query: map[1], position: "center" }] };
  const open = t.match(/^(?:jarvis[, ]+)?(?:open|launch|start)\s+(.+)/i); if (open && !/^https?:/i.test(open[1])) return { instantTool: { name: "open_app", args: { app: open[1].trim() } } };
  return null;
}

async function callOllama(messages, systemPrompt, tools) {
  const h = await ollamaHealth(); if (!h.online) return { ok: false, offline: true, error: "Ollama is not running" };
  const preferred = process.env.JARVIS_MODEL || (h.models.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : h.models[0]); if (!preferred) return { ok: false, offline: true, error: "No Ollama model installed" };
  const r = await fetch(`${OLLAMA_URL}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: preferred, messages: [{ role: "system", content: systemPrompt }, ...messages], tools, stream: false, options: { temperature: 0.22 } }), signal: AbortSignal.timeout(90000) });
  if (!r.ok) return { ok: false, error: `Ollama HTTP ${r.status}: ${clip(await r.text(), 500)}` }; const d = await r.json(); return { ok: true, model: d.model || preferred, message: d.message || {} };
}

async function runAgent(agentId, objective, history = [], opts = {}) {
  const relevant = recall(objective).slice(-8); const prompt = systemPromptFor(agentId, `Relevant local memory: ${clip(relevant, 2200)}\nApproved workspaces: ${roots().join(", ")}\nBrowser service: ${BROWSER_URL}. MCP bridge: ${MCP_URL}. Spotify: ${SPOTIFY_URL}.`);
  const baseHistory = history.slice(-10).map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) })); if (baseHistory[baseHistory.length - 1]?.role === "user" && baseHistory[baseHistory.length - 1]?.content === objective) baseHistory.pop(); const messages = [...baseHistory, { role: "user", content: objective }];
  const hudActions = []; const toolTrace = []; const maxSteps = opts.maxSteps || 6; const tools = TOOL_DEFS.filter(t => !opts.noDelegate || t.function.name !== "delegate");
  for (let i = 0; i < maxSteps; i++) {
    const ai = await callOllama(messages, prompt, tools); if (!ai.ok) return { ok: false, offline: ai.offline, error: ai.error, reply: "Local intelligence is offline. Start Ollama to enable unlimited local AI.", hudActions, toolTrace };
    const msg = ai.message; messages.push(msg); const calls = msg.tool_calls || []; if (!calls.length) return { ok: true, reply: String(msg.content || "Done."), model: `local/${ai.model}`, hudActions, toolTrace };
    for (const c of calls) { const name = c.function?.name; let args = c.function?.arguments || {}; if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } } const result = await executeTool(name, args, opts); if (result.hudActions) hudActions.push(...result.hudActions); toolTrace.push({ name, args, ok: result.ok !== false, approvalRequired: Boolean(result.approvalRequired), summary: clip(result, 900) }); messages.push({ role: "tool", tool_name: name, content: JSON.stringify(result) }); }
  }
  return { ok: true, reply: "I reached a safe execution checkpoint. Completed actions are reflected in the HUD; I stopped before continuing indefinitely.", model: "local/checkpoint", hudActions, toolTrace };
}

async function handleChat(payload) {
  const text = payload.message || payload.messages?.[payload.messages.length - 1]?.content || ""; const instant = instantRoute(text);
  if (instant?.instantTool) { const r = await executeTool(instant.instantTool.name, instant.instantTool.args); let reply = r.ok === false ? (r.error || r.message || "That tool is unavailable.") : "Done, sir."; if (instant.instantTool.name === "briefing" && r.ok) { const a = r.data?.missions?.active?.length || 0, c = r.data?.missions?.completed?.length || 0, b = r.data?.missions?.blocked?.length || 0; reply = `Briefing ready, sir. ${a} mission${a === 1 ? " is" : "s are"} active, ${c} completed recently, and ${b} need attention.`; } return { reply, model: "instant/local", tool: null, hudActions: r.hudActions || [], toolTrace: [{ name: instant.instantTool.name, ok: r.ok !== false }] }; }
  if (instant) return { ...instant, tool: null, toolTrace: [] };
  const r = await runAgent("jarvis", text, payload.messages || [], { maxSteps: payload.mode === "thinking" ? 8 : 5 }); return { reply: r.reply, model: r.model || (r.offline ? "local/offline" : "local"), tool: null, hudActions: r.hudActions || [], toolTrace: r.toolTrace || [], offline: r.offline, error: r.error };
}

function tasks() { return readJson(TASKS_FILE, []); }
function saveTasks(x) { writeJson(TASKS_FILE, x.slice(-500)); }
function createTask(objective, agent = "jarvis") { const all = tasks(); const x = { id: makeId("task"), objective: String(objective), agent, status: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), result: null, error: null }; all.push(x); saveTasks(all); return x; }
let workerBusy = false;
async function processOneTask() { if (workerBusy) return; const all = tasks(); const i = all.findIndex(t => t.status === "queued"); if (i < 0) return; workerBusy = true; all[i].status = "running"; all[i].updatedAt = new Date().toISOString(); saveTasks(all); try { const r = await runAgent(all[i].agent || "jarvis", all[i].objective, [], { maxSteps: 8 }); const latest = tasks(); const j = latest.findIndex(t => t.id === all[i].id); if (j >= 0) { latest[j].status = r.ok ? "complete" : "blocked"; latest[j].result = r.reply; latest[j].error = r.error || null; latest[j].hudActions = r.hudActions || []; latest[j].toolTrace = r.toolTrace || []; latest[j].updatedAt = new Date().toISOString(); saveTasks(latest); } } catch (e) { const latest = tasks(); const j = latest.findIndex(t => t.id === all[i].id); if (j >= 0) { latest[j].status = "failed"; latest[j].error = e.message; latest[j].updatedAt = new Date().toISOString(); saveTasks(latest); } } finally { workerBusy = false; } }
setInterval(processOneTask, 4000);

app.get("/health", async (_req, res) => { const oh = await ollamaHealth(); const [mcp, spotify, browser] = await Promise.all([jsonFetch(`${MCP_URL}/health`, {}, 1000), jsonFetch(`${SPOTIFY_URL}/health`, {}, 1000), jsonFetch(`${BROWSER_URL}/health`, {}, 1600)]); res.json({ status: "online", name: "J.A.R.V.I.S. Local Core", version: "3.2.0", platform: process.platform, ollama: oh, agents: listAgents(), workspaces: roots(), services: { mcp: mcp.ok, spotify: spotify.ok, browser: browser.ok && browser.data?.connected }, capabilities: ["local-ai", "tool-calling", "sub-agents", "background-tasks", "memory", "files", "apps", "browser", "mcp", "spotify", "briefing", "system", "weather", "dynamic-hud", "cloud-fallback"] }); });
app.post("/v1/chat", async (req, res) => { try { const r = await handleChat(req.body || {}); if (r.offline) return res.status(503).json(r); res.json(r); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/v1/agent", async (req, res) => { res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); const send = x => res.write(`data: ${JSON.stringify(x)}\n\n`); const message = req.body?.message || ""; send({ type: "status", text: "JARVIS local core online" }); send({ type: "plan", taskName: message.slice(0, 70) || "Mission", steps: ["Understand objective", "Select tools or specialist", "Execute", "Verify and report"] }); try { send({ type: "step", index: 0 }); const r = await runAgent("jarvis", message, req.body?.messages || [], { maxSteps: 8 }); for (const trace of r.toolTrace || []) send({ type: "status", text: `${trace.name}: ${trace.approvalRequired ? "approval needed" : trace.ok ? "complete" : "blocked"}` }); for (const hud of r.hudActions || []) send({ type: "hud", action: hud }); send({ type: "step", index: 3 }); send({ type: "reply", text: r.reply, model: r.model || "local" }); send({ type: "done" }); } catch (e) { send({ type: "error", text: e.message }); } res.end(); });
app.get("/v1/tasks", (_req, res) => res.json({ ok: true, tasks: tasks() }));
app.post("/v1/tasks", (req, res) => res.json({ ok: true, task: createTask(req.body?.objective || req.body?.message || "Untitled task", req.body?.agent || "jarvis") }));
app.get("/v1/briefing", async (_req, res) => { try { res.json(await briefingTool()); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.get("/v1/memory", (req, res) => res.json({ ok: true, memories: recall(req.query.q || "*") }));
app.post("/v1/memory", (req, res) => res.json({ ok: true, memory: saveMemory(req.body?.content || "", req.body?.tags || []) }));
app.get("/v1/integrations", (_req, res) => res.json({ ok: true, integrations: { gmail: { configured: Boolean(process.env.GMAIL_MCP_COMMAND || process.env.GMAIL_CLIENT_ID), mode: process.env.GMAIL_MCP_COMMAND ? "mcp" : "oauth-adapter" }, calendar: { configured: Boolean(process.env.GOOGLE_CALENDAR_MCP_COMMAND || process.env.GMAIL_CLIENT_ID), mode: process.env.GOOGLE_CALENDAR_MCP_COMMAND ? "mcp" : "oauth-adapter" }, buffer: { configured: Boolean(process.env.BUFFER_MCP_COMMAND || process.env.BUFFER_ACCESS_TOKEN), mode: process.env.BUFFER_MCP_COMMAND ? "mcp" : "api-adapter" }, spotify: { configured: Boolean(process.env.SPOTIFY_CLIENT_ID), mode: "oauth-pkce" }, browser: { configured: true, mode: "playwright-local" }, github: { configured: Boolean(process.env.GITHUB_TOKEN), mode: "git-or-token" } } }));
app.post("/v1/action", async (req, res) => { try { res.json(await executeTool(req.body?.name, req.body?.args || {})); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.listen(PORT, "127.0.0.1", () => { console.log(`J.A.R.V.I.S. Local Core v3.2 online at http://127.0.0.1:${PORT}`); console.log(`Approved workspaces: ${roots().join(" | ")}`); processOneTask(); });
