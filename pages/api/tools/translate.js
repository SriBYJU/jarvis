const LANG_CODES = {
  spanish: "es", french: "fr", german: "de", italian: "it", portuguese: "pt",
  russian: "ru", japanese: "ja", chinese: "zh", korean: "ko", arabic: "ar",
  hindi: "hi", dutch: "nl", swedish: "sv", polish: "pl", turkish: "tr",
  thai: "th", vietnamese: "vi", indonesian: "id", greek: "el", hebrew: "he",
  czech: "cs", danish: "da", finnish: "fi", norwegian: "no", romanian: "ro",
};

function resolveLanguage(input) {
  const lower = input.toLowerCase();
  return LANG_CODES[lower] || lower.slice(0, 2);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { text, target } = req.body;
  const targetCode = resolveLanguage(target);

  try {
    const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetCode}`;
    const mmResp = await fetch(mmUrl);
    if (mmResp.ok) {
      const mmData = await mmResp.json();
      if (mmData.responseStatus === 200 && mmData.responseData?.translatedText) {
        return res.status(200).json({
          type: "translate",
          data: {
            original: text,
            translated: mmData.responseData.translatedText,
            source: "en",
            target: targetCode,
            provider: "MyMemory",
          },
        });
      }
    }
  } catch {
    // fall through to LibreTranslate
  }

  const libreMirrors = [
    "https://libretranslate.de",
    "https://translate.argosopentech.com",
    "https://translate.terraprint.co",
  ];

  for (const mirror of libreMirrors) {
    try {
      const ltResp = await fetch(mirror + "/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, source: "en", target: targetCode }),
      });
      if (ltResp.ok) {
        const ltData = await ltResp.json();
        if (ltData.translatedText) {
          return res.status(200).json({
            type: "translate",
            data: {
              original: text,
              translated: ltData.translatedText,
              source: "en",
              target: targetCode,
              provider: "LibreTranslate",
            },
          });
        }
      }
    } catch {
      continue;
    }
  }

  return res.status(500).json({ error: "Translation services unavailable" });
}
