const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.JARVIS_MODEL || "qwen3:4b";
const KEEP_ALIVE = process.env.JARVIS_KEEP_ALIVE || "45m";
const REMOTE_FALLBACK = /^(?:1|true|yes)$/i.test(process.env.JARVIS_REMOTE_FALLBACK || "");

const responseCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 200;

function cacheKey(messages, systemPrompt, model) {
  const last = messages[messages.length - 1]?.content || "";
  return `${model}|${String(systemPrompt || "").slice(0, 80)}|${typeof last === "string" ? last.slice(0, 500) : JSON.stringify(last).slice(0, 500)}`;
}

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.value;
}

function putCached(key, value) {
  if (responseCache.size >= CACHE_MAX) responseCache.delete(responseCache.keys().next().value);
  responseCache.set(key, { at: Date.now(), value });
}

export function sanitizeReply(text) {
  let cleaned = String(text || "").trim();
  if (!cleaned) return null;
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/<minimax:tool_call>[\s\S]*?<\/minimax:tool_call>/gi, "");
  cleaned = cleaned.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  cleaned = cleaned.replace(/<invoke[\s\S]*?<\/invoke>/gi, "");
  cleaned = cleaned.replace(/<function_call>[\s\S]*?<\/function_call>/gi, "");
  cleaned = cleaned.replace(/<\/?(?:minimax:|anthropic:)?(?:tool_call|tool_result|function_call|invoke)[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?parameter[^>]*>/gi, "");
  const reasoningLeak = /\b(?:the user|user is asking|let me think|first i need to|i should check|chain of thought|my reasoning)\b/i;
  if (reasoningLeak.test(cleaned)) {
    cleaned = cleaned.split(/(?<=[.!?])\s+/).filter(s => !reasoningLeak.test(s)).join(" ").trim();
  }
  return cleaned || null;
}

function normalizeMessages(messages) {
  return (messages || []).map(m => ({
    role: m.role === "assistant" ? "assistant" : m.role === "system" ? "system" : "user",
    content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
  }));
}

async function callOllama(messages, systemPrompt, mode, model) {
  const timeout = mode === "thinking" ? 22000 : 14000;
  const maxTokens = mode === "thinking" ? 520 : 280;
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${systemPrompt || ""}\nNever expose hidden reasoning or tool-selection narration. Speak directly and naturally.` },
        ...normalizeMessages(messages),
      ],
      think: false,
      stream: false,
      keep_alive: KEEP_ALIVE,
      options: {
        temperature: mode === "thinking" ? 0.18 : 0.2,
        num_ctx: 4096,
        num_predict: maxTokens,
        repeat_penalty: 1.08,
      },
    }),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`Ollama HTTP ${response.status}`);
  const data = await response.json();
  const reply = sanitizeReply(data.message?.content);
  if (!reply) throw new Error("Local model returned an empty response");
  return { reply, model: data.model || model };
}

async function callOpenRouter(messages, systemPrompt, model) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!REMOTE_FALLBACK || !apiKey) return null;
  const remoteModel = model && model.includes("/") ? model : (process.env.JARVIS_REMOTE_MODEL || "openai/gpt-4o-mini");
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
        "X-Title": "J.A.R.V.I.S.",
      },
      body: JSON.stringify({
        model: remoteModel,
        messages: [{ role: "system", content: systemPrompt || "" }, ...normalizeMessages(messages)],
        max_tokens: 600,
        temperature: 0.25,
      }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const reply = sanitizeReply(data.choices?.[0]?.message?.content);
    return reply ? { reply, model: remoteModel } : null;
  } catch {
    return null;
  }
}

export async function chatCompletion(messages, systemPrompt, mode = "fast", specificModel = null) {
  const model = specificModel && !specificModel.includes("/") ? specificModel : DEFAULT_MODEL;
  const key = cacheKey(messages, systemPrompt, model);
  const cached = getCached(key);
  if (cached) return { reply: cached.reply, model: `cache/${cached.model}` };

  try {
    const local = await callOllama(messages, systemPrompt, mode, model);
    putCached(key, local);
    return local;
  } catch (localError) {
    const remote = await callOpenRouter(messages, systemPrompt, specificModel);
    if (remote) {
      putCached(key, remote);
      return remote;
    }
    return {
      reply: "My local intelligence is unavailable right now. Start the JARVIS companion and Ollama, then try again.",
      model: "local/offline",
      error: localError.message,
    };
  }
}

function encodeSse(data) {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function wrapOllamaStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer.trim());
              const token = parsed.message?.content;
              if (token) controller.enqueue(encodeSse({ choices: [{ delta: { content: token } }] }));
            } catch {}
          }
          controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          controller.close();
          return;
        }
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const raw = line.trim();
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            const token = parsed.message?.content;
            if (token) controller.enqueue(encodeSse({ choices: [{ delta: { content: token } }] }));
          } catch {}
        }
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      try { reader.cancel(); } catch {}
    },
  });
}

async function localStream(messages, systemPrompt, mode, model) {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${systemPrompt || ""}\nNever expose hidden reasoning. Speak directly and naturally.` },
        ...normalizeMessages(messages),
      ],
      think: false,
      stream: true,
      keep_alive: KEEP_ALIVE,
      options: {
        temperature: mode === "thinking" ? 0.18 : 0.2,
        num_ctx: 4096,
        num_predict: mode === "thinking" ? 520 : 280,
        repeat_penalty: 1.08,
      },
    }),
    signal: AbortSignal.timeout(mode === "thinking" ? 25000 : 16000),
  });
  if (!response.ok || !response.body) throw new Error(`Ollama HTTP ${response.status}`);
  return { stream: wrapOllamaStream(response.body), model: `local/${model}` };
}

async function remoteStream(messages, systemPrompt, specificModel) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!REMOTE_FALLBACK || !apiKey) return null;
  const model = specificModel && specificModel.includes("/") ? specificModel : (process.env.JARVIS_REMOTE_MODEL || "openai/gpt-4o-mini");
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt || "" }, ...normalizeMessages(messages)], max_tokens: 600, temperature: 0.25, stream: true }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || !response.body) return null;
    return { stream: response.body, model };
  } catch {
    return null;
  }
}

export async function chatCompletionStream(messages, systemPrompt, mode = "fast", specificModel = null) {
  const model = specificModel && !specificModel.includes("/") ? specificModel : DEFAULT_MODEL;
  try {
    return await localStream(messages, systemPrompt, mode, model);
  } catch {
    return await remoteStream(messages, systemPrompt, specificModel);
  }
}

export function getAvailableModels() {
  return [DEFAULT_MODEL];
}
