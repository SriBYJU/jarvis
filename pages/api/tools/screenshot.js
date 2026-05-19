// Screen Reader — fetch a URL and analyze its content with AI
import { chatCompletion } from "../../../lib/llm";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "No URL provided" });

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 JARVIS Bot" },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return res.status(400).json({ error: "Could not fetch URL" });

    const html = await r.text();
    // Strip HTML tags to get text content
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    // Ask AI to analyze the content
    const { reply } = await chatCompletion(
      [{ role: "user", content: `Analyze this webpage content and give a clear, useful summary:\n\n${text}` }],
      "You are JARVIS. Summarize web content clearly and concisely. Highlight key points.",
      "fast"
    );

    return res.json({
      type: "screenshot",
      data: { url, summary: reply || text.slice(0, 500), rawText: text.slice(0, 1000) },
    });
  } catch (e) {
    return res.status(500).json({ error: "Failed to analyze URL: " + e.message });
  }
}
