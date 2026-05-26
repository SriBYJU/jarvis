import { detectIntent } from "../../lib/intent";
import { chatCompletion } from "../../lib/llm";
import {
  addMemory, searchMemories, clearMemories,
  addProject, getProjects, getProject,
  getLearningContext, addLearningFact,
  addReminder,
} from "../../lib/store";

// ── Inlined tool functions (no internal HTTP) ─────────────────────

async function toolWeather(location) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;
  const resp = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=imperial`);
  if (!resp.ok) return null;
  const d = await resp.json();
  return {
    type: "weather",
    data: {
      city: d.name, country: d.sys?.country,
      temp: Math.round(d.main.temp), feels_like: Math.round(d.main.feels_like),
      humidity: d.main.humidity, wind: d.wind.speed,
      description: d.weather?.[0]?.description || "",
      icon: d.weather?.[0]?.icon || "",
    },
  };
}

async function toolYouTube(query) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;
  const resp = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${apiKey}`);
  if (!resp.ok) return null;
  const d = await resp.json();
  const video = d.items?.[0];
  if (!video) return null;
  return {
    type: "youtube",
    data: {
      videoId: video.id.videoId,
      title: video.snippet.title,
      channel: video.snippet.channelTitle,
      thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url,
    },
  };
}

async function toolStock(symbol) {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;
  const [quoteResp, profileResp] = await Promise.all([
    fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
    fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`),
  ]);
  if (!quoteResp.ok) return null;
  const quote = await quoteResp.json();
  const profile = profileResp.ok ? await profileResp.json() : {};
  if (!quote.c) return null;
  return {
    type: "stock",
    data: {
      symbol: symbol.toUpperCase(),
      name: profile.name || symbol,
      price: quote.c, change: quote.d, changePercent: quote.dp,
      high: quote.h, low: quote.l, open: quote.o, previousClose: quote.pc,
      industry: profile.finnhubIndustry || "", logo: profile.logo || "",
    },
  };
}

async function toolNews(query) {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return null;
  const url = (!query || query === "top")
    ? `https://newsapi.org/v2/top-headlines?country=us&pageSize=5&apiKey=${apiKey}`
    : `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=5&sortBy=publishedAt&apiKey=${apiKey}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  const d = await resp.json();
  return {
    type: "news",
    data: (d.articles || []).map(a => ({
      title: a.title, source: a.source?.name || "",
      url: a.url, publishedAt: a.publishedAt,
      description: a.description || "", image: a.urlToImage || "",
    })),
  };
}

async function toolWebSearch(query) {
  const apiKey = process.env.GOOGLE_API_KEY || process.env.YOUTUBE_API_KEY;
  const cseId = process.env.GOOGLE_SEARCH_CX || process.env.GOOGLE_CSE_ID;
  if (!apiKey || !cseId) return null;
  const resp = await fetch(`https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cseId}&num=5`);
  if (!resp.ok) return null;
  const d = await resp.json();
  return {
    type: "websearch",
    data: (d.items || []).map(item => ({
      title: item.title, link: item.link, snippet: item.snippet || "",
      image: item.pagemap?.cse_thumbnail?.[0]?.src || item.pagemap?.cse_image?.[0]?.src || "",
    })),
  };
}

async function toolTranslate(text, target) {
  const LANG_CODES = {
    spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt",
    russian: "ru", japanese: "ja", chinese: "zh", korean: "ko", arabic: "ar",
    hindi: "hi", dutch: "nl", swedish: "sv", polish: "pl", turkish: "tr",
  };
  const targetCode = LANG_CODES[target?.toLowerCase()] || target?.slice(0, 2) || "es";
  try {
    const resp = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetCode}`);
    if (resp.ok) {
      const d = await resp.json();
      if (d.responseStatus === 200 && d.responseData?.translatedText) {
        return { type: "translate", data: { original: text, translated: d.responseData.translatedText, source: "en", target: targetCode } };
      }
    }
  } catch {}
  return null;
}

async function toolCurrency(amount, from, to) {
  try {
    const resp = await fetch(`https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`);
    if (!resp.ok) return null;
    const d = await resp.json();
    const converted = d.rates?.[to];
    if (converted === undefined) return null;
    return { type: "currency", data: { amount, from, to, result: converted, rate: converted / amount, date: d.date } };
  } catch { return null; }
}

function toolConvert(value, from, to) {
  const CONVERSIONS = {
    "km|mi": v => v * 0.621371, "mi|km": v => v * 1.60934,
    "celsius|fahrenheit": v => (v * 9) / 5 + 32, "fahrenheit|celsius": v => ((v - 32) * 5) / 9,
    "kg|lbs": v => v * 2.20462, "lbs|kg": v => v / 2.20462,
    "meters|feet": v => v * 3.28084, "feet|meters": v => v / 3.28084,
    "inches|cm": v => v * 2.54, "cm|inches": v => v / 2.54,
    "oz|grams": v => v * 28.3495, "grams|oz": v => v / 28.3495,
    "liters|gallons": v => v * 0.264172, "gallons|liters": v => v / 0.264172,
  };
  const key = `${from?.toLowerCase()}|${to?.toLowerCase()}`;
  const converter = CONVERSIONS[key];
  if (!converter) return null;
  return { type: "convert", data: { value, from, to, result: Math.round(converter(value) * 10000) / 10000 } };
}

function toolWorldClock() {
  const TIMEZONES = [
    { label: "New York", tz: "America/New_York" }, { label: "London", tz: "Europe/London" },
    { label: "Tokyo", tz: "Asia/Tokyo" }, { label: "Sydney", tz: "Australia/Sydney" },
    { label: "Dubai", tz: "Asia/Dubai" }, { label: "Los Angeles", tz: "America/Los_Angeles" },
  ];
  const now = new Date();
  return {
    type: "worldclock",
    data: TIMEZONES.map(({ label, tz }) => ({
      label, tz,
      time: now.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true }),
      date: now.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" }),
    })),
  };
}

async function toolJoke() {
  try {
    const resp = await fetch("https://official-joke-api.appspot.com/random_joke");
    if (!resp.ok) return null;
    const d = await resp.json();
    return { type: "joke", data: { setup: d.setup, punchline: d.punchline } };
  } catch { return null; }
}

async function toolWikipedia(query) {
  try {
    const resp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "JARVIS/2.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) {
      const d = await resp.json();
      return { type: "wikipedia", data: { title: d.title, extract: d.extract || "", description: d.description || "", thumbnail: d.thumbnail?.source || "", url: d.content_urls?.desktop?.page || "" } };
    }
  } catch {}
  return null;
}

function toolCalculate(expression) {
  try {
    const sanitized = expression.replace(/[^0-9+\-*/().%^ ]/g, "").replace(/\^/g, "**");
    const result = new Function("return (" + sanitized + ")")();
    if (typeof result !== "number" || !isFinite(result)) return null;
    return { type: "calculate", data: { expression: expression.trim(), result: Math.round(result * 1e10) / 1e10 } };
  } catch { return null; }
}

async function toolDefine(word) {
  try {
    const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const entry = data[0];
    return {
      type: "define",
      data: {
        word: entry.word, phonetic: entry.phonetic || entry.phonetics?.[0]?.text || "",
        audio: entry.phonetics?.find(p => p.audio)?.audio || "",
        meanings: (entry.meanings || []).slice(0, 3).map(m => ({
          partOfSpeech: m.partOfSpeech,
          definitions: (m.definitions || []).slice(0, 2).map(d => ({ definition: d.definition, example: d.example || "" })),
        })),
      },
    };
  } catch { return null; }
}

function toolQRCode(text) {
  return { type: "qrcode", data: { text, url: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}&bgcolor=04070f&color=7ecfff` } };
}

function toolImage(prompt) {
  return { type: "image", data: { prompt, url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true` } };
}

async function toolGenerateFile(prompt, fileType) {
  // Detect file type from prompt if not specified
  if (!fileType) {
    const p = prompt.toLowerCase();
    if (p.match(/excel|xlsx|spreadsheet/)) fileType = "xlsx";
    else if (p.match(/word|docx|document/)) fileType = "docx";
    else if (p.match(/powerpoint|pptx|presentation|slides/)) fileType = "pptx";
    else if (p.match(/csv/)) fileType = "csv";
    else if (p.match(/json/)) fileType = "json";
    else if (p.match(/html|webpage|web page/)) fileType = "html";
    else if (p.match(/python|\.py/)) fileType = "python";
    else if (p.match(/javascript|\.js|node/)) fileType = "javascript";
    else if (p.match(/markdown|\.md/)) fileType = "markdown";
    else if (p.match(/report|document|doc/)) fileType = "docx";
    else fileType = "txt";
  }
  try {
    const resp = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/tools/generate-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileType, prompt }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}

function toolExecute(code, language) {
  if (language === "python") {
    return { type: "execute", data: { code, language: "python", output: "Python runs client-side via Pyodide.", error: null } };
  }
  const logs = [];
  let error = null;
  try {
    const consoleMock = {
      log: (...args) => logs.push(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")),
      error: (...args) => logs.push("ERROR: " + args.join(" ")),
      warn: (...args) => logs.push("WARN: " + args.join(" ")),
    };
    const result = new Function("console", `"use strict";\n${code}`)(consoleMock);
    if (result !== undefined) logs.push(String(result));
  } catch (e) { error = e.message; }
  return { type: "execute", data: { code, language: language || "javascript", output: logs.join("\n") || "(no output)", error } };
}

async function toolBrowse(url) {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; JARVIS/1.0)" }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const html = await resp.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || url;
    return { type: "browse", data: { url, title, content: text } };
  } catch { return null; }
}

async function toolScreenshot(url) {
  try {
    const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 JARVIS Bot" }, signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    const html = await resp.text();
    const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 4000);
    return { type: "screenshot", data: { url, summary: text.slice(0, 500), rawText: text.slice(0, 1000) } };
  } catch { return null; }
}

function toolReminder(data) {
  const { task, type, time, seconds } = data;
  let fireAt;
  if (type === "absolute" && time) {
    const now = new Date();
    const match = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (match) {
      let hours = parseInt(match[1]);
      const minutes = match[2] ? parseInt(match[2]) : 0;
      const period = match[3]?.toLowerCase();
      if (period === "pm" && hours < 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;
      const target = new Date(now);
      target.setHours(hours, minutes, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      fireAt = target.toISOString();
    }
  } else if (type === "relative" && seconds) {
    fireAt = new Date(Date.now() + seconds * 1000).toISOString();
  } else {
    fireAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }
  try {
    const entry = addReminder({ task, fireAt, type: type || "immediate" });
    return { type: "reminder", data: { ...entry, fireAt, timeStr: time || "" } };
  } catch { return null; }
}

// ── Learning helpers ──────────────────────────────────────────────

function extractLearningFacts(userMsg) {
  const facts = [];
  const patterns = [
    /(?:i (?:like|love|prefer|enjoy|want|need|use|work (?:with|on|at)|live (?:in|near|at)|am (?:a|an|from|in|into))\s+)(.{3,60})/i,
    /(?:my (?:name|favorite|job|location|email|phone|school|major|hobby|interest) (?:is|are)\s+)(.{2,60})/i,
  ];
  for (const pat of patterns) {
    const m = userMsg.match(pat);
    if (m) facts.push(m[0].trim());
  }
  return facts;
}

// ── Main handler ──────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages: rawMessages, systemPrompt, userId, mode, model: specificModel } = req.body;
  const messages = rawMessages || [];
  const lastMsg = messages.length > 0 ? (messages[messages.length - 1]?.content || "") : "";
  const { intent, data } = detectIntent(lastMsg);
  const uid = userId || "default";

  let toolResult = null;
  let quickReply = null;

  // File generation override — check before intent switch
  const fileGenMatch = lastMsg.match(/(?:generate|create|make|write)\s+(?:a\s+|an\s+|me\s+a\s+)?(?:excel|xlsx|spreadsheet|word\s+(?:doc|document)|docx|powerpoint|pptx|presentation|csv\s+(?:file)?|json\s+file|html\s+(?:file|page)|python\s+(?:script|file)|javascript\s+(?:script|file)|node\.?js|markdown\s+(?:doc|file)|\.md|text\s+file|report\s+(?:on|about))/i);
  if (fileGenMatch) {
    const result = await toolGenerateFile(lastMsg, null);
    if (result) {
      toolResult = result;
      quickReply = `Your ${result.data?.label || "file"} is ready to download, sir.`;
      return res.status(200).json({ reply: quickReply, tool: toolResult });
    }
  }

  try {
    switch (intent) {
      case "weather":
        if (data) toolResult = await toolWeather(data);
        break;
      case "youtube":
        if (data) toolResult = await toolYouTube(data);
        break;
      case "stock":
        if (data) toolResult = await toolStock(data);
        break;
      case "news":
        toolResult = await toolNews(data);
        break;
      case "websearch":
        if (data) toolResult = await toolWebSearch(data);
        break;
      case "translate":
        if (data?.text) toolResult = await toolTranslate(data.text, data.target);
        break;
      case "currency":
        if (data) toolResult = await toolCurrency(data.amount, data.from, data.to);
        break;
      case "convert":
        if (data) toolResult = toolConvert(data.value, data.from, data.to);
        break;
      case "worldclock":
        toolResult = toolWorldClock();
        break;
      case "joke":
        toolResult = await toolJoke();
        if (toolResult?.data) quickReply = `Here's one, sir: ${toolResult.data.setup} ... ${toolResult.data.punchline}`;
        break;
      case "wikipedia":
        if (data) {
          toolResult = await toolWikipedia(data);
          if (toolResult?.data?.extract) quickReply = toolResult.data.extract.slice(0, 200) + "...";
        }
        break;
      case "calculate":
        if (data) {
          toolResult = toolCalculate(data);
          if (toolResult?.data) quickReply = `${data} = ${toolResult.data.result}`;
        }
        break;
      case "define":
        if (data) {
          toolResult = await toolDefine(data);
          if (toolResult?.data?.meanings?.[0]) {
            const m = toolResult.data.meanings[0];
            quickReply = `${data} (${m.partOfSpeech}): ${m.definitions[0].definition}`;
          }
        }
        break;
      case "qrcode":
        if (data) {
          toolResult = toolQRCode(data);
          quickReply = `QR code generated for "${data}".`;
        }
        break;
      case "image":
        if (data) {
          toolResult = toolImage(data);
          quickReply = `Generating an image of "${data}" for you, sir.`;
        }
        break;
      case "execute":
        if (data) {
          toolResult = toolExecute(data, "javascript");
          quickReply = toolResult?.data?.error ? `Executed with an error: ${toolResult.data.error}` : "Code executed successfully, sir.";
        }
        break;
      case "browse":
        if (data) toolResult = await toolBrowse(data);
        break;
      case "file_generate": {
        const p = lastMsg;
        const fileMatch = p.match(/(?:generate|create|make|write)\s+(?:a\s+|an\s+|me\s+a\s+)?(?:(excel|xlsx|spreadsheet|word\s+doc|docx|powerpoint|pptx|presentation|csv|json|html|python|javascript|markdown|txt|text\s+file|report))/i);
        const fileType = fileMatch ? fileMatch[1].toLowerCase().replace(/\s+/g, "") : null;
        const result = await toolGenerateFile(p, fileType);
        if (result) {
          toolResult = result;
          quickReply = `Your ${result.data?.label || "file"} is ready to download, sir.`;
        }
        break;
      }
      case "screenshot":
        if (data) {
          toolResult = await toolScreenshot(data);
          quickReply = "I've analyzed that page for you, sir.";
        }
        break;
      case "map":
        toolResult = { type: "map", data: { query: data || "Richmond Virginia" } };
        break;
      case "timer":
        if (data) {
          toolResult = { type: "timer", data: { seconds: data } };
          const t = data;
          quickReply = `Timer set for ${t >= 3600 ? Math.floor(t / 3600) + " hour(s)" : t >= 60 ? Math.floor(t / 60) + " minute(s)" : t + " second(s)"}.`;
        }
        break;
      case "reminder":
        if (data) {
          toolResult = toolReminder(data);
          if (toolResult && data.type === "absolute") quickReply = `Reminder set for ${data.time} to ${data.task}.`;
          else if (toolResult && data.type === "relative") quickReply = `Reminder set. I'll remind you in ${data.seconds >= 60 ? Math.floor(data.seconds / 60) + " minute(s)" : data.seconds + " second(s)"}.`;
          else if (toolResult) quickReply = `Got it, I'll remind you: ${data.task}`;
        }
        break;
      case "gallery": {
        if (data) {
          const prompt = data.prompt || "abstract art";
          const count = Math.min(data.count || 4, 8);
          const images = Array.from({ length: count }, (_, i) => ({
            url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + " variation " + (i + 1))}?width=512&height=512&seed=${Date.now() + i}&nologo=true`,
            prompt: prompt + " variation " + (i + 1),
          }));
          toolResult = { type: "gallery", data: { prompt, images } };
          quickReply = `Generating ${count} variations of "${prompt}" for you, sir.`;
        }
        break;
      }
      case "vision":
        toolResult = { type: "vision_trigger", data: { prompt: data } };
        quickReply = "Opening the camera now, sir.";
        break;
      case "project_start":
        if (data) {
          const proj = addProject(data);
          toolResult = { type: "project_start", data: proj };
          quickReply = `Project "${data}" created. I'll track everything related to it.`;
        }
        break;
      case "project_list": {
        const projects = getProjects();
        toolResult = { type: "project_list", data: projects };
        quickReply = projects.length === 0 ? "No projects yet." : `You have ${projects.length} project(s): ${projects.map(p => p.name).join(", ")}`;
        break;
      }
      case "project_open":
        if (data) {
          const p = getProject(data);
          if (p) { toolResult = { type: "project", data: p }; quickReply = `Opening project "${p.name}".`; }
          else quickReply = `Project "${data}" not found.`;
        }
        break;
      case "memory_save":
        if (data) {
          const entry = addMemory(data);
          toolResult = { type: "memory_save", data: entry };
          quickReply = `Got it, I'll remember that: "${data}"`;
        }
        break;
      case "memory_query": {
        const results = searchMemories(data);
        toolResult = { type: "memory_query", data: results };
        quickReply = results.length === 0 ? "Nothing stored yet." : "Here's what I remember: " + results.map(r => r.content).join("; ");
        break;
      }
      case "memory_clear":
        clearMemories();
        toolResult = { type: "memory_clear", data: { cleared: true } };
        quickReply = "All memories erased, sir. Starting fresh.";
        break;
    }
  } catch (e) {
    console.error("Tool error:", e.message);
  }

  // Learn from message
  try {
    for (const fact of extractLearningFacts(lastMsg)) addLearningFact(uid, fact);
  } catch {}

  // Default replies for tools without a quickReply
  if (toolResult && !quickReply) {
    const defaults = {
      weather: "Here's the current weather, sir.", news: "Here are the latest headlines, sir.",
      map: "Map pulled up, sir.", youtube: "Found this video for you, sir.",
      stock: "Here's the stock data, sir.", websearch: "Here are the search results, sir.",
      browse: "Page fetched, sir.", worldclock: "Here are the current times around the world, sir.",
      translate: "Here's the translation, sir.", currency: "Here's the conversion, sir.",
      convert: "Here's the unit conversion, sir.", wikipedia: "Here's what Wikipedia says, sir.",
      image: "Image generated, sir.", define: "Here's the definition, sir.",
      qrcode: "QR code generated, sir.", execute: "Code executed, sir.",
      gallery: "Here's your gallery, sir.", vision_trigger: "Camera ready, sir.",
    };
    quickReply = defaults[toolResult.type] || "Here are the results, sir.";
  }

  if (quickReply && toolResult) {
    return res.status(200).json({ reply: quickReply, tool: toolResult });
  }

  // Fall through to LLM
  const isCodeRequest = intent === "code";
  const toolContext = toolResult ? ` A ${toolResult.type} result is displayed: ${JSON.stringify(toolResult.data).slice(0, 300)}.` : "";

  let learningCtx = "";
  try {
    const facts = getLearningContext(uid);
    if (facts.length > 0) learningCtx = " Things I know about this user: " + facts.slice(-15).map(f => f.content).join("; ") + ".";
  } catch {}

  let memoryCtx = "";
  try {
    const mems = searchMemories("*");
    if (mems.length > 0) memoryCtx = " Saved memories: " + mems.slice(-10).map(m => m.content).join("; ") + ".";
  } catch {}

  const fullSystemPrompt =
    systemPrompt +
    " You have real tools that show results on screen. Reference them naturally. Keep responses concise for speech, no markdown." +
    toolContext + learningCtx + memoryCtx +
    (isCodeRequest ? " Write clean, well-commented code." : "");

  try {
    const { reply, model: usedModel } = await chatCompletion(messages, fullSystemPrompt, mode || "fast", specificModel || null);

    try {
      for (const fact of extractLearningFacts(lastMsg)) addLearningFact(uid, fact);
    } catch {}

    let codeResult = null;
    let cleanReply = reply;
    if (isCodeRequest) {
      const codeMatch = reply.match(/```(\w+)?\n([\s\S]+?)```/);
      if (codeMatch) {
        codeResult = { type: "code", data: { language: codeMatch[1] || "javascript", code: codeMatch[2] } };
        cleanReply = reply.replace(/```[\s\S]+?```/g, "").trim();
      }
    }

    return res.status(200).json({ reply: cleanReply, tool: toolResult || codeResult || null, model: usedModel });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
