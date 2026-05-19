export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "Query required" });

  try {
    const searchUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
    const resp = await fetch(searchUrl, {
      headers: { "User-Agent": "JARVIS/2.0" },
      signal: AbortSignal.timeout(8000),
    });

    if (resp.ok) {
      const data = await resp.json();
      return res.status(200).json({
        type: "wikipedia",
        data: {
          title: data.title,
          extract: data.extract || "",
          description: data.description || "",
          thumbnail: data.thumbnail?.source || "",
          url: data.content_urls?.desktop?.page || "",
        },
      });
    }

    const fallbackUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=1`;
    const fallback = await fetch(fallbackUrl, { signal: AbortSignal.timeout(8000) });
    if (fallback.ok) {
      const fbData = await fallback.json();
      const firstResult = fbData.query?.search?.[0];
      if (firstResult) {
        const pageResp = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstResult.title)}`, {
          headers: { "User-Agent": "JARVIS/2.0" },
        });
        if (pageResp.ok) {
          const pageData = await pageResp.json();
          return res.status(200).json({
            type: "wikipedia",
            data: {
              title: pageData.title,
              extract: pageData.extract || "",
              description: pageData.description || "",
              thumbnail: pageData.thumbnail?.source || "",
              url: pageData.content_urls?.desktop?.page || "",
            },
          });
        }
      }
    }

    return res.status(404).json({ error: "No Wikipedia article found" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
