import { getAvailableModels } from "../../lib/llm";

export default function handler(req, res) {
  return res.status(200).json({ models: getAvailableModels() });
}
