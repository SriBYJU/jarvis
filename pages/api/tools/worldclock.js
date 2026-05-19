const TIMEZONES = [
  { label: "New York", tz: "America/New_York" },
  { label: "London", tz: "Europe/London" },
  { label: "Tokyo", tz: "Asia/Tokyo" },
  { label: "Sydney", tz: "Australia/Sydney" },
  { label: "Dubai", tz: "Asia/Dubai" },
  { label: "Los Angeles", tz: "America/Los_Angeles" },
];

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const now = new Date();
  const clocks = TIMEZONES.map(({ label, tz }) => {
    const time = now.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true });
    const date = now.toLocaleDateString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric" });
    return { label, tz, time, date };
  });

  return res.status(200).json({ type: "worldclock", data: clocks });
}
