export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query } = req.body;
  const apiKey = process.env.GOOGLE_API_KEY || process.env.YOUTUBE_API_KEY;
  const cseId = process.env.GOOGLE_CSE_ID;

  if (!apiKey || !cseId) {
    return res.status(500).json({ error: "Google API key or CSE ID not configured" });
  }

  try {
    const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${apiKey}&cx=${cseId}&num=5`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Google CSE error: " + resp.status);
    const data = await resp.json();

    const results = (data.items || []).map((item) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet || "",
      image: item.pagemap?.cse_thumbnail?.[0]?.src || item.pagemap?.cse_image?.[0]?.src || "",
    }));

    return res.status(200).json({ type: "websearch", data: results });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
