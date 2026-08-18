const fs = require('fs');

const file = 'pages/api/chat.js';
let source = fs.readFileSync(file, 'utf8');
let changed = false;

if (!source.includes('from "../../lib/urlSafety"')) {
  const needle = 'import { chatCompletion } from "../../lib/llm";\n';
  if (!source.includes(needle)) throw new Error('chatCompletion import not found');
  source = source.replace(needle, needle + 'import { safeHttpFetch } from "../../lib/urlSafety";\n');
  changed = true;
}

const executeReplacement = `function toolExecute(code, language) {
  const lang = String(language || "javascript").toLowerCase();
  return {
    type: "execute",
    data: {
      code: String(code || ""),
      language: lang,
      output: lang === "python"
        ? "Python execution is client-side only. Open the Code Playground / Pyodide environment to run it."
        : "For safety, server-side arbitrary code execution is disabled. Open JARVIS Code Playground to run this locally in your browser.",
      error: null,
      executionLocation: "client",
      serverExecuted: false,
    },
  };
}

async function toolBrowse`;

const executePattern = /function toolExecute\(code, language\) \{[\s\S]*?\n\}\n\nasync function toolBrowse/;
if (executePattern.test(source)) {
  source = source.replace(executePattern, executeReplacement);
  changed = true;
} else if (!source.includes('serverExecuted: false')) {
  throw new Error('legacy toolExecute block not found');
}

const browseReplacement = `async function toolBrowse(url) {
  try {
    const resp = await safeHttpFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; JARVIS/1.0)", Accept: "text/html,application/xhtml+xml,text/plain" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "";
    if (!/(?:text\\/html|application\\/xhtml\\+xml|text\\/plain)/i.test(contentType)) return null;
    const html = (await resp.text()).slice(0, 1_000_000);
    const text = html.replace(/<script[\\s\\S]*?<\\/script>/gi, "").replace(/<style[\\s\\S]*?<\\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim().slice(0, 4000);
    const title = html.match(/<title[^>]*>([^<]+)<\\/title>/i)?.[1]?.trim().slice(0, 300) || String(url).slice(0, 300);
    return { type: "browse", data: { url, title, content: text } };
  } catch { return null; }
}

async function toolScreenshot`;

const browsePattern = /async function toolBrowse\(url\) \{[\s\S]*?\n\}\n\nasync function toolScreenshot/;
if (browsePattern.test(source)) {
  source = source.replace(browsePattern, browseReplacement);
  changed = true;
} else if (!source.includes('safeHttpFetch(url')) {
  throw new Error('legacy toolBrowse block not found');
}

const screenshotReplacement = `async function toolScreenshot(url) {
  try {
    const resp = await safeHttpFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 JARVIS Bot", Accept: "text/html,application/xhtml+xml,text/plain" },
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || "";
    if (!/(?:text\\/html|application\\/xhtml\\+xml|text\\/plain)/i.test(contentType)) return null;
    const html = (await resp.text()).slice(0, 1_000_000);
    const text = html.replace(/<script[\\s\\S]*?<\\/script>/gi, "").replace(/<style[\\s\\S]*?<\\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\\s+/g, " ").trim().slice(0, 4000);
    return { type: "screenshot", data: { url, summary: text.slice(0, 500), rawText: text.slice(0, 1000) } };
  } catch { return null; }
}

function toolReminder`;

const screenshotPattern = /async function toolScreenshot\(url\) \{[\s\S]*?\n\}\n\nfunction toolReminder/;
if (screenshotPattern.test(source)) {
  source = source.replace(screenshotPattern, screenshotReplacement);
  changed = true;
} else if (!source.includes('function toolReminder')) {
  throw new Error('legacy toolScreenshot block not found');
}

if (changed) {
  fs.writeFileSync(file, source, 'utf8');
  console.log('Hardened pages/api/chat.js side-door helpers');
} else {
  console.log('pages/api/chat.js already hardened');
}
