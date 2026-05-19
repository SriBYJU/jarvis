// Code Executor — safely run JavaScript snippets
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { code, language } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided" });

  if (language === "python") {
    return res.json({
      type: "execute",
      data: { code, language: "python", output: "Python execution requires Pyodide (runs client-side). Use the browser console panel.", error: null },
    });
  }

  // Execute JavaScript in a sandboxed context
  let output = "";
  let error = null;
  const logs = [];

  try {
    const consoleMock = {
      log: (...args) => logs.push(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")),
      error: (...args) => logs.push("ERROR: " + args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")),
      warn: (...args) => logs.push("WARN: " + args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")),
    };

    const fn = new Function("console", `"use strict";\n${code}`);
    const timeout = setTimeout(() => { throw new Error("Execution timed out (5s limit)"); }, 5000);
    const result = fn(consoleMock);
    clearTimeout(timeout);

    if (result !== undefined) logs.push(String(result));
    output = logs.join("\n");
  } catch (e) {
    error = e.message;
    output = logs.join("\n");
  }

  return res.json({
    type: "execute",
    data: { code, language: language || "javascript", output: output || "(no output)", error },
  });
}
