/**
 * store.js — persistent storage via Vercel KV (Redis)
 *
 * Setup (one-time):
 * 1. Vercel dashboard → Storage → Create KV database → link to your project
 * 2. Vercel auto-adds KV_REST_API_URL and KV_REST_API_TOKEN env vars
 * 3. Run: npm install @vercel/kv
 *
 * Falls back to in-memory if KV not configured (data lost on cold start).
 */

let kv = null;

async function getKV() {
  if (kv) return kv;
  try {
    const mod = await import("@vercel/kv");
    kv = mod.kv;
    return kv;
  } catch {
    return null;
  }
}

const memStore = {};

async function readStore(name) {
  const db = await getKV();
  if (db) {
    try {
      const val = await db.get(`jarvis:${name}`);
      return val || [];
    } catch {
      return memStore[name] || [];
    }
  }
  return memStore[name] || [];
}

async function writeStore(name, data) {
  const db = await getKV();
  if (db) {
    try {
      await db.set(`jarvis:${name}`, data);
      return;
    } catch {}
  }
  memStore[name] = data;
}

export async function getMemories() {
  return readStore("memories");
}

export async function addMemory(content) {
  const memories = await readStore("memories");
  const entry = { id: Date.now().toString(), content, createdAt: new Date().toISOString() };
  memories.push(entry);
  await writeStore("memories", memories);
  return entry;
}

export async function searchMemories(query) {
  const memories = await readStore("memories");
  if (query === "*") return memories;
  const q = query.toLowerCase();
  return memories.filter((m) => m.content.toLowerCase().includes(q));
}

export async function clearMemories() {
  await writeStore("memories", []);
}

export async function getReminders() {
  return readStore("reminders");
}

export async function addReminder(reminder) {
  const reminders = await readStore("reminders");
  const entry = { id: Date.now().toString(), ...reminder, createdAt: new Date().toISOString(), fired: false };
  reminders.push(entry);
  await writeStore("reminders", reminders);
  return entry;
}

export async function markReminderFired(id) {
  const reminders = await readStore("reminders");
  const r = reminders.find((r) => r.id === id);
  if (r) r.fired = true;
  await writeStore("reminders", reminders);
}

export async function getActiveReminders() {
  const reminders = await readStore("reminders");
  return reminders.filter((r) => !r.fired);
}

export async function getConversationHistory(userId) {
  const all = await readStore("history");
  const entry = all.find((h) => h.userId === userId);
  return entry ? entry.messages : [];
}

export async function saveConversationHistory(userId, messages) {
  const all = await readStore("history");
  const idx = all.findIndex((h) => h.userId === userId);
  const entry = { userId, messages, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  await writeStore("history", all);
}

export async function getAllSessions(userId) {
  const all = await readStore("sessions");
  return all
    .filter((s) => s.userId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function saveSession(userId, sessionId, messages, title) {
  const all = await readStore("sessions");
  const idx = all.findIndex((s) => s.sessionId === sessionId);
  const entry = {
    userId, sessionId,
    title: title || "Session " + new Date().toLocaleDateString(),
    messages, updatedAt: new Date().toISOString(),
    messageCount: messages.length,
  };
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  await writeStore("sessions", all);
}

export async function getSession(sessionId) {
  const all = await readStore("sessions");
  return all.find((s) => s.sessionId === sessionId) || null;
}

export async function deleteSession(sessionId) {
  const all = await readStore("sessions");
  await writeStore("sessions", all.filter((s) => s.sessionId !== sessionId));
}

export async function getProjects() {
  return readStore("projects");
}

export async function addProject(name, description) {
  const projects = await readStore("projects");
  const entry = {
    id: Date.now().toString(), name, description: description || "",
    notes: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
  projects.push(entry);
  await writeStore("projects", projects);
  return entry;
}

export async function getProject(nameOrId) {
  const projects = await readStore("projects");
  return projects.find(
    (p) => p.id === nameOrId || p.name.toLowerCase() === nameOrId.toLowerCase()
  ) || null;
}

export async function addProjectNote(nameOrId, note) {
  const projects = await readStore("projects");
  const p = projects.find(
    (p) => p.id === nameOrId || p.name.toLowerCase() === nameOrId.toLowerCase()
  );
  if (!p) return null;
  p.notes.push({ content: note, addedAt: new Date().toISOString() });
  p.updatedAt = new Date().toISOString();
  await writeStore("projects", projects);
  return p;
}

export async function getLearningContext(userId) {
  const all = await readStore("learning");
  const entry = all.find((l) => l.userId === userId);
  return entry ? entry.facts : [];
}

export async function addLearningFact(userId, fact) {
  const all = await readStore("learning");
  const idx = all.findIndex((l) => l.userId === userId);
  if (idx >= 0) {
    if (all[idx].facts.length > 50) all[idx].facts = all[idx].facts.slice(-40);
    all[idx].facts.push({ content: fact, learnedAt: new Date().toISOString() });
  } else {
    all.push({ userId, facts: [{ content: fact, learnedAt: new Date().toISOString() }] });
  }
  await writeStore("learning", all);
}
