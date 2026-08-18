import { safeHttpFetch } from "../../../lib/urlSafety";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "URL required" });

  try {
    const resp = await safeHttpFetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; JARVIS/1.0)",
        Accept: "text/html,application/xhtml+xml,text/plain",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!resp.ok) throw new Error("Fetch error: " + resp.status);
    const contentType = resp.headers.get("content-type") || "";
    if (!/(?:text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType)) {
      throw new Error("That URL did not return readable text/HTML");
    }

    const html = (await resp.text()).slice(0, 1_000_000);
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000);

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().slice(0, 300) : String(url).slice(0, 300);

    return res.status(200).json({ type: "browse", data: { url, title, content: text } });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
}
