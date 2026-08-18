const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.JARVIS_MODEL || "qwen3:4b";

export default async function handler(_req, res) {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(1200) });
    if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
    const d = await r.json();
    const installed = (d.models || []).map(m => m.name).filter(Boolean);
    const models = [DEFAULT_MODEL, ...installed.filter(x => x !== DEFAULT_MODEL)];
    return res.status(200).json({ models, local: true, active: DEFAULT_MODEL });
  } catch {
    // Do not advertise old remote models that the local runtime will not actually use.
    return res.status(200).json({ models: [], local: true, active: DEFAULT_MODEL, offline: true });
  }
}
