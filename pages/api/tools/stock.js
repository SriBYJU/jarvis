export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { symbol } = req.body;
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "FINNHUB_API_KEY not configured" });

  try {
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;

    const [quoteResp, profileResp] = await Promise.all([fetch(quoteUrl), fetch(profileUrl)]);

    if (!quoteResp.ok) throw new Error("Finnhub quote error: " + quoteResp.status);
    const quote = await quoteResp.json();
    const profile = profileResp.ok ? await profileResp.json() : {};

    if (!quote.c) throw new Error("No data found for symbol: " + symbol);

    return res.status(200).json({
      type: "stock",
      data: {
        symbol: symbol.toUpperCase(),
        name: profile.name || symbol,
        price: quote.c,
        change: quote.d,
        changePercent: quote.dp,
        high: quote.h,
        low: quote.l,
        open: quote.o,
        previousClose: quote.pc,
        industry: profile.finnhubIndustry || "",
        logo: profile.logo || "",
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
