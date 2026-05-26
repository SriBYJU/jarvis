import { chatCompletionStream } from "../../lib/llm";

export const config = { api: { bodyParser: true } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages: rawMessages, systemPrompt, mode, model } = req.body;
  const messages = rawMessages || [];

  const result = await chatCompletionStream(messages, systemPrompt || "", mode || "fast", model || null);
  if (!result) {
    return res.status(503).json({ error: "All AI models are currently busy. Please try again in a moment, sir." });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  // Send model info as first event
  res.write(`data: ${JSON.stringify({ meta: { model: result.model } })}\n\n`);

  const reader = result.stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            res.write("data: [DONE]\n\n");
            continue;
          }
          try {
            const parsed = JSON.parse(data);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              res.write(`data: ${JSON.stringify({ token })}\n\n`);
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    }
  } catch (e) {
    res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
  }

  res.write("data: [DONE]\n\n");
  res.end();
}
