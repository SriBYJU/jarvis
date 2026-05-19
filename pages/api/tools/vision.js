// AI Vision — analyze images via free vision model
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { image, prompt } = req.body;
  if (!image) return res.status(400).json({ error: "No image provided" });

  const question = prompt || "What do you see in this image? Describe it in detail.";

  // Try OpenRouter vision model first
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + orKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "nvidia/nemotron-nano-12b-v2-vl:free",
          messages: [{ role: "user", content: [
            { type: "text", text: question },
            { type: "image_url", image_url: { url: image } },
          ]}],
          max_tokens: 512,
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) {
        const d = await r.json();
        const text = d.choices?.[0]?.message?.content;
        if (text) return res.json({ type: "vision", data: { analysis: text, prompt: question } });
      }
    } catch {}
  }

  // Gemini vision fallback
  const gKey = process.env.GEMINI_API_KEY;
  if (gKey) {
    try {
      const base64 = image.replace(/^data:image\/\w+;base64,/, "");
      const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
      const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { text: question },
              { inline_data: { mime_type: mime, data: base64 } },
            ]}],
          }),
          signal: AbortSignal.timeout(20000),
        }
      );
      if (r.ok) {
        const d = await r.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return res.json({ type: "vision", data: { analysis: text, prompt: question } });
      }
    } catch {}
  }

  return res.status(500).json({ error: "Vision analysis failed" });
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };
