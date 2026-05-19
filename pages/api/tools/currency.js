export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { amount, from, to } = req.body;

  try {
    const url = `https://api.frankfurter.app/latest?amount=${amount}&from=${from}&to=${to}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Currency API error: " + resp.status);
    const data = await resp.json();

    const converted = data.rates?.[to];
    if (converted === undefined) throw new Error("Unsupported currency pair");

    return res.status(200).json({
      type: "currency",
      data: {
        amount,
        from,
        to,
        result: converted,
        rate: converted / amount,
        date: data.date,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
