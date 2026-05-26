import { getConversationHistory, saveConversationHistory } from "../../lib/store";

export default async function handler(req, res) {
  if (req.method === "GET") {
    const { userId } = req.query;
    if (!userId) {
      return res.status(200).json({ users: [] });
    }
    const messages = await getConversationHistory(userId);
    return res.status(200).json({ userId, messages });
  }

  if (req.method === "POST") {
    const { userId, messages } = req.body;
    if (!userId || !messages) return res.status(400).json({ error: "userId and messages required" });
    await saveConversationHistory(userId, messages);
    return res.status(200).json({ saved: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
