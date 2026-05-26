import { detectIntent } from "../../lib/intent";
import { chatCompletion } from "../../lib/llm";
import { addMemory, searchMemories, addProject, getProjects, getProject, addLearningFact, getLearningContext } from "../../lib/store";

// ── Tool runners ────────────────────────────────────────────────────

async function runTool(intent, data) {
  try {
    switch (intent) {
      case "weather": {
        if (!data) return null;
        const r = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(data)}&appid=${process.env.OPENWEATHER_API_KEY}&units=imperial`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const d = await r.json();
        return { type: "weather", data: { city: d.name, country: d.sys?.country, temp: Math.round(d.main.temp), feels_like: Math.round(d.main.feels_like), humidity: d.main.humidity, wind: d.wind.speed, description: d.weather?.[0]?.description || "", icon: d.weather?.[0]?.icon || "" } };
      }
      case "stock": {
        if (!data) return null;
        const symbol = data.toUpperCase().replace(/[^A-Z.]/g, "");
        const [qr, pr] = await Promise.all([
          fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${process.env.FINNHUB_API_KEY}`, { signal: AbortSignal.timeout(8000) }),
          fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${process.env.FINNHUB_API_KEY}`, { signal: AbortSignal.timeout(8000) }),
        ]);
        const q = await qr.json();
        const p = pr.ok ? await pr.json() : {};
        if (!q.c) return null;
        return { type: "stock", data: { symbol, name: p.name || symbol, price: q.c, change: q.d, changePercent: q.dp, high: q.h, low: q.l, open: q.o, previousClose: q.pc, industry: p.finnhubIndustry || "", logo: p.logo || "" } };
      }
      case "news": {
        const apiKey = process.env.NEWS_API_KEY;
        if (!apiKey) return null;
        const url = (!data || data === "top") ? `https://newsapi.org/v2/top-headlines?country=us&pageSize=6&apiKey=${apiKey}` : `https://newsapi.org/v2/everything?q=${encodeURIComponent(data)}&pageSize=6&sortBy=publishedAt&apiKey=${apiKey}`;
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const d = await r.json();
        return { type: "news", data: (d.articles || []).map(a => ({ title: a.title, source: a.source?.name || "", url: a.url, publishedAt: a.publishedAt, description: a.description || "", image: a.urlToImage || "" })) };
      }
      case "websearch": {
        if (!data) return null;
        const apiKey = process.env.YOUTUBE_API_KEY || process.env.GOOGLE_API_KEY;
        const cseId = process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_CSE_ID;
        if (!apiKey || !cseId) return null;
        const r = await fetch(`https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(data)}&key=${apiKey}&cx=${cseId}&num=5`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const d = await r.json();
        return { type: "websearch", data: (d.items || []).map(i => ({ title: i.title, link: i.link, snippet: i.snippet || "" })) };
      }
      case "wikipedia": {
        if (!data) return null;
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(data)}`, { headers: { "User-Agent": "JARVIS/3.0" }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const d = await r.json();
        return { type: "wikipedia", data: { title: d.title, extract: d.extract || "", description: d.description || "", thumbnail: d.thumbnail?.source || "", url: d.content_urls?.desktop?.page || "" } };
      }
      case "youtube": {
        if (!data) return null;
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) return null;
        const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(data)}&type=video&maxResults=1&key=${apiKey}`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const d = await r.json();
        const video = d.items?.[0];
        if (!video) return null;
        return { type: "youtube", data: { videoId: video.id.videoId, title: video.snippet.title, channel: video.snippet.channelTitle, thumbnail: video.snippet.thumbnails?.high?.url } };
      }
      case "calculate": {
        if (!data) return null;
        const sanitized = data.replace(/[^0-9+\-*/().%^ ]/g, "").replace(/\^/g, "**");
        const result = new Function("return (" + sanitized + ")")();
        if (typeof result !== "number" || !isFinite(result)) return null;
        return { type: "calculate", data: { expression: data.trim(), result: Math.round(result * 1e10) / 1e10 } };
      }
      case "define": {
        if (!data) return null;
        const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(data)}`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const d = await r.json();
        const entry = d[0];
        return { type: "define", data: { word: entry.word, phonetic: entry.phonetic || "", meanings: (entry.meanings || []).slice(0, 3).map(m => ({ partOfSpeech: m.partOfSpeech, definitions: (m.definitions || []).slice(0, 2).map(df => ({ definition: df.definition, example: df.example || "" })) })) } };
      }
      case "joke": {
        const r = await fetch("https://official-joke-api.appspot.com/random_joke", { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return null;
        const d = await r.json();
        return { type: "joke", data: { setup: d.setup, punchline: d.punchline } };
      }
      case "translate": {
        if (!data?.text || !data?.target) return null;
        const LANG_CODES = { spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt", russian: "ru", japanese: "ja", chinese: "zh", korean: "ko", arabic: "ar", hindi: "hi", dutch: "nl", swedish: "sv", polish: "pl", turkish: "tr" };
        const targetCode = LANG_CODES[data.target?.toLowerCase()] || data.target?.slice(0, 2) || "es";
        const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(data.text)}&langpair=en|${targetCode}`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const d = await r.json();
        if (d.responseStatus === 200 && d.responseData?.translatedText) return { type: "translate", data: { original: data.text, translated: d.responseData.translatedText, source: "en", target: targetCode } };
        return null;
      }
      case "currency": {
        if (!data?.from || !data?.to) return null;
        const r = await fetch(`https://api.frankfurter.app/latest?amount=${data.amount || 1}&from=${data.from}&to=${data.to}`, { signal: AbortSignal.timeout(8000) });
        if (!r.ok) return null;
        const d = await r.json();
        const converted = d.rates?.[data.to];
        if (converted === undefined) return null;
        return { type: "currency", data: { amount: data.amount || 1, from: data.from, to: data.to, result: converted, rate: converted / (data.amount || 1), date: d.date } };
      }
      case "worldclock": {
        const TIMEZONES = [
          { label: "New York", tz: "America/New_York" }, { label: "London", tz: "Europe/London" },
          { label: "Tokyo", tz: "Asia/Tokyo" }, { label: "Sydney", tz: "Australia/Sydney" },
          { label: "Dubai", tz: "Asia/Dubai" }, { label: "Los Angeles", tz: "America/Los_Angeles" },
        ];
        const now = new Date();
        return { type: "worldclock", data: TIMEZONES.map(({ label, tz }) => ({ label, tz, time: now.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true }), date: now.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }) })) };
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
      case "map":
        return { type: "map", data: { query: data || "Richmond Virginia" } };
      case "image":
        if (!data) return null;
        return { type: "image", data: { prompt: data, url: `https://image.pollinations.ai/prompt/${encodeURIComponent(data)}?width=512&height=512&nologo=true` } };
      case "gallery": {
        const prompt = typeof data === "string" ? data : data?.prompt || "abstract art";
        const count = Math.min(typeof data === "object" ? data?.count || 4 : 4, 8);
        const images = Array.from({ length: count }, (_, i) => ({
          url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + " variation " + (i + 1))}?width=512&height=512&seed=${Date.now() + i}&nologo=true`,
          prompt: prompt + " variation " + (i + 1),
        }));
        return { type: "gallery", data: { prompt, images } };
      }
      case "qrcode":
        if (!data) return null;
        return { type: "qrcode", data: { text: data, url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(data)}&bgcolor=04070f&color=7ecfff` } };
      case "file_generate": {
        if (!data) return null;
        try {
          const resp = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/tools/generate-file`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: data, fileType: null }),
            signal: AbortSignal.timeout(30000),
          });
          if (!resp.ok) return null;
          return await resp.json();
        } catch { return null; }
      }
      default:
        return null;
    }
  } catch { return null; }
}

// ── Enhanced planning prompt ────────────────────────────────────────

const PLAN_SYSTEM = `You are the task planner for J.A.R.V.I.S., a genius-level AI assistant. Given a complex user request, break it into a JSON execution plan.

Each step: { "action": "tool"|"llm", "intent"?: string, "data"?: string|object, "description": string, "depends_on"?: number[] }

Available tool intents and their data format:
- weather: data = "city name" (string)
- stock: data = "TICKER" (string)
- news: data = "topic" or "top" (string)
- websearch: data = "search query" (string)
- wikipedia: data = "topic" (string)
- youtube: data = "search query" (string)
- calculate: data = "math expression" (string)
- define: data = "word" (string)
- joke: data = null
- translate: data = { "text": "...", "target": "language" }
- currency: data = { "amount": number, "from": "USD", "to": "EUR" }
- worldclock: data = null
- memory_save: data = "fact to remember" (string)
- memory_query: data = "search term" (string)
- map: data = "location" (string)
- image: data = "image description" (string)
- gallery: data = { "prompt": "...", "count": 4 }
- qrcode: data = "text or url" (string)
- file_generate: data = "description of file to generate" (string)

For "llm" steps, include "prompt" field — used for analysis, synthesis, comparison, and creative writing.
Use "depends_on" (array of step indices) when a step needs results from prior steps.

Rules:
1. Use 2-6 steps max. Be efficient.
2. Steps without depends_on can run in parallel.
3. Always end with an "llm" synthesis step that summarizes findings.
4. Only use tools when they genuinely add value — don't add unnecessary steps.
5. Output ONLY valid JSON: { "taskName": "short name", "steps": [...] }
6. For comparison tasks, fetch data for all items then synthesize.
7. If the request is simple (e.g. "tell me a joke"), use minimal steps.`;

async function planTask(userMessage, systemPrompt, learningCtx, memoryCtx) {
  const contextHint = learningCtx ? `\nUser context: ${learningCtx}` : "";
  const memHint = memoryCtx ? `\nUser memories: ${memoryCtx}` : "";
  try {
    const { reply } = await chatCompletion(
      [{ role: "user", content: `Plan this task: "${userMessage}"${contextHint}${memHint}` }],
      PLAN_SYSTEM, "fast"
    );
    const clean = reply.replace(/```json|```/g, "").trim();
    // Try to extract JSON from the response
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}

// ── Summarize tool result for context ────────────────────────────────

function summarizeToolResult(result) {
  if (!result) return "";
  switch (result.type) {
    case "stock": return `Stock ${result.data.symbol} (${result.data.name}): $${result.data.price} (${result.data.changePercent > 0 ? "+" : ""}${result.data.changePercent}%), High: $${result.data.high}, Low: $${result.data.low}`;
    case "weather": return `Weather in ${result.data.city}: ${result.data.temp}°F (feels ${result.data.feels_like}°F), ${result.data.description}, humidity ${result.data.humidity}%, wind ${result.data.wind} mph`;
    case "news": return `News headlines: ${result.data.slice(0, 4).map(a => a.title).join(" | ")}`;
    case "websearch": return `Search results: ${result.data.slice(0, 3).map(r => r.title + " — " + r.snippet).join(" | ")}`;
    case "wikipedia": return `Wikipedia (${result.data.title}): ${result.data.extract?.slice(0, 400)}`;
    case "memory_query": return `Memories: ${result.data.map(m => m.content).join("; ")}`;
    case "calculate": return `Calculation: ${result.data.expression} = ${result.data.result}`;
    case "define": return `Definition of "${result.data.word}": ${result.data.meanings?.[0]?.definitions?.[0]?.definition}`;
    case "joke": return `Joke: ${result.data.setup} — ${result.data.punchline}`;
    case "translate": return `Translation: "${result.data.original}" → "${result.data.translated}" (${result.data.target})`;
    case "currency": return `Currency: ${result.data.amount} ${result.data.from} = ${result.data.result} ${result.data.to}`;
    case "worldclock": return `World clocks: ${result.data.map(c => `${c.label}: ${c.time}`).join(", ")}`;
    case "youtube": return `YouTube: "${result.data.title}" by ${result.data.channel}`;
    case "file_download": return `Generated file: ${result.data?.filename} (${result.data?.label})`;
    case "image": return `Generated image: ${result.data?.prompt}`;
    case "gallery": return `Generated gallery: ${result.data?.images?.length} images of "${result.data?.prompt}"`;
    default: return JSON.stringify(result.data).slice(0, 300);
  }
}

// ── Main handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { message, messages: conversationHistory, systemPrompt, userId, mode } = req.body;
  if (!message) return res.status(400).json({ error: "message required" });

  const uid = userId || "default";

  // SSE setup
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  function send(type, data) {
    try { res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`); } catch {}
  }

  try {
    // Gather context
    let learningCtx = "";
    let memoryCtx = "";
    try {
      const facts = getLearningContext(uid);
      if (facts.length > 0) learningCtx = facts.slice(-15).map(f => f.content).join("; ");
    } catch {}
    try {
      const mems = searchMemories("*");
      if (mems.length > 0) memoryCtx = mems.slice(-10).map(m => m.content).join("; ");
    } catch {}

    // Step 1: Plan
    send("status", { text: "Analyzing request and creating execution plan..." });
    const plan = await planTask(message, systemPrompt, learningCtx, memoryCtx);

    if (!plan || !plan.steps?.length) {
      // Simple request — just answer directly with context
      send("status", { text: "Generating response..." });
      const contextPrompt = systemPrompt + (learningCtx ? ` User context: ${learningCtx}.` : "") + (memoryCtx ? ` Memories: ${memoryCtx}.` : "");
      const msgs = conversationHistory?.length > 0 ? conversationHistory.slice(-6) : [{ role: "user", content: message }];
      const { reply, model } = await chatCompletion(msgs, contextPrompt, mode || "fast");
      send("reply", { text: reply, model });
      send("done", {});
      return res.end();
    }

    send("plan", { taskName: plan.taskName, steps: plan.steps.map(s => s.description) });

    const toolResults = [];
    const stepResults = new Map();

    // Step 2: Execute steps — parallelize independent steps
    const totalSteps = plan.steps.length;
    const completed = new Set();

    async function executeStep(index) {
      const step = plan.steps[index];
      if (!step) return;

      // Wait for dependencies
      if (step.depends_on?.length) {
        const depTimeout = setTimeout(() => {}, 30000);
        while (step.depends_on.some(d => !completed.has(d))) {
          await new Promise(r => setTimeout(r, 100));
        }
        clearTimeout(depTimeout);
      }

      send("step", { index, description: step.description, total: totalSteps });

      if (step.action === "tool" && step.intent) {
        const result = await runTool(step.intent, step.data);
        if (result) {
          toolResults.push(result);
          stepResults.set(index, result);
          send("tool", { tool: result });
        } else {
          send("step_error", { index, description: `Could not complete: ${step.description}` });
        }
      } else if (step.action === "llm") {
        send("status", { text: step.description });
        // Build context from dependent step results
        let depContext = "";
        if (step.depends_on?.length) {
          for (const depIdx of step.depends_on) {
            const depResult = stepResults.get(depIdx);
            if (depResult) depContext += summarizeToolResult(depResult) + "\n";
          }
        } else {
          // Use all prior results
          for (const [, r] of stepResults) {
            depContext += summarizeToolResult(r) + "\n";
          }
        }

        const prompt = step.prompt || step.description;
        const llmContext = depContext ? `Gathered data:\n${depContext}\n\nTask: ${prompt}` : `Task: ${prompt}\nUser's original request: "${message}"`;
        const { reply } = await chatCompletion(
          [{ role: "user", content: llmContext }],
          systemPrompt + " Be concise and conversational. Reference specific data points.",
          mode || "fast"
        );
        stepResults.set(index, { type: "analysis", text: reply });
        send("partial", { text: reply, index });
      }

      completed.add(index);
    }

    // Group steps by dependency level for parallel execution
    const levels = [];
    const assigned = new Set();

    while (assigned.size < totalSteps) {
      const level = [];
      for (let i = 0; i < totalSteps; i++) {
        if (assigned.has(i)) continue;
        const deps = plan.steps[i].depends_on || [];
        if (deps.every(d => assigned.has(d))) level.push(i);
      }
      if (level.length === 0) break; // prevent infinite loop
      levels.push(level);
      for (const i of level) assigned.add(i);
    }

    for (const level of levels) {
      if (level.length === 1) {
        await executeStep(level[0]);
      } else {
        // Execute independent steps in parallel
        send("status", { text: `Running ${level.length} tasks in parallel...` });
        await Promise.all(level.map(i => executeStep(i)));
      }
    }

    // Step 3: Final synthesis
    send("status", { text: "Synthesizing final response..." });
    let contextSummary = `Original request: "${message}"\n\nGathered data:\n`;
    for (const r of toolResults) {
      contextSummary += "- " + summarizeToolResult(r) + "\n";
    }
    // Include any LLM analysis results
    for (const [, r] of stepResults) {
      if (r.type === "analysis") contextSummary += "- Analysis: " + r.text.slice(0, 500) + "\n";
    }

    const finalPrompt = toolResults.length > 0
      ? `${contextSummary}\n\nBased on all this data, provide a comprehensive, conversational response to the user. Reference specific numbers, facts, and details. Be the genius-level AI assistant JARVIS.`
      : `The user asked: "${message}"\n\nRespond helpfully, concisely, and conversationally.`;

    const fullSysPrompt = systemPrompt + (learningCtx ? ` User context: ${learningCtx}.` : "") + (memoryCtx ? ` Memories: ${memoryCtx}.` : "");
    const { reply: finalReply, model } = await chatCompletion(
      [{ role: "user", content: finalPrompt }],
      fullSysPrompt, mode || "fast"
    );

    // Learn from interaction
    try { await addLearningFact(uid, `User asked agent: ${message.slice(0, 100)}`); } catch {}

    send("reply", { text: finalReply, model, toolCount: toolResults.length });
    send("done", {});
  } catch (e) {
    send("error", { text: "Agent encountered an error, sir. Falling back to standard mode." });
    send("done", {});
  }

  res.end();
}
