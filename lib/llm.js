// Free OpenRouter models — verified May 2026
// Using the auto-router first, then falling back to individual models
const OPENROUTER_MODELS = [
  "openrouter/free",
  "openai/gpt-oss-120b:free",
  "nvidia/nemotron-3-super:free",
  "deepseek/deepseek-v4-flash:free",
  "z-ai/glm-4.5-air:free",
  "minimax/minimax-m2.5:free",
  "google/gemini-2.0-flash-exp:free",
  "meta-llama/llama-4-maverick:free",
  "meta-llama/llama-4-scout:free",
  "qwen/qwen3-235b-a22b:free",
  "qwen/qwen3-30b-a3b:free",
  "google/gemma-3-27b-it:free",
  "mistralai/mistral-small-3.1-24b-instruct:free",
  "nvidia/nemotron-3-nano-30b-a3b:free",
  "arcee-ai/trinity-large-thinking:free",
];

// Track which models are rate-limited and when they can be retried
const rateLimitedModels = new Map();
const RATE_LIMIT_COOLDOWN_MS = 60000;

// Simple in-memory response cache
const responseCache = new Map();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 300000; // 5 minutes

function getCacheKey(messages, systemPrompt) {
  const lastMsg = messages[messages.length - 1]?.content || "";
  return systemPrompt.slice(0, 50) + "|" + lastMsg.slice(0, 200);
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
      signal: AbortSignal.timeout(15000),
    });

    if (res.status === 429) {
      markRateLimited(model);
      return null;
    }
    if (!res.ok) return null;

    const data = await res.json();
    if (data.error) {
      if (data.error.code === 429 || (data.error.message || "").includes("rate")) {
        markRateLimited(model);
      }
      return null;
    }

    return data.choices?.[0]?.message?.content || null;
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
      signal: AbortSignal.timeout(15000),
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

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const geminiContents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
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

export async function chatCompletion(messages, systemPrompt) {
  // Check cache
  const cacheKey = getCacheKey(messages, systemPrompt);
  const cached = getCached(cacheKey);
  if (cached) return { reply: cached, model: "cache" };

  // Try all OpenRouter free models
  for (const model of OPENROUTER_MODELS) {
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
      return { reply, model: "gemini" };
    }
  } catch {
    // fall through
  }

  return { reply: "All AI models are currently busy. Please try again in a moment — I have 15 free models that rotate, so this should clear up quickly.", model: "none" };
}

export async function chatCompletionStream(messages, systemPrompt) {
  for (const model of OPENROUTER_MODELS) {
    try {
      const stream = await callOpenRouterStream(messages, systemPrompt, model);
      if (stream) return { stream, model };
    } catch {
      continue;
    }
  }
  return null;
}
