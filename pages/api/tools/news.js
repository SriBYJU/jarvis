export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query } = req.body;
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "NEWS_API_KEY not configured" });

  try {
    let url;
    if (!query || query === "top") {
      url = `https://newsapi.org/v2/top-headlines?country=us&pageSize=5&apiKey=${apiKey}`;
    } else {
      url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&pageSize=5&sortBy=publishedAt&apiKey=${apiKey}`;
    }

    const resp = await fetch(url);
    if (!resp.ok) throw new Error("News API error: " + resp.status);
    const data = await resp.json();

    const articles = (data.articles || []).map((a) => ({
      title: a.title,
      source: a.source?.name || "",
      url: a.url,
      publishedAt: a.publishedAt,
      description: a.description || "",
      image: a.urlToImage || "",
    }));

    return res.status(200).json({ type: "news", data: articles });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
