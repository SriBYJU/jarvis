// Free OpenRouter models — verified against /api/v1/models May 2026
const FAST_MODELS = [
  "openrouter/free",
  "deepseek/deepseek-v4-flash:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "google/gemma-4-26b-a4b-it:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "minimax/minimax-m2.5:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "poolside/laguna-xs.2:free",
  "z-ai/glm-4.5-air:free",
  "baidu/cobuddy:free",
  "liquid/lfm-2.5-1.2b-instruct:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

const THINKING_MODELS = [
  "openrouter/free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-120b:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "poolside/laguna-m.1:free",
  "deepseek/deepseek-v4-flash:free",
  "qwen/qwen3-coder:free",
  "arcee-ai/trinity-large-thinking:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "z-ai/glm-4.5-air:free",
  "google/gemma-4-31b-it:free",
  "liquid/lfm-2.5-1.2b-thinking:free",
];

const ALL_MODELS = [
  "openrouter/free",
  "deepseek/deepseek-v4-flash:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "z-ai/glm-4.5-air:free",
  "minimax/minimax-m2.5:free",
  "google/gemma-4-26b-a4b-it:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "arcee-ai/trinity-large-thinking:free",
  "nousresearch/hermes-3-llama-3.1-405b:free",
  "poolside/laguna-m.1:free",
  "poolside/laguna-xs.2:free",
  "qwen/qwen3-coder:free",
  "baidu/cobuddy:free",
  "liquid/lfm-2.5-1.2b-instruct:free",
  "liquid/lfm-2.5-1.2b-thinking:free",
  "meta-llama/llama-3.2-3b-instruct:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
];

function getModelsForMode(mode) {
  if (mode === "fast") return FAST_MODELS;
  if (mode === "thinking") return THINKING_MODELS;
  return ALL_MODELS;
}

const rateLimitedModels = new Map();
const RATE_LIMIT_COOLDOWN_MS = 60000;

const responseCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 300000;

function getCacheKey(messages, systemPrompt) {
  const lastMsg = messages[messages.length - 1]?.content || "";
  const textOnly = typeof lastMsg === "string" ? lastMsg : JSON.stringify(lastMsg);
  return systemPrompt.slice(0, 50) + "|" + textOnly.slice(0, 200);
}

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.time > CACHE_TTL_MS) { responseCache.delete(key); return null; }
  return entry.reply;
}

function setCache(key, reply) {
  if (responseCache.size >= CACHE_MAX_SIZE) {
    const oldest = responseCache.keys().next().value;
    responseCache.delete(oldest);
  }
  responseCache.set(key, { reply, time: Date.now() });
}

function isRateLimited(model) {
  const until = rateLimitedModels.get(model);
  if (!until) return false;
  if (Date.now() > until) { rateLimitedModels.delete(model); return false; }
  return true;
}

function markRateLimited(model) {
  rateLimitedModels.set(model, Date.now() + RATE_LIMIT_COOLDOWN_MS);
}

function sanitizeReply(text) {
  if (!text) return text;
  let cleaned = text.replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi, "");
  cleaned = cleaned.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  cleaned = cleaned.replace(/<invoke[\s\S]*?<\/invoke>/gi, "");
  cleaned = cleaned.replace(/<function_call>[\s\S]*?<\/function_call>/gi, "");
  cleaned = cleaned.replace(/<\/?(?:minimax:|anthropic:)?(?:tool_call|tool_result|function_call|invoke)[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?parameter[^>]*>/gi, "");
  cleaned = cleaned.trim();
  if (!cleaned) return null;
  return cleaned;
}

function getTimeout(model) {
  if (model.includes("120b") || model.includes("405b") || model.includes("laguna-m")) return 25000;
  return 15000;
}

async function callOpenRouter(messages, systemPrompt, model) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  if (isRateLimited(model)) return null;

  const body = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: 1024,
    temperature: 0.7,
  };

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
        "X-Title": "J.A.R.V.I.S.",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(getTimeout(model)),
    });

    if (res.status === 429) { markRateLimited(model); return null; }
    if (!res.ok) return null;

    const data = await res.json();
    if (data.error) {
      if (data.error.code === 429 || (data.error.message || "").includes("rate")) markRateLimited(model);
      return null;
    }

    const raw = data.choices?.[0]?.message?.content || null;
    return sanitizeReply(raw);
  } catch {
    return null;
  }
}

async function callOpenRouterStream(messages, systemPrompt, model) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  if (isRateLimited(model)) return null;

  const body = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    max_tokens: 1024,
    temperature: 0.7,
    stream: true,
  };

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
        "X-Title": "J.A.R.V.I.S.",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(getTimeout(model)),
    });

    if (res.status === 429) { markRateLimited(model); return null; }
    if (!res.ok) return null;
    return res.body;
  } catch {
    return null;
  }
}

async function callGemini(messages, systemPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const geminiContents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  }));

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!res.ok) return null;
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
}

export async function chatCompletion(messages, systemPrompt, mode = "fast", specificModel = null) {
  const cacheKey = getCacheKey(messages, systemPrompt);
  const cached = getCached(cacheKey);
  if (cached) return { reply: cached, model: "cache" };

  if (specificModel) {
    try {
      const reply = await callOpenRouter(messages, systemPrompt, specificModel);
      if (reply) { setCache(cacheKey, reply); return { reply, model: specificModel }; }
    } catch {}
  }

  const models = getModelsForMode(mode);
  for (const model of models) {
    if (specificModel && model === specificModel) continue;
    try {
      const reply = await callOpenRouter(messages, systemPrompt, model);
      if (reply) {
        setCache(cacheKey, reply);
        return { reply, model };
      }
    } catch {
      continue;
    }
  }

  // Gemini fallback
  try {
    const reply = await callGemini(messages, systemPrompt);
    if (reply) {
      setCache(cacheKey, reply);
      return { reply, model: "gemini-2.0-flash" };
    }
  } catch {}

  return { reply: "I'm having trouble connecting to my AI models right now. Please try again in a moment, sir.", model: "none" };
}

export async function chatCompletionStream(messages, systemPrompt, mode = "fast", specificModel = null) {
  if (specificModel) {
    try {
      const stream = await callOpenRouterStream(messages, systemPrompt, specificModel);
      if (stream) return { stream, model: specificModel };
    } catch {}
  }
  const models = getModelsForMode(mode);
  for (const model of models) {
    if (specificModel && model === specificModel) continue;
    try {
      const stream = await callOpenRouterStream(messages, systemPrompt, model);
      if (stream) return { stream, model };
    } catch {
      continue;
    }
  }
  // Gemini non-stream fallback (return null, caller will fall back to /api/chat)
  return null;
}

export { sanitizeReply };

export function getAvailableModels() {
  return ALL_MODELS.filter(m => !isRateLimited(m));
}
