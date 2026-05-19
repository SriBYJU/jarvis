import { addMemory, searchMemories, clearMemories, getMemories } from "../../../lib/store";

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { action, content, query } = req.body;

    if (action === "save") {
      const entry = addMemory(content);
      return res.status(200).json({ type: "memory_save", data: entry });
    }

    if (action === "search") {
      const results = searchMemories(query || "*");
      return res.status(200).json({ type: "memory_query", data: results });
    }

    if (action === "clear") {
      clearMemories();
      return res.status(200).json({ type: "memory_clear", data: { cleared: true } });
    }

    if (action === "list") {
      const all = getMemories();
      return res.status(200).json({ type: "memory_list", data: all });
    }

    return res.status(400).json({ error: "Unknown action: " + action });
  }

  if (req.method === "GET") {
    const all = getMemories();
    return res.status(200).json({ type: "memory_list", data: all });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
