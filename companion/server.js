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
const DEFAULT_MODEL = process.env.JARVIS_MODEL || "qwen3:4b";
const DATA_DIR = process.env.JARVIS_DATA_DIR || path.join(os.homedir(), ".jarvis");
const TASKS_FILE = path.join(DATA_DIR, "tasks.json");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function allowedOrigins() {
  const extra = (process.env.JARVIS_WEB_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean);
  return new Set(["https://sribyju.github.io", ...extra]);
}
function originAllowed(origin) {
  if (!origin) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return allowedOrigins().has(origin);
}
app.use(cors({ origin(origin, cb) { cb(originAllowed(origin) ? null : new Error("Origin not paired with JARVIS"), originAllowed(origin)); } }));
app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !originAllowed(origin)) return res.status(403).json({ error: "Origin not paired with JARVIS local core" });
  next();
});

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; } }
function writeJson(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8"); }
function makeId(prefix = "j") { return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`; }
function getSettings() { return { allowLocalWrites: true, ...readJson(SETTINGS_FILE, {}) }; }
function roots() {
  const envRoots = (process.env.JARVIS_WORKSPACES || "").split(path.delimiter).filter(Boolean);
  return [...new Set([path.join(os.homedir(), "Desktop"), path.join(os.homedir(), "Documents"), path.join(os.homedir(), "Downloads"), ...envRoots].map(p => path.resolve(p)))];
}
function expandHome(p) { return String(p || "").replace(/^~(?=$|[\\/])/, os.homedir()); }
function safePath(input) {
  const resolved = path.resolve(expandHome(input));
  if (!roots().some(root => resolved === root || resolved.startsWith(root + path.sep))) throw new Error(`Path is outside approved JARVIS workspaces: ${resolved}`);
  return resolved;
}
function clip(v, n = 10000) { const s = typeof v === "string" ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n) + "…" : s; }
function memories() { return readJson(MEMORY_FILE, []); }
function saveMemory(content, tags = []) { const all = memories(); const x = { id: makeId("mem"), content: String(content), tags, createdAt: new Date().toISOString() }; all.push(x); writeJson(MEMORY_FILE, all.slice(-1000)); return x; }
function recall(query) { const q = String(query || "").toLowerCase().trim(); const all = memories(); if (!q || q === "*") return all.slice(-20); return all.filter(x => `${x.content} ${(x.tags || []).join(" ")}`.toLowerCase().includes(q)).slice(-20); }

async function ollamaHealth() {
  try { const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2200) }); if (!r.ok) return { online: false, models: [] }; const d = await r.json(); return { online: true, models: (d.models || []).map(m => m.name) }; }
  catch { return { online: false, models: [] }; }
}
async function geocode(place) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) return null; const d = await r.json(); const x = d.results?.[0];
  return x ? { name: x.name, country: x.country, latitude: x.latitude, longitude: x.longitude, timezone: x.timezone } : null;
}
async function weather(place) {
  try {
    const location = await geocode(place); if (!location) return { ok: false, error: `Could not locate ${place}` };
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { ok: false, error: "Weather service unavailable" }; const d = await r.json(); return { ok: true, location, current: d.current || {} };
  } catch (e) { return { ok: false, error: e.message }; }
}
function systemInfo() {
  const cpus = os.cpus(); return { hostname: os.hostname(), platform: process.platform, release: os.release(), arch: os.arch(), uptimeSeconds: Math.floor(os.uptime()), cpu: cpus[0]?.model || "Unknown", cores: cpus.length, totalMemory: os.totalmem(), freeMemory: os.freemem(), memoryUsagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100), workspaces: roots() };
}
function safeLaunchTarget(target, isUrl) {
  const raw = String(target || "").trim(); if (!raw) throw new Error("No target provided");
  if (isUrl) { const u = new URL(raw); if (!["http:", "https:", "spotify:"].includes(u.protocol)) throw new Error("URL protocol is not allowed"); return raw; }
  if (!/^[\w .:\-\\/()]+$/.test(raw)) throw new Error("Application target contains unsupported characters");
  return raw;
}
function openTarget(target, isUrl = false) {
  if (!canAutoRun(isUrl ? "open_url" : "open_app", getSettings())) return approvalResult(isUrl ? "open_url" : "open_app", target);
  try {
    const clean = safeLaunchTarget(target, isUrl); let child;
    if (process.platform === "win32") child = spawn("cmd.exe", ["/c", "start", "", clean], { detached: true, stdio: "ignore", windowsHide: true });
    else if (process.platform === "darwin") child = spawn("open", isUrl ? [clean] : ["-a", clean], { detached: true, stdio: "ignore" });
    else child = spawn(isUrl ? "xdg-open" : clean, isUrl ? [clean] : [], { detached: true, stdio: "ignore" });
    child.unref(); return { ok: true, opened: clean };
  } catch (e) { return { ok: false, error: e.message }; }
}
function readFileTool(filePath) { try { const p = safePath(filePath); const st = fs.statSync(p); if (st.size > 2 * 1024 * 1024) return { ok: false, error: "File exceeds 2MB read limit" }; return { ok: true, path: p, content: fs.readFileSync(p, "utf8"), size: st.size }; } catch (e) { return { ok: false, error: e.message }; } }
function listFilesTool(dir) { try { const p = safePath(dir); return { ok: true, path: p, entries: fs.readdirSync(p, { withFileTypes: true }).slice(0, 250).map(e => ({ name: e.name, type: e.isDirectory() ? "directory" : "file", path: path.join(p, e.name) })) }; } catch (e) { return { ok: false, error: e.message }; } }
function writeFileTool(filePath, content) { if (!canAutoRun("write_file", getSettings())) return approvalResult("write_file", filePath); try { const p = safePath(filePath); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, String(content ?? ""), "utf8"); return { ok: true, path: p, bytes: Buffer.byteLength(String(content ?? "")) }; } catch (e) { return { ok: false, error: e.message }; } }

const HUD_ACTIONS = ["show", "move", "resize", "clear", "save", "restore", "remove"];
const TOOL_DEFS = [
  { type: "function", function: { name: "hud", description: "Control the live JARVIS HUD. Use conversational references: if no panelId is known, target may be first, last, selected, map, weather, media, system, or mission.", parameters: { type: "object", properties: { action: { type: "string", enum: HUD_ACTIONS }, panelType: { type: "string" }, title: { type: "string" }, query: { type: "string" }, position: { type: "string", description: "left, right, center, top-left, top-right, bottom-left, bottom-right, full" }, target: { type: "string" }, panelId: { type: "string" }, width: { type: "number" }, height: { type: "number" }, data: { type: "object" } }, required: ["action"] } } },
  { type: "function", function: { name: "weather", description: "Get current weather with a free no-key service.", parameters: { type: "object", properties: { location: { type: "string" } }, required: ["location"] } } },
  { type: "function", function: { name: "system_info", description: "Read local CPU, memory, OS and workspace information.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "open_app", description: "Open a local application.", parameters: { type: "object", properties: { app: { type: "string" } }, required: ["app"] } } },
  { type: "function", function: { name: "open_url", description: "Open an http/https/spotify URL.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
  { type: "function", function: { name: "list_files", description: "List files inside an approved workspace.", parameters: { type: "object", properties: { directory: { type: "string" } }, required: ["directory"] } } },
  { type: "function", function: { name: "read_file", description: "Read a UTF-8 file inside an approved workspace.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "Create/update a file inside an approved workspace.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "remember", description: "Save a preference, decision, project fact or instruction to local memory.", parameters: { type: "object", properties: { content: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["content"] } } },
  { type: "function", function: { name: "recall", description: "Search local long-term memory.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "delegate", description: "Delegate a bounded task to TOM, SCOUT, F.R.I.D.A.Y., ATLAS, ECHO or ARGUS.", parameters: { type: "object", properties: { agent: { type: "string", enum: ["tom", "scout", "friday", "atlas", "echo", "argus"] }, task: { type: "string" } }, required: ["agent", "task"] } } },
  { type: "function", function: { name: "background_task", description: "Create a persistent background mission processed while the local companion is running.", parameters: { type: "object", properties: { agent: { type: "string" }, objective: { type: "string" } }, required: ["objective"] } } },
];

async function executeTool(name, args, context = {}) {
  switch (name) {
    case "hud": return { ok: true, hudActions: [{ ...args, id: args.panelId || makeId("panel") }] };
    case "weather": { const r = await weather(args.location); return { ...r, hudActions: r.ok ? [{ action: "show", panelType: "weather", title: `WEATHER — ${r.location.name}`, query: args.location, data: r }] : [] }; }
    case "system_info": { const data = systemInfo(); return { ok: true, data, hudActions: [{ action: "show", panelType: "system", title: "SYSTEM // LIVE", data }] }; }
    case "open_app": return openTarget(args.app, false);
    case "open_url": return openTarget(args.url, true);
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
  if (/(?:open|launch|start|play).*spotify/i.test(t)) return { reply: "Opening Spotify, sir.", model: "instant/local", toolResult: openTarget("spotify:", true), hudActions: [{ action: "show", panelType: "media", title: "SPOTIFY // READY", data: { status: "Spotify is open. Playback controls activate when the Spotify OAuth adapter is connected." } }] };
  const map = t.match(/(?:map|show me|pull up|bring up|zoom (?:into|in on))\s+(?:a map of\s+|the map of\s+|of\s+)?(.+)/i);
  if (map && /(map|zoom|where|location)/i.test(t)) return { reply: `Pulling up ${map[1]}, sir.`, model: "instant/local", hudActions: [{ action: "show", panelType: "map", title: `GEO // ${map[1].toUpperCase()}`, query: map[1], position: "center" }] };
  const wm = t.match(/(?:weather|temperature|forecast).*?(?:in|for|at)\s+(.+)/i); if (wm) return { instantTool: { name: "weather", args: { location: wm[1].replace(/[?.!]+$/, "") } } };
  if (/^(?:system status|system info|diagnostics|how(?:'s| is) (?:my )?computer)/i.test(t)) return { instantTool: { name: "system_info", args: {} } };
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
  const relevant = recall(objective).slice(-8);
  const prompt = systemPromptFor(agentId, `Relevant local memory: ${clip(relevant, 2200)}\nApproved workspaces: ${roots().join(", ")}`);
  const baseHistory = history.slice(-10).map(m => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }));
  if (baseHistory[baseHistory.length - 1]?.role === "user" && baseHistory[baseHistory.length - 1]?.content === objective) baseHistory.pop();
  const messages = [...baseHistory, { role: "user", content: objective }];
  const hudActions = []; const toolTrace = []; const maxSteps = opts.maxSteps || 6;
  const tools = TOOL_DEFS.filter(t => !opts.noDelegate || t.function.name !== "delegate");
  for (let i = 0; i < maxSteps; i++) {
    const ai = await callOllama(messages, prompt, tools);
    if (!ai.ok) return { ok: false, offline: ai.offline, error: ai.error, reply: "Local intelligence is offline. Start Ollama to enable unlimited local AI.", hudActions, toolTrace };
    const msg = ai.message; messages.push(msg); const calls = msg.tool_calls || [];
    if (!calls.length) return { ok: true, reply: String(msg.content || "Done."), model: `local/${ai.model}`, hudActions, toolTrace };
    for (const c of calls) {
      const name = c.function?.name; let args = c.function?.arguments || {}; if (typeof args === "string") { try { args = JSON.parse(args); } catch { args = {}; } }
      const result = await executeTool(name, args, opts); if (result.hudActions) hudActions.push(...result.hudActions); toolTrace.push({ name, args, ok: result.ok !== false, summary: clip(result, 800) });
      messages.push({ role: "tool", tool_name: name, content: JSON.stringify(result) });
    }
  }
  return { ok: true, reply: "I reached a safe execution checkpoint. Completed actions are reflected in the HUD; I stopped before continuing indefinitely.", model: "local/checkpoint", hudActions, toolTrace };
}

async function handleChat(payload) {
  const text = payload.message || payload.messages?.[payload.messages.length - 1]?.content || ""; const instant = instantRoute(text);
  if (instant?.instantTool) { const r = await executeTool(instant.instantTool.name, instant.instantTool.args); return { reply: r.ok === false ? (r.error || "That tool is unavailable.") : "Done, sir.", model: "instant/local", tool: null, hudActions: r.hudActions || [], toolTrace: [{ name: instant.instantTool.name, ok: r.ok !== false }] }; }
  if (instant) return { ...instant, tool: null, toolTrace: [] };
  const r = await runAgent("jarvis", text, payload.messages || [], { maxSteps: payload.mode === "thinking" ? 8 : 5 });
  return { reply: r.reply, model: r.model || (r.offline ? "local/offline" : "local"), tool: null, hudActions: r.hudActions || [], toolTrace: r.toolTrace || [], offline: r.offline, error: r.error };
}

function tasks() { return readJson(TASKS_FILE, []); }
function saveTasks(x) { writeJson(TASKS_FILE, x.slice(-500)); }
function createTask(objective, agent = "jarvis") { const all = tasks(); const x = { id: makeId("task"), objective: String(objective), agent, status: "queued", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), result: null, error: null }; all.push(x); saveTasks(all); return x; }
let workerBusy = false;
async function processOneTask() {
  if (workerBusy) return; const all = tasks(); const i = all.findIndex(t => t.status === "queued"); if (i < 0) return; workerBusy = true; all[i].status = "running"; all[i].updatedAt = new Date().toISOString(); saveTasks(all);
  try { const r = await runAgent(all[i].agent || "jarvis", all[i].objective, [], { maxSteps: 8 }); const latest = tasks(); const j = latest.findIndex(t => t.id === all[i].id); if (j >= 0) { latest[j].status = r.ok ? "complete" : "blocked"; latest[j].result = r.reply; latest[j].error = r.error || null; latest[j].hudActions = r.hudActions || []; latest[j].updatedAt = new Date().toISOString(); saveTasks(latest); } }
  catch (e) { const latest = tasks(); const j = latest.findIndex(t => t.id === all[i].id); if (j >= 0) { latest[j].status = "failed"; latest[j].error = e.message; latest[j].updatedAt = new Date().toISOString(); saveTasks(latest); } }
  finally { workerBusy = false; }
}
setInterval(processOneTask, 4000);

app.get("/health", async (_req, res) => { const oh = await ollamaHealth(); res.json({ status: "online", name: "J.A.R.V.I.S. Local Core", version: "3.1.0", platform: process.platform, ollama: oh, agents: listAgents(), workspaces: roots(), capabilities: ["local-ai", "tool-calling", "sub-agents", "background-tasks", "memory", "files", "apps", "system", "weather", "dynamic-hud", "cloud-fallback"] }); });
app.post("/v1/chat", async (req, res) => { try { const r = await handleChat(req.body || {}); if (r.offline) return res.status(503).json(r); res.json(r); } catch (e) { res.status(500).json({ error: e.message }); } });
app.post("/v1/agent", async (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); const send = x => res.write(`data: ${JSON.stringify(x)}\n\n`); const message = req.body?.message || "";
  send({ type: "status", text: "JARVIS local core online" }); send({ type: "plan", taskName: message.slice(0, 70) || "Mission", steps: ["Understand objective", "Select tools or specialist", "Execute", "Verify and report"] });
  try { send({ type: "step", index: 0 }); const r = await runAgent("jarvis", message, req.body?.messages || [], { maxSteps: 8 }); for (const trace of r.toolTrace || []) send({ type: "status", text: `${trace.name}: ${trace.ok ? "complete" : "blocked"}` }); for (const hud of r.hudActions || []) send({ type: "hud", action: hud }); send({ type: "step", index: 3 }); send({ type: "reply", text: r.reply, model: r.model || "local" }); send({ type: "done" }); }
  catch (e) { send({ type: "error", text: e.message }); } res.end();
});
app.get("/v1/tasks", (_req, res) => res.json({ ok: true, tasks: tasks() }));
app.post("/v1/tasks", (req, res) => res.json({ ok: true, task: createTask(req.body?.objective || req.body?.message || "Untitled task", req.body?.agent || "jarvis") }));
app.get("/v1/memory", (req, res) => res.json({ ok: true, memories: recall(req.query.q || "*") }));
app.post("/v1/memory", (req, res) => res.json({ ok: true, memory: saveMemory(req.body?.content || "", req.body?.tags || []) }));
app.get("/v1/integrations", (_req, res) => res.json({ ok: true, integrations: { gmail: { configured: Boolean(process.env.GMAIL_MCP_COMMAND || process.env.GMAIL_CLIENT_ID), mode: process.env.GMAIL_MCP_COMMAND ? "mcp" : "oauth-adapter" }, calendar: { configured: Boolean(process.env.GOOGLE_CALENDAR_MCP_COMMAND || process.env.GMAIL_CLIENT_ID), mode: process.env.GOOGLE_CALENDAR_MCP_COMMAND ? "mcp" : "oauth-adapter" }, buffer: { configured: Boolean(process.env.BUFFER_MCP_COMMAND || process.env.BUFFER_ACCESS_TOKEN), mode: process.env.BUFFER_MCP_COMMAND ? "mcp" : "api-adapter" }, spotify: { configured: Boolean(process.env.SPOTIFY_CLIENT_ID), mode: "oauth" }, github: { configured: Boolean(process.env.GITHUB_TOKEN), mode: "git-or-token" } } }));
app.post("/v1/action", async (req, res) => { try { res.json(await executeTool(req.body?.name, req.body?.args || {})); } catch (e) { res.status(500).json({ ok: false, error: e.message }); } });
app.listen(PORT, "127.0.0.1", () => { console.log(`J.A.R.V.I.S. Local Core v3.1 online at http://127.0.0.1:${PORT}`); console.log(`Approved workspaces: ${roots().join(" | ")}`); processOneTask(); });
