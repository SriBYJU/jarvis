import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), ".data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name) {
  return path.join(DATA_DIR, name + ".json");
}

function readStore(name) {
  ensureDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return [];
  }
}

function writeStore(name, data) {
  ensureDir();
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2));
}

export function getMemories() {
  return readStore("memories");
}

export function addMemory(content) {
  const memories = readStore("memories");
  const entry = { id: Date.now().toString(), content, createdAt: new Date().toISOString() };
  memories.push(entry);
  writeStore("memories", memories);
  return entry;
}

export function searchMemories(query) {
  const memories = readStore("memories");
  if (query === "*") return memories;
  const q = query.toLowerCase();
  return memories.filter((m) => m.content.toLowerCase().includes(q));
}

export function clearMemories() {
  writeStore("memories", []);
}

export function getReminders() {
  return readStore("reminders");
}

export function addReminder(reminder) {
  const reminders = readStore("reminders");
  const entry = { id: Date.now().toString(), ...reminder, createdAt: new Date().toISOString(), fired: false };
  reminders.push(entry);
  writeStore("reminders", reminders);
  return entry;
}

export function markReminderFired(id) {
  const reminders = readStore("reminders");
  const r = reminders.find((r) => r.id === id);
  if (r) r.fired = true;
  writeStore("reminders", reminders);
}

export function getActiveReminders() {
  return readStore("reminders").filter((r) => !r.fired);
}

export function getConversationHistory(userId) {
  const all = readStore("history");
  const entry = all.find((h) => h.userId === userId);
  return entry ? entry.messages : [];
}

export function saveConversationHistory(userId, messages) {
  const all = readStore("history");
  const idx = all.findIndex((h) => h.userId === userId);
  const entry = { userId, messages, updatedAt: new Date().toISOString() };
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  writeStore("history", all);
}

export function listConversationUsers() {
  return readStore("history").map((h) => ({ userId: h.userId, updatedAt: h.updatedAt, messageCount: h.messages.length }));
}

// Multiple conversation sessions support
export function getAllSessions(userId) {
  const all = readStore("sessions");
  return all.filter((s) => s.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function saveSession(userId, sessionId, messages, title) {
  const all = readStore("sessions");
  const idx = all.findIndex((s) => s.sessionId === sessionId);
  const entry = { userId, sessionId, title: title || "Session " + new Date().toLocaleDateString(), messages, updatedAt: new Date().toISOString(), messageCount: messages.length };
  if (idx >= 0) all[idx] = entry;
  else all.push(entry);
  writeStore("sessions", all);
}

export function getSession(sessionId) {
  const all = readStore("sessions");
  return all.find((s) => s.sessionId === sessionId) || null;
}

export function deleteSession(sessionId) {
  const all = readStore("sessions");
  writeStore("sessions", all.filter((s) => s.sessionId !== sessionId));
}

// Project tracking
export function getProjects() {
  return readStore("projects");
}

export function addProject(name, description) {
  const projects = readStore("projects");
  const entry = { id: Date.now().toString(), name, description: description || "", notes: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  projects.push(entry);
  writeStore("projects", projects);
  return entry;
}

export function getProject(nameOrId) {
  const projects = readStore("projects");
  return projects.find((p) => p.id === nameOrId || p.name.toLowerCase() === nameOrId.toLowerCase()) || null;
}

export function addProjectNote(nameOrId, note) {
  const projects = readStore("projects");
  const p = projects.find((p) => p.id === nameOrId || p.name.toLowerCase() === nameOrId.toLowerCase());
  if (!p) return null;
  p.notes.push({ content: note, addedAt: new Date().toISOString() });
  p.updatedAt = new Date().toISOString();
  writeStore("projects", projects);
  return p;
}

// Learning context: store interaction patterns to make JARVIS smarter
export function getLearningContext(userId) {
  const all = readStore("learning");
  const entry = all.find((l) => l.userId === userId);
  return entry ? entry.facts : [];
}

export function addLearningFact(userId, fact) {
  const all = readStore("learning");
  const idx = all.findIndex((l) => l.userId === userId);
  if (idx >= 0) {
    if (all[idx].facts.length > 50) all[idx].facts = all[idx].facts.slice(-40);
    all[idx].facts.push({ content: fact, learnedAt: new Date().toISOString() });
  } else {
    all.push({ userId, facts: [{ content: fact, learnedAt: new Date().toISOString() }] });
  }
  writeStore("learning", all);
}
