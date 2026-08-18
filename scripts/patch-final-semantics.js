const fs = require('fs');

function edit(path, mutate) {
  const before = fs.readFileSync(path, 'utf8');
  const after = mutate(before);
  if (after !== before) {
    fs.writeFileSync(path, after, 'utf8');
    console.log(`updated ${path}`);
    return true;
  }
  console.log(`${path} already current`);
  return false;
}

let changed = false;

changed = edit('components/JarvisRuntimeFinal.js', source => {
  const old = "body: JSON.stringify({ message: text, messages: body.messages || [], mode: body.mode, scene: currentScene() })";
  const next = "body: JSON.stringify({ message: text, messages: body.messages || [], mode: body.mode || 'fast', model: body.model || null, scene: currentScene() })";
  if (source.includes(old)) source = source.replace(old, next);
  if (!source.includes("model: body.model || null")) throw new Error('Runtime model forwarding patch did not apply');
  return source;
}) || changed;

changed = edit('companion/realtime-final-server.js', source => {
  source = source.replace(
    "async function callOllama(messages, scene, agent = false) {",
    "async function callOllama(messages, scene, agent = false, requestedModel = null, mode = 'fast') {\n  const requested = String(requestedModel || '').trim();\n  const model = /^[a-z0-9._:/-]{1,120}$/i.test(requested) ? requested : MODEL;\n  const deep = mode === 'thinking';"
  );
  source = source.replace(
    "body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: system }, ...messages.slice(-10)], tools: [HUD_TOOL, CORE_TOOL], think: false, stream: false, keep_alive: KEEP_ALIVE, options: { temperature: agent ? .1 : .16, num_ctx: 4096, num_predict: agent ? 260 : 180, repeat_penalty: 1.08 } }),\n    signal: AbortSignal.timeout(agent ? 22000 : 14000),",
    "body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, ...messages.slice(-10)], tools: [HUD_TOOL, CORE_TOOL], think: false, stream: false, keep_alive: KEEP_ALIVE, options: { temperature: agent ? .1 : deep ? .12 : .16, num_ctx: 4096, num_predict: agent ? 300 : deep ? 420 : 180, repeat_penalty: 1.08 } }),\n    signal: AbortSignal.timeout(agent ? 24000 : deep ? 22000 : 14000),"
  );
  source = source.replace(
    "async function runConversation(text, history, scene, maxSteps = 3, agent = false) {",
    "async function runConversation(text, history, scene, maxSteps = 3, agent = false, requestedModel = null, mode = 'fast') {"
  );
  source = source.replace(
    "const response = await callOllama(messages, scene, agent);",
    "const response = await callOllama(messages, scene, agent, requestedModel, mode);"
  );
  source = source.replace(
    "const result = await runConversation(text, req.body?.messages || [], req.body?.scene || {}, 3, false);",
    "const result = await runConversation(text, req.body?.messages || [], req.body?.scene || {}, 3, false, req.body?.model || null, req.body?.mode || 'fast');"
  );
  source = source.replace(
    "const result = await runConversation(message, req.body?.messages || [], req.body?.scene || {}, 5, true);",
    "const result = await runConversation(message, req.body?.messages || [], req.body?.scene || {}, 5, true, req.body?.model || null, req.body?.mode || 'thinking');"
  );
  if (!source.includes("const deep = mode === 'thinking';") || !source.includes("req.body?.model || null")) {
    throw new Error('Realtime model/mode semantics patch did not apply');
  }
  return source;
}) || changed;

changed = edit('pages/api/chat.js', source => {
  const marker = '  // Learn from message\n';
  const guard = `  // Do not hallucinate current/live tool results when an optional external data source is not configured.\n  if (!toolResult && ["youtube", "stock", "news", "websearch"].includes(intent)) {\n    const labels = { youtube: "YouTube search", stock: "Live stock data", news: "Live news", websearch: "Web search" };\n    const reply = \`${'${labels[intent]}'} is not configured on this route yet. I won't guess or invent live results.\`;\n    return res.status(200).json({ reply, tool: null, model: "tool/unavailable" });\n  }\n\n`;
  if (!source.includes('I won\'t guess or invent live results')) {
    if (!source.includes(marker)) throw new Error('chat live-data guard insertion point not found');
    source = source.replace(marker, guard + marker);
  }
  return source;
}) || changed;

if (!changed) console.log('All final semantics patches were already applied');
