// Screen Reader — fetch a public URL and analyze its readable text.
import { chatCompletion } from "../../../lib/llm";
import { safeHttpFetch } from "../../../lib/urlSafety";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "No URL provided" });

  try {
    const r = await safeHttpFetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 JARVIS Bot", Accept: "text/html,application/xhtml+xml,text/plain" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return res.status(400).json({ error: `Could not fetch URL (HTTP ${r.status})` });
    const contentType = r.headers.get("content-type") || "";
    if (!/(?:text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
      return res.status(400).json({ error: "That URL did not return readable text/HTML" });
    }

    const html = (await r.text()).slice(0, 1_000_000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    const { reply } = await chatCompletion(
      [{ role: "user", content: `Analyze this webpage content and give a clear, useful summary:\n\n${text}` }],
      "You are JARVIS. Summarize web content clearly and concisely. Highlight key points. Never expose internal reasoning.",
      "fast"
    );

    return res.json({
      type: "screenshot",
      data: { url, summary: reply || text.slice(0, 500), rawText: text.slice(0, 1000) },
    });
  } catch (e) {
    return res.status(400).json({ error: "Failed to analyze URL: " + e.message });
  }
}
