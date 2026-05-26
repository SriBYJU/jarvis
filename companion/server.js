const express = require("express");
const cors = require("cors");
const { exec, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
const PORT = 3003;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "50mb" }));

// ── Health check / companion detection ──────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "online",
    name: "JARVIS Companion",
    version: "1.0.0",
    platform: process.platform,
    hostname: os.hostname(),
    uptime: Math.floor(process.uptime()),
    capabilities: ["execute", "files", "screenshot", "open-app", "ollama", "system-info"],
  });
});

// ── Code Execution ──────────────────────────────────────────────────
app.post("/execute", (req, res) => {
  const { code, language = "javascript", timeout = 15000 } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided" });

  const runners = {
    javascript: { cmd: "node", args: ["-e", code] },
    python: { cmd: "python3", args: ["-c", code] },
    bash: { cmd: "bash", args: ["-c", code] },
    shell: { cmd: process.platform === "win32" ? "cmd" : "bash", args: process.platform === "win32" ? ["/c", code] : ["-c", code] },
  };

  const runner = runners[language.toLowerCase()];
  if (!runner) return res.status(400).json({ error: `Unsupported language: ${language}. Supported: ${Object.keys(runners).join(", ")}` });

  let stdout = "";
  let stderr = "";
  const proc = spawn(runner.cmd, runner.args, {
    timeout,
    cwd: os.homedir(),
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });

  proc.stdout.on("data", (d) => { stdout += d.toString(); });
  proc.stderr.on("data", (d) => { stderr += d.toString(); });

  proc.on("close", (exitCode) => {
    res.json({
      ok: true,
      stdout: stdout.slice(0, 50000),
      stderr: stderr.slice(0, 10000),
      exitCode,
      language,
    });
  });

  proc.on("error", (err) => {
    res.json({ ok: false, error: err.message, language });
  });
});

// ── File Operations ─────────────────────────────────────────────────
app.post("/files", (req, res) => {
  const { action, filePath, content, encoding = "utf-8" } = req.body;
  if (!action) return res.status(400).json({ error: "No action specified" });

  const resolvedPath = filePath ? path.resolve(filePath.replace(/^~/, os.homedir())) : null;

  try {
    switch (action) {
      case "read": {
        if (!resolvedPath) return res.status(400).json({ error: "No filePath" });
        if (!fs.existsSync(resolvedPath)) return res.status(404).json({ error: "File not found" });
        const stats = fs.statSync(resolvedPath);
        if (stats.size > 5 * 1024 * 1024) return res.status(413).json({ error: "File too large (>5MB)" });
        const data = fs.readFileSync(resolvedPath, encoding);
        return res.json({ ok: true, content: data, size: stats.size, path: resolvedPath });
      }
      case "write": {
        if (!resolvedPath || content === undefined) return res.status(400).json({ error: "filePath and content required" });
        const dir = path.dirname(resolvedPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(resolvedPath, content, encoding);
        return res.json({ ok: true, path: resolvedPath, size: Buffer.byteLength(content, encoding) });
      }
      case "list": {
        const dir = resolvedPath || os.homedir();
        if (!fs.existsSync(dir)) return res.status(404).json({ error: "Directory not found" });
        const entries = fs.readdirSync(dir, { withFileTypes: true }).slice(0, 200).map(e => ({
          name: e.name,
          type: e.isDirectory() ? "directory" : "file",
          path: path.join(dir, e.name),
        }));
        return res.json({ ok: true, directory: dir, entries });
      }
      case "delete": {
        if (!resolvedPath) return res.status(400).json({ error: "No filePath" });
        if (!fs.existsSync(resolvedPath)) return res.status(404).json({ error: "File not found" });
        const stats = fs.statSync(resolvedPath);
        if (stats.isDirectory()) fs.rmSync(resolvedPath, { recursive: true });
        else fs.unlinkSync(resolvedPath);
        return res.json({ ok: true, deleted: resolvedPath });
      }
      case "exists": {
        if (!resolvedPath) return res.status(400).json({ error: "No filePath" });
        return res.json({ ok: true, exists: fs.existsSync(resolvedPath), path: resolvedPath });
      }
      case "mkdir": {
        if (!resolvedPath) return res.status(400).json({ error: "No filePath" });
        fs.mkdirSync(resolvedPath, { recursive: true });
        return res.json({ ok: true, created: resolvedPath });
      }
      default:
        return res.status(400).json({ error: `Unknown action: ${action}. Supported: read, write, list, delete, exists, mkdir` });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Screen Capture ──────────────────────────────────────────────────
app.get("/screenshot", (req, res) => {
  const tmpFile = path.join(os.tmpdir(), `jarvis-screenshot-${Date.now()}.png`);

  let cmd;
  if (process.platform === "darwin") {
    cmd = `screencapture -x "${tmpFile}"`;
  } else if (process.platform === "linux") {
    cmd = `import -window root "${tmpFile}" 2>/dev/null || scrot "${tmpFile}" 2>/dev/null || gnome-screenshot -f "${tmpFile}" 2>/dev/null`;
  } else if (process.platform === "win32") {
    cmd = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Screen]::PrimaryScreen | ForEach-Object { $bmp = New-Object System.Drawing.Bitmap($_.Bounds.Width, $_.Bounds.Height); $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($_.Bounds.Location, [System.Drawing.Point]::Empty, $_.Bounds.Size); $bmp.Save('${tmpFile.replace(/\\/g, "\\\\")}'); }"`;
  } else {
    return res.status(400).json({ error: `Unsupported platform: ${process.platform}` });
  }

  exec(cmd, { timeout: 10000 }, (err) => {
    if (err || !fs.existsSync(tmpFile)) {
      return res.status(500).json({ error: "Screenshot failed. Install scrot (Linux) or use macOS/Windows.", details: err?.message });
    }
    const data = fs.readFileSync(tmpFile);
    const base64 = data.toString("base64");
    fs.unlinkSync(tmpFile);
    res.json({ ok: true, image: `data:image/png;base64,${base64}`, width: null, height: null });
  });
});

// ── App Launcher ────────────────────────────────────────────────────
app.post("/open-app", (req, res) => {
  const { app: appName, url } = req.body;
  if (!appName && !url) return res.status(400).json({ error: "Specify app or url" });

  let cmd;
  const target = url || appName;

  if (process.platform === "darwin") {
    cmd = url ? `open "${target}"` : `open -a "${target}"`;
  } else if (process.platform === "win32") {
    cmd = `start "" "${target}"`;
  } else {
    cmd = url ? `xdg-open "${target}"` : `${target} &`;
  }

  exec(cmd, { timeout: 5000 }, (err) => {
    if (err) return res.json({ ok: false, error: err.message });
    res.json({ ok: true, opened: target });
  });
});

// ── Local LLM (Ollama) ─────────────────────────────────────────────
app.post("/ollama", async (req, res) => {
  const { messages, model = "llama3.2", systemPrompt = "" } = req.body;
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

  try {
    const ollamaMessages = [];
    if (systemPrompt) ollamaMessages.push({ role: "system", content: systemPrompt });
    ollamaMessages.push(...(messages || []));

    const resp = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: ollamaMessages, stream: false }),
      signal: AbortSignal.timeout(60000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ ok: false, error: `Ollama error: ${text}` });
    }

    const data = await resp.json();
    res.json({
      ok: true,
      reply: data.message?.content || "",
      model: data.model || model,
      totalDuration: data.total_duration,
      evalCount: data.eval_count,
    });
  } catch (err) {
    if (err.message?.includes("fetch") || err.message?.includes("ECONNREFUSED")) {
      return res.status(503).json({ ok: false, error: "Ollama not running. Install from https://ollama.com and run: ollama serve" });
    }
    res.status(500).json({ ok: false, error: err.message });
  }
});

// List available Ollama models
app.get("/ollama/models", async (req, res) => {
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";
  try {
    const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return res.json({ ok: false, models: [] });
    const data = await resp.json();
    const models = (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modified: m.modified_at,
    }));
    res.json({ ok: true, models });
  } catch {
    res.json({ ok: false, models: [], error: "Ollama not running" });
  }
});

// ── System Info ─────────────────────────────────────────────────────
app.get("/system-info", (req, res) => {
  const cpus = os.cpus();
  res.json({
    ok: true,
    hostname: os.hostname(),
    platform: process.platform,
    arch: os.arch(),
    release: os.release(),
    uptime: os.uptime(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    usedMemory: os.totalmem() - os.freemem(),
    memoryUsagePercent: Math.round(((os.totalmem() - os.freemem()) / os.totalmem()) * 100),
    cpuModel: cpus[0]?.model || "Unknown",
    cpuCores: cpus.length,
    cpuSpeed: cpus[0]?.speed || 0,
    homeDir: os.homedir(),
    tempDir: os.tmpdir(),
    user: os.userInfo().username,
  });
});

// ── Process List ────────────────────────────────────────────────────
app.get("/processes", (req, res) => {
  const cmd = process.platform === "win32"
    ? 'tasklist /FO CSV /NH'
    : 'ps aux --sort=-%mem | head -20';

  exec(cmd, { timeout: 5000 }, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, processes: stdout.trim() });
  });
});

// ── Smart Task Execution ────────────────────────────────────────────
app.post("/task", async (req, res) => {
  const { type, data } = req.body;
  if (!type) return res.status(400).json({ error: "No task type" });

  try {
    switch (type) {
      case "spreadsheet": {
        const { filename = "jarvis-spreadsheet.csv", headers = [], rows = [], title = "" } = data || {};
        const filePath = path.resolve(data?.saveTo?.replace(/^~/, os.homedir()) || path.join(os.homedir(), "Desktop", filename));
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        // Generate CSV
        const csvLines = [];
        if (title) csvLines.push(`"${title}"`, "");
        if (headers.length) csvLines.push(headers.map(h => `"${String(h).replace(/"/g, '""')}"`).join(","));
        for (const row of rows) {
          csvLines.push((Array.isArray(row) ? row : Object.values(row)).map(c => `"${String(c || "").replace(/"/g, '""')}"`).join(","));
        }
        fs.writeFileSync(filePath, csvLines.join("\n"), "utf-8");

        // Open the file
        const openCmd = process.platform === "darwin" ? `open "${filePath}"` : process.platform === "win32" ? `start "" "${filePath}"` : `xdg-open "${filePath}"`;
        exec(openCmd, { timeout: 5000 }, () => {});

        return res.json({ ok: true, type: "spreadsheet", path: filePath, rows: rows.length, headers: headers.length });
      }

      case "document": {
        const { filename = "jarvis-document.md", content = "", format = "markdown", title = "" } = data || {};
        const filePath = path.resolve(data?.saveTo?.replace(/^~/, os.homedir()) || path.join(os.homedir(), "Desktop", filename));
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        let doc = "";
        if (format === "markdown" || format === "md") {
          if (title) doc += `# ${title}\n\n`;
          doc += content;
        } else if (format === "html") {
          doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title || "JARVIS Document"}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:800px;margin:40px auto;padding:0 20px;line-height:1.6;color:#333}h1{border-bottom:2px solid #1a7aff;padding-bottom:10px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ddd;padding:8px 12px;text-align:left}th{background:#1a7aff;color:white}tr:nth-child(even){background:#f9f9f9}</style></head><body>${title ? `<h1>${title}</h1>` : ""}${content}</body></html>`;
        } else {
          if (title) doc += `${title}\n${"=".repeat(title.length)}\n\n`;
          doc += content;
        }

        fs.writeFileSync(filePath, doc, "utf-8");
        const openCmd = process.platform === "darwin" ? `open "${filePath}"` : process.platform === "win32" ? `start "" "${filePath}"` : `xdg-open "${filePath}"`;
        exec(openCmd, { timeout: 5000 }, () => {});

        return res.json({ ok: true, type: "document", path: filePath, format, size: doc.length });
      }

      case "open_url": {
        const { url } = data || {};
        if (!url) return res.status(400).json({ error: "No URL provided" });
        const openCmd = process.platform === "darwin" ? `open "${url}"` : process.platform === "win32" ? `start "" "${url}"` : `xdg-open "${url}"`;
        exec(openCmd, { timeout: 5000 }, (err) => {
          if (err) return res.json({ ok: false, error: err.message });
          res.json({ ok: true, opened: url });
        });
        return;
      }

      case "organize_files": {
        const { directory = "~/Downloads", rules = {} } = data || {};
        const dir = path.resolve(directory.replace(/^~/, os.homedir()));
        if (!fs.existsSync(dir)) return res.status(404).json({ error: "Directory not found" });

        const defaultRules = {
          images: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"],
          documents: [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".odt", ".xls", ".xlsx", ".csv", ".ppt", ".pptx"],
          videos: [".mp4", ".avi", ".mkv", ".mov", ".wmv", ".flv", ".webm"],
          audio: [".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a"],
          archives: [".zip", ".rar", ".7z", ".tar", ".gz", ".bz2"],
          code: [".js", ".py", ".html", ".css", ".json", ".ts", ".jsx", ".tsx", ".java", ".cpp", ".c", ".go", ".rs"],
        };
        const activeRules = Object.keys(rules).length ? rules : defaultRules;
        const moved = [];

        const files = fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile());
        for (const file of files) {
          const ext = path.extname(file.name).toLowerCase();
          for (const [folder, exts] of Object.entries(activeRules)) {
            if (exts.includes(ext)) {
              const destDir = path.join(dir, folder);
              if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
              const src = path.join(dir, file.name);
              const dest = path.join(destDir, file.name);
              if (src !== dest) {
                fs.renameSync(src, dest);
                moved.push({ file: file.name, to: folder });
              }
              break;
            }
          }
        }
        return res.json({ ok: true, type: "organize", directory: dir, moved, totalMoved: moved.length });
      }

      case "search_files": {
        const { directory = "~", query, extensions } = data || {};
        const dir = path.resolve(directory.replace(/^~/, os.homedir()));
        if (!fs.existsSync(dir)) return res.status(404).json({ error: "Directory not found" });

        const results = [];
        function searchDir(d, depth = 0) {
          if (depth > 5 || results.length >= 50) return;
          try {
            const entries = fs.readdirSync(d, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.name.startsWith(".")) continue;
              const full = path.join(d, entry.name);
              if (entry.isDirectory()) { searchDir(full, depth + 1); continue; }
              const matchName = !query || entry.name.toLowerCase().includes(query.toLowerCase());
              const matchExt = !extensions || extensions.some(e => entry.name.endsWith(e));
              if (matchName && matchExt) {
                const stats = fs.statSync(full);
                results.push({ name: entry.name, path: full, size: stats.size, modified: stats.mtime });
              }
            }
          } catch {}
        }
        searchDir(dir);
        return res.json({ ok: true, results, total: results.length });
      }

      case "clipboard": {
        const { action: clipAction, text } = data || {};
        if (clipAction === "copy" && text) {
          let cmd;
          if (process.platform === "darwin") cmd = `echo ${JSON.stringify(text)} | pbcopy`;
          else if (process.platform === "linux") cmd = `echo ${JSON.stringify(text)} | xclip -selection clipboard 2>/dev/null || echo ${JSON.stringify(text)} | xsel --clipboard 2>/dev/null`;
          else cmd = `echo ${JSON.stringify(text)} | clip`;
          exec(cmd, { timeout: 3000 }, (err) => {
            if (err) return res.json({ ok: false, error: err.message });
            res.json({ ok: true, action: "copied" });
          });
          return;
        }
        if (clipAction === "paste") {
          let cmd;
          if (process.platform === "darwin") cmd = "pbpaste";
          else if (process.platform === "linux") cmd = "xclip -selection clipboard -o 2>/dev/null || xsel --clipboard --output 2>/dev/null";
          else cmd = "powershell -command Get-Clipboard";
          exec(cmd, { timeout: 3000 }, (err, stdout) => {
            if (err) return res.json({ ok: false, error: err.message });
            res.json({ ok: true, action: "pasted", text: stdout });
          });
          return;
        }
        return res.status(400).json({ error: "clipboard action must be 'copy' or 'paste'" });
      }

      default:
        return res.status(400).json({ error: `Unknown task: ${type}. Supported: spreadsheet, document, open_url, organize_files, search_files, clipboard` });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Start Server ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║          J.A.R.V.I.S. COMPANION SERVER               ║
║                                                      ║
║  Status:  ONLINE                                     ║
║  Port:    ${PORT}                                       ║
║  Host:    http://localhost:${PORT}                       ║
║                                                      ║
║  Capabilities:                                       ║
║    • Code Execution  (JS, Python, Bash)              ║
║    • File Manager    (read, write, list, delete)     ║
║    • Screen Capture  (native screenshot)             ║
║    • App Launcher    (open any application)           ║
║    • Local LLM       (Ollama integration)            ║
║    • System Info     (CPU, RAM, disk, processes)     ║
║                                                      ║
║  Your JARVIS web app will auto-detect this server.   ║
╚══════════════════════════════════════════════════════╝
  `);
});
