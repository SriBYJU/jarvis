import { detectIntent } from "../../lib/intent";
import { chatCompletion } from "../../lib/llm";
import { addMemory, searchMemories, clearMemories, addProject, getProjects, getProject, getLearningContext, addLearningFact } from "../../lib/store";

const BASE = () => process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";

async function toolFetch(path, body) {
  const opts = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : {};
  const r = await fetch(BASE() + path, opts);
  return r.ok ? r.json() : null;
}

function extractLearningFacts(userMsg, aiReply) {
  const facts = [];
  const lower = userMsg.toLowerCase();
  const prefPatterns = [
    /(?:i (?:like|love|prefer|enjoy|want|need|use|work (?:with|on|at)|live (?:in|near|at)|am (?:a|an|from|in|into))\s+)(.{3,60})/i,
    /(?:my (?:name|favorite|job|location|email|phone|school|major|hobby|interest) (?:is|are)\s+)(.{2,60})/i,
  ];
  for (const pat of prefPatterns) {
    const m = userMsg.match(pat);
    if (m) facts.push(m[0].trim());
  }
  return facts;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages: rawMessages, systemPrompt, userId, mode, model: specificModel } = req.body;
  const messages = rawMessages || [];
  const lastMsg = messages.length > 0 ? (messages[messages.length - 1]?.content || "") : "";
  const { intent, data } = detectIntent(lastMsg);

  let toolResult = null;
  let quickReply = null;

  try {
    switch (intent) {
      case "weather": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/weather", { location: data });
        break;
      }
      case "youtube": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/youtube", { query: data });
        break;
      }
      case "translate": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/translate", data);
        break;
      }
      case "currency": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/currency", data);
        break;
      }
      case "convert": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/convert", data);
        break;
      }
      case "worldclock": {
        toolResult = await toolFetch("/api/tools/worldclock");
        break;
      }
      case "joke": {
        toolResult = await toolFetch("/api/tools/joke");
        if (toolResult?.data) quickReply = `Here's one: ${toolResult.data.setup} ... ${toolResult.data.punchline}`;
        break;
      }
      case "stock": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/stock", { symbol: data });
        break;
      }
      case "news": {
        toolResult = await toolFetch("/api/tools/news", { query: data });
        break;
      }
      case "websearch": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/websearch", { query: data });
        break;
      }
      case "browse": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/browse", { url: data });
        break;
      }
      case "map": {
        toolResult = { type: "map", data: { query: data || "Richmond Virginia" } };
        break;
      }
      case "timer": {
        if (!data) break;
        toolResult = { type: "timer", data: { seconds: data } };
        quickReply = `Timer set for ${data >= 3600 ? Math.floor(data / 3600) + " hour" + (Math.floor(data / 3600) > 1 ? "s" : "") : data >= 60 ? Math.floor(data / 60) + " minute" + (Math.floor(data / 60) > 1 ? "s" : "") : data + " second" + (data > 1 ? "s" : "")}. I'll alert you when it's done.`;
        break;
      }
      case "reminder": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/reminder", { action: "create", ...data });
        if (toolResult && data.type === "absolute") quickReply = `Reminder set for ${data.time} to ${data.task}. I'll make sure you don't forget.`;
        else if (toolResult && data.type === "relative") quickReply = `Reminder set. I'll remind you to ${data.task} in ${data.seconds >= 60 ? Math.floor(data.seconds / 60) + " minute(s)" : data.seconds + " second(s)"}.`;
        else if (toolResult) quickReply = `I'll remember to remind you: ${data.task}`;
        break;
      }
      case "image": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/image", { prompt: data });
        quickReply = `Generating an image of "${data}" for you.`;
        break;
      }
      case "wikipedia": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/wikipedia", { query: data });
        if (toolResult?.data?.extract) quickReply = toolResult.data.extract.slice(0, 200) + "...";
        break;
      }
      case "calculate": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/calculate", { expression: data });
        if (toolResult?.data) quickReply = `${data} = ${toolResult.data.result}`;
        break;
      }
      case "define": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/define", { word: data });
        if (toolResult?.data?.meanings?.[0]) {
          const m = toolResult.data.meanings[0];
          quickReply = `${data} (${m.partOfSpeech}): ${m.definitions[0].definition}`;
        }
        break;
      }
      case "qrcode": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/qrcode", { text: data });
        quickReply = `QR code generated for "${data}".`;
        break;
      }
      case "project_start": {
        if (!data) break;
        const proj = addProject(data);
        toolResult = { type: "project_start", data: proj };
        quickReply = `Project "${data}" has been created. I'll track everything related to it.`;
        break;
      }
      case "project_list": {
        const projects = getProjects();
        toolResult = { type: "project_list", data: projects };
        if (projects.length === 0) quickReply = "No projects yet. Say 'start project [name]' to create one.";
        else quickReply = `You have ${projects.length} project(s): ${projects.map(p => p.name).join(", ")}`;
        break;
      }
      case "project_open": {
        if (!data) break;
        const p = getProject(data);
        if (p) {
          toolResult = { type: "project", data: p };
          quickReply = `Opening project "${p.name}". Created ${new Date(p.createdAt).toLocaleDateString()}, ${p.notes.length} notes.`;
        } else {
          quickReply = `Project "${data}" not found. Say 'show my projects' to see available projects.`;
        }
        break;
      }
      case "memory_save": {
        if (!data) break;
        const entry = addMemory(data);
        toolResult = { type: "memory_save", data: entry };
        quickReply = `Got it, I'll remember that: "${data}"`;
        break;
      }
      case "memory_query": {
        const results = searchMemories(data);
        toolResult = { type: "memory_query", data: results };
        if (results.length === 0) quickReply = "I don't have any memories matching that. Try telling me to remember something first.";
        else quickReply = "Here's what I remember: " + results.map((r) => r.content).join("; ");
        break;
      }
      case "memory_clear": {
        clearMemories();
        toolResult = { type: "memory_clear", data: { cleared: true } };
        quickReply = "All memories have been erased. Starting fresh.";
        break;
      }
      case "execute": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/execute", { code: data, language: "javascript" });
        if (toolResult?.data?.error) quickReply = `Code executed with an error: ${toolResult.data.error}`;
        else quickReply = "Code executed successfully, sir. Output is displayed on screen.";
        break;
      }
      case "screenshot": {
        if (!data) break;
        toolResult = await toolFetch("/api/tools/screenshot", { url: data });
        quickReply = "I've analyzed that page for you, sir.";
        break;
      }
      case "gallery": {
        if (!data) break;
        const prompt = data.prompt || "abstract art";
        const count = Math.min(data.count || 4, 8);
        const images = [];
        for (let i = 0; i < count; i++) {
          images.push({
            url: `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + " variation " + (i + 1))}?width=512&height=512&seed=${Date.now() + i}&nologo=true`,
            prompt: prompt + " variation " + (i + 1),
          });
        }
        toolResult = { type: "gallery", data: { prompt, images } };
        quickReply = `Generating ${count} variations of "${prompt}" for you, sir.`;
        break;
      }
      case "vision": {
        toolResult = { type: "vision_trigger", data: { prompt: data } };
        quickReply = "Opening the camera now, sir. Show me what you'd like me to analyze.";
        break;
      }
    }
  } catch (e) {
    console.error("Tool error:", e.message);
  }

  // Learn from the user's message
  const uid = userId || "default";
  try {
    const facts = extractLearningFacts(lastMsg, "");
    for (const fact of facts) addLearningFact(uid, fact);
  } catch {}

  // If we have a tool result but no quickReply, generate a default one
  if (toolResult && !quickReply) {
    const defaults = {
      weather: "Here's the current weather for you, sir.",
      news: "Here are the latest headlines I found, sir.",
      map: "I've pulled up the map for you, sir.",
      youtube: "I found this video for you, sir.",
      stock: "Here's the stock information you requested, sir.",
      websearch: "Here are the search results, sir.",
      browse: "I've fetched that page for you, sir.",
      worldclock: "Here are the current times around the world, sir.",
      translate: "Here's the translation, sir.",
      currency: "Here's the conversion, sir.",
      convert: "Here's the unit conversion, sir.",
      wikipedia: "Here's what I found on Wikipedia, sir.",
      image: "I've generated that image for you, sir.",
      define: "Here's the definition, sir.",
      qrcode: "QR code generated, sir.",
      code: "Here's the code you requested, sir.",
      execute: "Code executed, sir. Results are on screen.",
      screenshot: "I've analyzed that page, sir.",
      gallery: "Here's your AI art gallery, sir.",
      vision_trigger: "Camera is ready, sir. Show me what you'd like analyzed.",
      vision: "Here's my analysis, sir.",
    };
    quickReply = defaults[toolResult.type] || "Here are the results, sir.";
  }

  if (quickReply && toolResult) {
    return res.status(200).json({ reply: quickReply, tool: toolResult });
  }

  // Build adaptive system prompt with learning context
  const isCodeRequest = intent === "code";
  const toolContext = toolResult ? ` A ${toolResult.type} result is being displayed: ${JSON.stringify(toolResult.data).slice(0, 300)}.` : "";

  let learningCtx = "";
  try {
    const facts = getLearningContext(uid);
    if (facts.length > 0) {
      learningCtx = " Things I've learned about this user: " + facts.slice(-15).map(f => f.content).join("; ") + ".";
    }
  } catch {}

  let memoryCtx = "";
  try {
    const mems = searchMemories("*");
    if (mems.length > 0) {
      memoryCtx = " User's saved memories: " + mems.slice(-10).map(m => m.content).join("; ") + ".";
    }
  } catch {}

  const fullSystemPrompt =
    systemPrompt +
    " You have real tools that show results on screen. Reference them naturally. Keep responses concise for speech, no markdown." +
    toolContext + learningCtx + memoryCtx +
    (isCodeRequest ? " Write clean well-commented code." : "");

  try {
    const { reply, model: usedModel } = await chatCompletion(messages, fullSystemPrompt, mode || "fast", specificModel || null);

    // Learn from the conversation
    try {
      const newFacts = extractLearningFacts(lastMsg, reply);
      for (const fact of newFacts) addLearningFact(uid, fact);
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
