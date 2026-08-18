import fs from "fs";
import path from "path";
import os from "os";

/**
 * JARVIS storage
 *
 * The old implementation used async Vercel KV calls while several callers
 * treated these functions as synchronous. That caused memory/project/reminder
 * paths to receive Promises instead of real values. JARVIS is local-first, so
 * this store is intentionally synchronous and persists to the local JARVIS
 * data directory. If the filesystem is unavailable (for example, a restricted
 * serverless runtime), it safely falls back to process memory.
 */

const memoryFallback = {};
let loaded = false;
let state = {};

function storePath() {
  const root = process.env.JARVIS_DATA_DIR || path.join(os.homedir(), ".jarvis");
  return path.join(root, "web-store.json");
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const file = storePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    state = memoryFallback;
  }
}

function persist() {
  try {
    const file = storePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch {
    Object.keys(memoryFallback).forEach(k => delete memoryFallback[k]);
    Object.assign(memoryFallback, state);
  }
}

function readStore(name) {
  load();
  const value = state[name];
  return Array.isArray(value) ? value : [];
}

function writeStore(name, data) {
  load();
  state[name] = data;
  persist();
}

export function getMemories() {
  return readStore("memories");
}

export function addMemory(content) {
  const memories = [...readStore("memories")];
  const entry = { id: Date.now().toString(), content: String(content || ""), createdAt: new Date().toISOString() };
  memories.push(entry);
  writeStore("memories", memories.slice(-1000));
  return entry;
}

export function searchMemories(query) {
  const memories = readStore("memories");
  if (!query || query === "*") return memories;
  const q = String(query).toLowerCase();
  return memories.filter(m => String(m.content || "").toLowerCase().includes(q));
}

export function clearMemories() {
  writeStore("memories", []);
}

export function getReminders() {
  return readStore("reminders");
}

export function addReminder(reminder) {
  const reminders = [...readStore("reminders")];
  const entry = { id: Date.now().toString(), ...reminder, createdAt: new Date().toISOString(), fired: false };
  reminders.push(entry);
  writeStore("reminders", reminders);
  return entry;
}

export function markReminderFired(id) {
  const reminders = readStore("reminders").map(r => r.id === id ? { ...r, fired: true } : r);
  writeStore("reminders", reminders);
}

export function getActiveReminders() {
  return readStore("reminders").filter(r => !r.fired);
}

export function getConversationHistory(userId) {
  const entry = readStore("history").find(h => h.userId === userId);
  return entry ? entry.messages : [];
}

export function saveConversationHistory(userId, messages) {
  const all = [...readStore("history")];
  const idx = all.findIndex(h => h.userId === userId);
  const entry = { userId, messages, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = entry; else all.push(entry);
  writeStore("history", all);
}

export function getAllSessions(userId) {
  return readStore("sessions")
    .filter(s => s.userId === userId)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function saveSession(userId, sessionId, messages, title) {
  const all = [...readStore("sessions")];
  const idx = all.findIndex(s => s.sessionId === sessionId);
  const entry = {
    userId,
    sessionId,
    title: title || `Session ${new Date().toLocaleDateString()}`,
    messages,
    updatedAt: new Date().toISOString(),
    messageCount: messages.length,
  };
  if (idx >= 0) all[idx] = entry; else all.push(entry);
  writeStore("sessions", all.slice(-500));
}

export function getSession(sessionId) {
  return readStore("sessions").find(s => s.sessionId === sessionId) || null;
}

export function deleteSession(sessionId) {
  writeStore("sessions", readStore("sessions").filter(s => s.sessionId !== sessionId));
}

export function getProjects() {
  return readStore("projects");
}

export function addProject(name, description) {
  const projects = [...readStore("projects")];
  const entry = {
    id: Date.now().toString(),
    name: String(name || "Untitled Project"),
    description: description || "",
    notes: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  projects.push(entry);
  writeStore("projects", projects);
  return entry;
}

export function getProject(nameOrId) {
  const needle = String(nameOrId || "").toLowerCase();
  return readStore("projects").find(p => p.id === nameOrId || String(p.name || "").toLowerCase() === needle) || null;
}

export function addProjectNote(nameOrId, note) {
  const projects = [...readStore("projects")];
  const needle = String(nameOrId || "").toLowerCase();
  const idx = projects.findIndex(p => p.id === nameOrId || String(p.name || "").toLowerCase() === needle);
  if (idx < 0) return null;
  const current = projects[idx];
  const updated = {
    ...current,
    notes: [...(current.notes || []), { content: String(note || ""), addedAt: new Date().toISOString() }],
    updatedAt: new Date().toISOString(),
  };
  projects[idx] = updated;
  writeStore("projects", projects);
  return updated;
}

export function getLearningContext(userId) {
  const entry = readStore("learning").find(l => l.userId === userId);
  return entry ? entry.facts : [];
}

export function addLearningFact(userId, fact) {
  const all = [...readStore("learning")];
  const idx = all.findIndex(l => l.userId === userId);
  const item = { content: String(fact || ""), learnedAt: new Date().toISOString() };
  if (idx >= 0) {
    const existing = (all[idx].facts || []).filter(x => x.content !== item.content).slice(-49);
    all[idx] = { ...all[idx], facts: [...existing, item] };
  } else {
    all.push({ userId, facts: [item] });
  }
  writeStore("learning", all);
  return item;
}
