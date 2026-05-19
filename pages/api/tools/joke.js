export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const resp = await fetch("https://official-joke-api.appspot.com/random_joke");
    if (!resp.ok) throw new Error("Joke API error");
    const data = await resp.json();
    return res.status(200).json({
      type: "joke",
      data: { setup: data.setup, punchline: data.punchline, id: data.id },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
