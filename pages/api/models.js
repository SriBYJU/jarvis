import { getAvailableModels } from "../../lib/llm";

export default function handler(req, res) {
  const models = getAvailableModels();
  return res.json({ models });
}
