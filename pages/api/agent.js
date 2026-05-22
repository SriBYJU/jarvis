import { detectIntent } from "../../lib/intent";
import { chatCompletion } from "../../lib/llm";
import { addMemory, searchMemories, addProject, getProjects, getProject, addLearningFact, getLearningContext } from "../../lib/store";

// ── Inlined tool runners (same as chat.js) ────────────────────────

async function runTool(intent, data) {
  try {
    switch (intent) {
      case "weather": {
        if (!data) return null;
        const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(data)}&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial`);
        if (!r.ok) return null;
        const d = await r.json();
        return { type: "weather", data: { city: d.name, country: d.sys?.country, temp: Math.round(d.main.temp), feels_like: Math.round(d.main.feels_like), humidity: d.main.humidity, wind: d.wind.speed, description: d.weather?.[0]?.description || "", icon: d.weather?.[0]?.icon || "" } };
      }
      case "stock": {
        if (!data) return null;
        const [qr, pr] = await Promise.all([
          fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(data)}&token=${process.env.FINNHUB_API_KEY}`),
          fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(data)}&token=${process.env.FINNHUB_API_KEY}`)
        ]);
        const q = await qr.json(); const p = pr.ok ? await pr.json() : {};
        if (!q.c) return null;
        return { type: "stock", data: { symbol: data.toUpperCase(), name: p.name || data, price: q.c, change: q.d, changePercent: q.dp, high: q.h, low: q.l, open: q.o, previousClose: q.pc } };
      }
      case "news": {
        const apiKey = process.env.NEWS_API_KEY;
        const url = (!data || data === "top") ? `https://newsapi.org/v2/top-headlines?country=us&pageSize=5&apiKey=${apiKey}` : `https://newsapi.org/v2/everything?q=${encodeURIComponent(data)}&pageSize=5&sortBy=publishedAt&apiKey=${apiKey}`;
        const r = await fetch(url); if (!r.ok) return null;
        const d = await r.json();
        return { type: "news", data: (d.articles || []).map(a => ({ title: a.title, source: a.source?.name || "", url: a.url, publishedAt: a.publishedAt, description: a.description || "", image: a.urlToImage || "" })) };
      }
      case "websearch": {
        if (!data) return null;
        const cseId = process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_CSE_ID;
        const r = await fetch(`https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(data)}&key=${process.env.GOOGLE_API_KEY}&cx=${cseId}&num=5`);
        if (!r.ok) return null;
        const d = await r.json();
        return { type: "websearch", data: (d.items || []).map(i => ({ title: i.title, link: i.link, snippet: i.snippet || "" })) };
      }
      case "wikipedia": {
        if (!data) return null;
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(data)}`, { headers: { "User-Agent": "JARVIS/2.0" }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const d = await r.json();
        return { type: "wikipedia", data: { title: d.title, extract: d.extract || "", description: d.description || "", thumbnail: d.thumbnail?.source || "", url: d.content_urls?.desktop?.page || "" } };
      }
      case "memory_save": {
        if (!data) return null;
        const entry = await addMemory(data);
        return { type: "memory_save", data: entry };
      }
      case "memory_query": {
        const results = await searchMemories(data || "*");
        return { type: "memory_query", data: results };
      }
      case "map": return { type: "map", data: { query: data || "Richmond Virginia" } };
      case "image": return { type: "image", data: { prompt: data, url: `https://image.pollinations.ai/prompt/${encodeURIComponent(data)}?width=512&height=512&nologo=true` } };
      default: return null;
    }
  } catch { return null; }
}

// ── Agent planner ─────────────────────────────────────────────────

const PLAN_SYSTEM = `You are a task planner for JARVIS AI. Given a user request, output a JSON plan with steps.
Each step has: { "action": "tool"|"llm", "intent"?: string, "data"?: string, "description": string }
Available tool intents: weather, stock, news, websearch, wikipedia, memory_save, memory_query, map, image
For "llm" steps, include "prompt" instead of intent/data.
Output ONLY valid JSON like: { "taskName": "...", "steps": [...] }
Keep steps minimal (2-5 max). Only use tools when genuinely needed.`;

async function planTask(userMessage, systemPrompt) {
  try {
    const { reply } = await chatCompletion(
      [{ role: "user", content: `Plan this task: "${userMessage}"` }],
      PLAN_SYSTEM, "fast"
    );
    const clean = reply.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
}

// ── Main handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { message, systemPrompt, userId, mode } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const uid = userId || "default";

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  function send(type, data) {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  }

  try {
    // Step 1: Plan
    send("status", { text: "Planning task..." });
    const plan = await planTask(message, systemPrompt);

    if (!plan || !plan.steps?.length) {
      // Fallback: just answer directly
      send("status", { text: "Generating response..." });
      const { reply, model } = await chatCompletion([{ role: "user", content: message }], systemPrompt, mode || "fast");
      send("reply", { text: reply, model });
      send("done", {});
      return res.end();
    }

    send("plan", { taskName: plan.taskName, steps: plan.steps.map(s => s.description) });

    const toolResults = [];
    let contextSummary = `Task: ${message}\n\n`;

    // Step 2: Execute each step
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      send("step", { index: i, description: step.description });

      if (step.action === "tool" && step.intent) {
        const result = await runTool(step.intent, step.data);
        if (result) {
          toolResults.push(result);
          send("tool", { tool: result });
          // Summarize result for context
          if (result.type === "stock") contextSummary += `Stock ${result.data.symbol}: $${result.data.price} (${result.data.changePercent > 0 ? "+" : ""}${result.data.changePercent}%)\n`;
          else if (result.type === "weather") contextSummary += `Weather in ${result.data.city}: ${result.data.temp}°F, ${result.data.description}\n`;
          else if (result.type === "news") contextSummary += `News: ${result.data.slice(0, 3).map(a => a.title).join("; ")}\n`;
          else if (result.type === "websearch") contextSummary += `Search results: ${result.data.slice(0, 3).map(r => r.title + ": " + r.snippet).join("; ")}\n`;
          else if (result.type === "wikipedia") contextSummary += `Wikipedia: ${result.data.extract?.slice(0, 300)}\n`;
          else if (result.type === "memory_query") contextSummary += `Memory: ${result.data.map(m => m.content).join("; ")}\n`;
        }
      } else if (step.action === "llm") {
        // LLM synthesis step
        send("status", { text: step.description });
        const prompt = step.prompt || step.description;
        const { reply } = await chatCompletion(
          [{ role: "user", content: `${contextSummary}\n\nNow: ${prompt}` }],
          systemPrompt, mode || "fast"
        );
        contextSummary += `\nAnalysis: ${reply}\n`;
        send("partial", { text: reply });
      }
    }

    // Step 3: Final synthesis
    send("status", { text: "Synthesizing response..." });
    const finalPrompt = toolResults.length > 0
      ? `Based on this gathered data:\n${contextSummary}\n\nRespond to the user's original request: "${message}"\nBe concise and conversational.`
      : `The user asked: "${message}"\n\nRespond helpfully and concisely.`;

    const { reply: finalReply, model } = await chatCompletion(
      [{ role: "user", content: finalPrompt }],
      systemPrompt, mode || "fast"
    );

    // Save learning facts
    try { await addLearningFact(uid, `User asked: ${message.slice(0, 100)}`); } catch {}

    send("reply", { text: finalReply, model, toolCount: toolResults.length });
    send("done", {});
  } catch (e) {
    send("error", { text: "Agent encountered an error: " + e.message });
    send("done", {});
  }

  res.end();
}
