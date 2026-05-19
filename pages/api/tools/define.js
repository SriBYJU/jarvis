export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { word } = req.body;
  if (!word) return res.status(400).json({ error: "Word required" });

  try {
    const resp = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!resp.ok) return res.status(404).json({ error: "Word not found" });
    const data = await resp.json();
    const entry = data[0];

    const meanings = (entry.meanings || []).slice(0, 3).map(m => ({
      partOfSpeech: m.partOfSpeech,
      definitions: (m.definitions || []).slice(0, 2).map(d => ({
        definition: d.definition,
        example: d.example || "",
      })),
    }));

    return res.status(200).json({
      type: "define",
      data: {
        word: entry.word,
        phonetic: entry.phonetic || entry.phonetics?.[0]?.text || "",
        audio: entry.phonetics?.find(p => p.audio)?.audio || "",
        meanings,
        sourceUrl: entry.sourceUrls?.[0] || "",
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
