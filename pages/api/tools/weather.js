export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { location } = req.body;
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "OPENWEATHER_API_KEY not configured" });

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Weather API error: " + resp.status);
    const data = await resp.json();

    return res.status(200).json({
      type: "weather",
      data: {
        city: data.name,
        country: data.sys?.country,
        temp: Math.round(data.main.temp),
        feels_like: Math.round(data.main.feels_like),
        humidity: data.main.humidity,
        wind: data.wind.speed,
        description: data.weather?.[0]?.description || "",
        icon: data.weather?.[0]?.icon || "",
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
