const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");

const PORT = Number(process.env.JARVIS_MCP_PORT || 3004);
const PROTOCOL_VERSION = process.env.MCP_PROTOCOL_VERSION || "2025-03-26";

const COMMANDS = {
  gmail: process.env.GMAIL_MCP_COMMAND || "",
  calendar: process.env.GOOGLE_CALENDAR_MCP_COMMAND || "",
  buffer: process.env.BUFFER_MCP_COMMAND || "",
};

class McpClient {
  constructor(name, command) {
    this.name = name;
    this.command = command;
    this.proc = null;
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.initialized = false;
    this.tools = [];
  }

  async start() {
    if (this.proc && !this.proc.killed) return;
    if (!this.command) throw new Error(`${this.name} MCP command is not configured`);
    this.proc = spawn(this.command, { shell: true, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", chunk => this.onData(chunk));
    this.proc.stderr.on("data", chunk => process.stderr.write(`[MCP:${this.name}] ${chunk}`));
    this.proc.on("exit", code => {
      this.initialized = false;
      this.proc = null;
      for (const [, p] of this.pending) p.reject(new Error(`${this.name} MCP exited (${code})`));
      this.pending.clear();
    });

    const init = await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "jarvis-local-core", version: "3.0.0" },
    });
    this.send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    this.initialized = true;
    const listed = await this.request("tools/list", {});
    this.tools = listed?.tools || [];
    return init;
  }

  onData(chunk) {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let msg;
      try { msg = JSON.parse(trimmed); } catch { continue; }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else p.resolve(msg.result);
      }
    }
  }

  send(message) {
    if (!this.proc?.stdin?.writable) throw new Error(`${this.name} MCP is not running`);
    this.proc.stdin.write(JSON.stringify(message) + "\n");
  }

  request(method, params) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name} MCP timed out during ${method}`));
      }, 30000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  async listTools() {
    await this.start();
    const result = await this.request("tools/list", {});
    this.tools = result?.tools || [];
    return this.tools;
  }

  async callTool(name, args = {}) {
    await this.start();
    if (!this.tools.some(t => t.name === name)) await this.listTools();
    if (!this.tools.some(t => t.name === name)) throw new Error(`Tool ${name} is not exposed by ${this.name} MCP`);
    return this.request("tools/call", { name, arguments: args });
  }
}

const clients = Object.fromEntries(Object.entries(COMMANDS).map(([name, command]) => [name, new McpClient(name, command)]));
const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    name: "JARVIS MCP Bridge",
    version: "3.0.0",
    integrations: Object.fromEntries(Object.entries(clients).map(([name, c]) => [name, { configured: Boolean(c.command), connected: Boolean(c.initialized) }])),
  });
});

app.get("/:integration/tools", async (req, res) => {
  const client = clients[req.params.integration];
  if (!client) return res.status(404).json({ ok: false, error: "Unknown integration" });
  try { res.json({ ok: true, tools: await client.listTools() }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

app.post("/:integration/call", async (req, res) => {
  const client = clients[req.params.integration];
  if (!client) return res.status(404).json({ ok: false, error: "Unknown integration" });
  const { tool, args } = req.body || {};
  if (!tool) return res.status(400).json({ ok: false, error: "tool is required" });
  try { res.json({ ok: true, result: await client.callTool(tool, args || {}) }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`JARVIS MCP bridge online at http://127.0.0.1:${PORT}`);
});

module.exports = { clients };
