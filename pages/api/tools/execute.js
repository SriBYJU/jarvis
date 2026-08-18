// Code execution endpoint — intentionally does not execute arbitrary server-side code.
// JavaScript execution is handled explicitly in the browser Code Playground,
// keeping the public/server API from becoming a remote-code-execution surface.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { code, language } = req.body || {};
  if (!code) return res.status(400).json({ error: "No code provided" });

  const lang = String(language || "javascript").toLowerCase();
  return res.status(200).json({
    type: "execute",
    data: {
      code: String(code),
      language: lang,
      output: lang === "python"
        ? "Python execution is client-side only. Open the Code Playground / Pyodide environment to run it."
        : "For safety, server-side arbitrary code execution is disabled. Open JARVIS Code Playground to run this locally in your browser.",
      error: null,
      executionLocation: "client",
      serverExecuted: false,
    },
  });
}
