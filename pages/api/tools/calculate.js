export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { expression } = req.body;
  if (!expression) return res.status(400).json({ error: "Expression required" });

  try {
    const sanitized = expression.replace(/[^0-9+\-*/().%^ ]/g, "");
    const withPow = sanitized.replace(/\^/g, "**");

    const fn = new Function("return (" + withPow + ")");
    const result = fn();

    if (typeof result !== "number" || !isFinite(result)) {
      return res.status(400).json({ error: "Invalid expression" });
    }

    return res.status(200).json({
      type: "calculate",
      data: {
        expression: expression.trim(),
        result: Math.round(result * 1e10) / 1e10,
      },
    });
  } catch (e) {
    return res.status(400).json({ error: "Could not evaluate: " + e.message });
  }
}
