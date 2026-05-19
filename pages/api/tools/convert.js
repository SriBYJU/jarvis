const CONVERSIONS = {
  "km|mi": (v) => v * 0.621371,
  "km|miles": (v) => v * 0.621371,
  "mi|km": (v) => v * 1.60934,
  "miles|km": (v) => v * 1.60934,
  "km/h|mph": (v) => v * 0.621371,
  "mph|km/h": (v) => v * 1.60934,
  "celsius|fahrenheit": (v) => (v * 9) / 5 + 32,
  "fahrenheit|celsius": (v) => ((v - 32) * 5) / 9,
  "kg|lbs": (v) => v * 2.20462,
  "kg|pounds": (v) => v * 2.20462,
  "lbs|kg": (v) => v / 2.20462,
  "pounds|kg": (v) => v / 2.20462,
  "liters|gallons": (v) => v * 0.264172,
  "litres|gallons": (v) => v * 0.264172,
  "gallons|liters": (v) => v / 0.264172,
  "gal|liters": (v) => v / 0.264172,
  "meters|feet": (v) => v * 3.28084,
  "metres|feet": (v) => v * 3.28084,
  "feet|meters": (v) => v / 3.28084,
  "ft|meters": (v) => v / 3.28084,
  "ft|metres": (v) => v / 3.28084,
  "inches|cm": (v) => v * 2.54,
  "inch|cm": (v) => v * 2.54,
  "in|cm": (v) => v * 2.54,
  "cm|inches": (v) => v / 2.54,
  "centimeters|inches": (v) => v / 2.54,
  "centimetres|inches": (v) => v / 2.54,
  "oz|grams": (v) => v * 28.3495,
  "ounces|grams": (v) => v * 28.3495,
  "grams|oz": (v) => v / 28.3495,
  "g|oz": (v) => v / 28.3495,
  "grams|ounces": (v) => v / 28.3495,
  "g|ounces": (v) => v / 28.3495,
};

function normalize(unit) {
  return unit.replace(/s$/, "").toLowerCase();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { value, from, to } = req.body;

  const key = `${normalize(from)}|${normalize(to)}`;
  const altKey = `${from}|${to}`;
  const converter = CONVERSIONS[key] || CONVERSIONS[altKey] || CONVERSIONS[`${from}|${normalize(to)}`] || CONVERSIONS[`${normalize(from)}|${to}`];

  if (!converter) {
    return res.status(400).json({ error: `Cannot convert ${from} to ${to}` });
  }

  const result = converter(value);
  return res.status(200).json({
    type: "convert",
    data: { value, from, to, result: Math.round(result * 10000) / 10000 },
  });
}
