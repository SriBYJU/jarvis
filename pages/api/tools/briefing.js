// Daily Briefing — aggregates weather + news + stocks in one call
export default async function handler(req, res) {
  const results = {};
  const weatherKey = process.env.OPENWEATHER_API_KEY;
  const newsKey = process.env.NEWS_API_KEY;
  const finnhubKey = process.env.FINNHUB_API_KEY;

  // Parallel fetch all data sources
  const promises = [];

  // Weather (default to user's general area or New York)
  if (weatherKey) {
    promises.push(
      fetch(`https://api.openweathermap.org/data/2.5/weather?q=New York&appid=${weatherKey}&units=imperial`)
        .then(r => r.json())
        .then(d => { results.weather = { temp: d.main?.temp, desc: d.weather?.[0]?.description, city: d.name, humidity: d.main?.humidity, wind: d.wind?.speed }; })
        .catch(() => { results.weather = null; })
    );
  }

  // Top news
  if (newsKey) {
    promises.push(
      fetch(`https://newsapi.org/v2/top-headlines?country=us&pageSize=5&apiKey=${newsKey}`)
        .then(r => r.json())
        .then(d => { results.news = (d.articles || []).slice(0, 5).map(a => ({ title: a.title, source: a.source?.name, url: a.url })); })
        .catch(() => { results.news = null; })
    );
  }

  // Market snapshot (S&P 500, AAPL, GOOGL)
  if (finnhubKey) {
    const tickers = ["AAPL", "GOOGL", "MSFT"];
    promises.push(
      Promise.all(tickers.map(t =>
        fetch(`https://finnhub.io/api/v1/quote?symbol=${t}&token=${finnhubKey}`)
          .then(r => r.json())
          .then(d => ({ symbol: t, price: d.c, change: d.dp }))
          .catch(() => ({ symbol: t, price: null, change: null }))
      )).then(stocks => { results.stocks = stocks; })
    );
  }

  // Date/time info
  results.datetime = {
    date: new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };

  await Promise.all(promises);

  return res.json({ ok: true, type: "briefing", data: results });
}
