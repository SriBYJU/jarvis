const express = require("express");
const cors = require("cors");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { chromium } = require("playwright-core");

const app = express();
const PORT = Number(process.env.JARVIS_BROWSER_PORT || 3006);
const PROFILE_DIR = process.env.JARVIS_BROWSER_PROFILE || path.join(os.homedir(), ".jarvis", "browser-profile");
fs.mkdirSync(PROFILE_DIR, { recursive: true });

function allowedOrigins() { return new Set(["https://sribyju.github.io", ...(process.env.JARVIS_WEB_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean)]); }
function originAllowed(origin) { return !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || allowedOrigins().has(origin); }
app.use(cors({ origin(origin, cb) { cb(originAllowed(origin) ? null : new Error("Origin not paired with JARVIS browser service"), originAllowed(origin)); } }));
app.use(express.json({ limit: "2mb" }));
app.use((req, res, next) => { const origin = req.headers.origin; if (origin && !originAllowed(origin)) return res.status(403).json({ ok: false, error: "Origin not paired with JARVIS browser service" }); next(); });

let context = null;
let currentPage = null;

function safeUrl(raw) {
  const u = new URL(String(raw || ""));
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("Only http/https URLs are allowed");
  return u.toString();
}
async function ensureContext() {
  if (context) return context;
  const launch = { headless: false, viewport: null, args: ["--start-maximized"], acceptDownloads: true };
  if (process.env.JARVIS_CHROME_PATH) launch.executablePath = process.env.JARVIS_CHROME_PATH;
  else launch.channel = process.env.JARVIS_BROWSER_CHANNEL || "chrome";
  context = await chromium.launchPersistentContext(PROFILE_DIR, launch);
  context.on("page", p => { currentPage = p; });
  const pages = context.pages(); currentPage = pages[pages.length - 1] || await context.newPage();
  context.on("close", () => { context = null; currentPage = null; });
  return context;
}
async function page() { await ensureContext(); if (!currentPage || currentPage.isClosed()) currentPage = await context.newPage(); return currentPage; }
function snapshot(p) { return { url: p.url(), title: null }; }

// IMPORTANT: health checks must be passive. Do not call ensureContext() here,
// otherwise every periodic health poll launches a visible Chrome window.
app.get("/health", (_req, res) => {
  const pages = context ? context.pages().filter(p => !p.isClosed()).length : 0;
  res.json({
    ok: true,
    connected: Boolean(context),
    lazy: true,
    profile: PROFILE_DIR,
    pages,
    state: context ? "active" : "idle",
  });
});

app.post("/browser/open", async (req, res) => {
  try { const p = await page(); const url = safeUrl(req.body?.url); await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }); await p.bringToFront(); res.json({ ok: true, url: p.url(), title: await p.title() }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.post("/browser/new-tab", async (req, res) => {
  try { await ensureContext(); const p = await context.newPage(); currentPage = p; if (req.body?.url) await p.goto(safeUrl(req.body.url), { waitUntil: "domcontentloaded", timeout: 30000 }); await p.bringToFront(); res.json({ ok: true, url: p.url(), title: await p.title(), index: context.pages().indexOf(p) }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.get("/browser/tabs", async (_req, res) => {
  try { await ensureContext(); const tabs = await Promise.all(context.pages().map(async (p, i) => ({ index: i, url: p.url(), title: await p.title().catch(() => ""), active: p === currentPage }))); res.json({ ok: true, tabs }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.post("/browser/select-tab", async (req, res) => {
  try { await ensureContext(); const p = context.pages()[Number(req.body?.index)]; if (!p) throw new Error("Tab not found"); currentPage = p; await p.bringToFront(); res.json({ ok: true, url: p.url(), title: await p.title() }); }
  catch (e) { res.status(404).json({ ok: false, error: e.message }); }
});
app.get("/browser/extract", async (_req, res) => {
  try {
    const p = await page();
    const data = await p.evaluate(() => ({
      title: document.title,
      text: (document.body?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 30000),
      links: Array.from(document.querySelectorAll("a[href]")).slice(0, 80).map(a => ({ text: (a.innerText || a.getAttribute("aria-label") || "").trim().slice(0, 160), href: a.href })).filter(x => x.text),
      buttons: Array.from(document.querySelectorAll("button,[role=button]")).slice(0, 60).map(b => (b.innerText || b.getAttribute("aria-label") || "").trim()).filter(Boolean),
    }));
    res.json({ ok: true, url: p.url(), ...data });
  } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.post("/browser/click", async (req, res) => {
  try {
    const p = await page(); const text = String(req.body?.text || "").trim(); if (!text) throw new Error("text is required");
    const target = p.getByRole("button", { name: text, exact: false }).first();
    if (await target.count()) await target.click({ timeout: 8000 });
    else await p.getByText(text, { exact: false }).first().click({ timeout: 8000 });
    await p.waitForTimeout(400); res.json({ ok: true, url: p.url(), title: await p.title() });
  } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.post("/browser/fill", async (req, res) => {
  try {
    const p = await page(); const label = String(req.body?.label || "").trim(); const value = String(req.body?.value ?? ""); if (!label) throw new Error("label is required");
    let target = p.getByLabel(label, { exact: false }).first();
    if (!(await target.count())) target = p.getByPlaceholder(label, { exact: false }).first();
    if (!(await target.count())) throw new Error(`No input found for ${label}`);
    await target.fill(value, { timeout: 8000 }); res.json({ ok: true });
  } catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.post("/browser/press", async (req, res) => {
  try { const p = await page(); await p.keyboard.press(String(req.body?.key || "Enter")); res.json({ ok: true, url: p.url() }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.get("/browser/screenshot", async (_req, res) => {
  try { const p = await page(); const image = await p.screenshot({ type: "png", fullPage: false }); res.json({ ok: true, image: `data:image/png;base64,${image.toString("base64")}`, url: p.url(), title: await p.title() }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});
app.post("/browser/close", async (_req, res) => {
  try { if (context) await context.close(); context = null; currentPage = null; res.json({ ok: true }); }
  catch (e) { res.status(503).json({ ok: false, error: e.message }); }
});

app.listen(PORT, "127.0.0.1", () => console.log(`JARVIS Browser service online at http://127.0.0.1:${PORT}`));
