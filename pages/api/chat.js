const GEMINI_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, systemPrompt } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not set in environment variables." });
  }

  const geminiContents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || "";
  let toolResult = null;

  const mapKeywords = ["map", "show me", "where is", "location of", "navigate to", "holographic map", "zoom in"];
  const locationKeywords = ["area", "city", "street", "virginia", "richmond", "short pump"];
  const isMapRequest = mapKeywords.some(k => lastMsg.includes(k)) || locationKeywords.some(k => lastMsg.includes(k));

  if (isMapRequest) {
    let location = lastMsg.replace(/show me|a map of|holographic map of|map of|where is|location of|navigate to|zoom in on|the|area/gi, "").replace(/[^a-zA-Z0-9,\s]/g, "").trim();
    if (!location) location = "Richmond Virginia";
    toolResult = { type: "map", data: { query: location } };
  }

  const codeKeywords = ["write code", "write a function", "python", "javascript", "function that", "code to", "program that", "script that"];
  const isCodeRequest = codeKeywords.some(k => lastMsg.includes(k));

  const fullSystemPrompt = systemPrompt + " You have real tools that show results on screen. Reference them naturally. Keep responses concise for speech, no markdown." + (toolResult ? " A " + toolResult.type + " result is being displayed right now." : "") + (isCodeRequest ? " Write clean well-commented code." : "");

  try {
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent?key=" + process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: fullSystemPrompt }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      return res.status(geminiRes.status).json({ error: err });
    }

    const data = await geminiRes.json();
    let reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I could not generate a response.";

    let codeResult = null;
    if (isCodeRequest) {
      const codeMatch = reply.match(/```(\w+)?\n([\s\S]+?)```/);
      if (codeMatch) {
        codeResult = { type: "code", data: { language: codeMatch[1] || "javascript", code: codeMatch[2] } };
        reply = reply.replace(/```[\s\S]+?```/g, "").trim();
      }
    }

    return res.status(200).json({ reply, tool: toolResult || codeResult || null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}