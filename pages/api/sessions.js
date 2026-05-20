import { getAllSessions, saveSession, getSession, deleteSession } from "../../lib/store";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { userId, sessionId } = req.query;
    if (sessionId) {
      const session = await getSession(sessionId);
      return session ? res.status(200).json(session) : res.status(404).json({ error: "Session not found" });
    }
    if (!userId) return res.status(400).json({ error: "userId required" });
    const sessions = await getAllSessions(userId);
    return res.status(200).json({ sessions });
  }

  if (req.method === "POST") {
    const { userId, sessionId, messages, title } = req.body;
    if (!userId || !sessionId) return res.status(400).json({ error: "userId and sessionId required" });
    await saveSession(userId, sessionId, messages || [], title);
    return res.status(200).json({ saved: true });
  }

  if (req.method === "DELETE") {
    const { sessionId } = req.body || req.query;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    await deleteSession(sessionId);
    return res.status(200).json({ deleted: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
