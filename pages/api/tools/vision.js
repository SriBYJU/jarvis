// AI Vision — analyze images via free vision models with fallback
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { image, prompt } = req.body;
  if (!image) return res.status(400).json({ error: "No image provided" });

  const question = prompt || "What do you see in this image? Describe it in detail.";

  // Try OpenRouter vision models (multiple fallbacks)
  const orKey = process.env.OPENROUTER_API_KEY;
  const visionModels = [
    "nvidia/nemotron-nano-12b-v2-vl:free",
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
    "google/gemma-4-26b-a4b-it:free",
  ];

  if (orKey) {
    for (const model of visionModels) {
      try {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: "Bearer " + orKey, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: [
              { type: "text", text: question },
              { type: "image_url", image_url: { url: image } },
            ]}],
            max_tokens: 512,
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (r.status === 429) continue;
        if (!r.ok) continue;
        const d = await r.json();
        if (d.error) continue;
        const text = d.choices?.[0]?.message?.content;
        if (text) return res.json({ type: "vision", data: { analysis: text, prompt: question, model } });
      } catch { continue; }
    }
  }

  // Gemini vision fallback (multiple models)
  const gKey = process.env.GEMINI_API_KEY;
  const geminiModels = ["gemini-2.0-flash", "gemini-2.0-flash-lite"];

  if (gKey) {
    const base64 = image.replace(/^data:image\/\w+;base64,/, "");
    const mimeMatch = image.match(/^data:(image\/\w+);base64,/);
    const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";

    for (const model of geminiModels) {
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${gKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [
                { text: question },
                { inline_data: { mime_type: mime, data: base64 } },
              ]}],
            }),
            signal: AbortSignal.timeout(25000),
          }
        );
        if (r.status === 429) continue;
        if (!r.ok) continue;
        const d = await r.json();
        const text = d.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return res.json({ type: "vision", data: { analysis: text, prompt: question, model } });
      } catch { continue; }
    }
  }

  return res.status(503).json({ error: "Vision analysis is currently unavailable. All AI models are busy, sir. Please try again in a moment." });
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };
