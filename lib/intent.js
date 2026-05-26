const INTENT_PATTERNS = {
  weather: {
    regex: /(?:weather|temperature|forecast|rain|snow|humid|(?:how(?:'s|\s+is)\s+(?:the\s+)?(?:weather|temperature))|(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:weather|temperature|forecast))|(?:(?:is\s+it|gonna|going\s+to)\s+(?:rain|snow))|(?:(?:hot|cold|warm|chilly|freezing)\s+(?:in|outside))).*?(?:in|at|for|of|outside|around|near)?\s*(.+)?/i,
    extract: (msg) => {
      // Try to extract location from various conversational patterns
      const patterns = [
        /(?:weather|temperature|forecast|rain|snow|humid)\s+(?:in|at|for|of|around|near)\s+(.+)/i,
        /(?:how(?:'s|\s+is)\s+(?:the\s+)?(?:weather|temperature))\s+(?:in|at|for|around|near|over\s+in|looking\s+(?:like\s+)?in)\s+(.+)/i,
        /(?:what(?:'s|\s+is)\s+(?:the\s+)?(?:weather|temperature|forecast))\s+(?:in|at|for|around|near|over\s+in|looking\s+like\s+in|gonna\s+be\s+(?:like\s+)?in)\s+(.+)/i,
        /(?:(?:is\s+it|gonna|going\s+to)\s+(?:rain|snow))\s+(?:in|at|around|near)\s+(.+)/i,
        /(?:hot|cold|warm|chilly|freezing)\s+(?:in|outside\s+in|over\s+in)\s+(.+)/i,
      ];
      for (const p of patterns) {
        const m = msg.match(p);
        if (m && m[1]) return m[1].replace(/[?.!]+$/, '').trim();
      }
      return null;
    },
  },
  map: {
    regex: /(?:(?:show\s+(?:me\s+)?(?:a\s+)?)?map\s+(?:of\s+)?|where\s+is\s+|location\s+of\s+|navigate\s+to\s+|directions\s+to\s+)(.+)/i,
    extract: (msg) => {
      const m = msg.match(/(?:(?:show\s+(?:me\s+)?(?:a\s+)?)?map\s+(?:of\s+)?|where\s+is\s+|location\s+of\s+|navigate\s+to\s+|directions\s+to\s+)(.+)/i);
      return m ? m[1].replace(/^(a |the |an )/i, "").trim() : null;
    },
  },
  youtube: {
    regex: /(?:youtube|play\s+(?:a\s+)?video|watch|video\s+of|play\s+me|find\s+(?:me\s+)?(?:a\s+)?video|show\s+(?:me\s+)?(?:a\s+)?video|can\s+you\s+(?:play|find)\s+(?:a\s+)?video)\s+(.+)/i,
    extract: (msg) => {
      const m = msg.match(/(?:youtube|play\s+(?:a\s+)?video\s+(?:of\s+|about\s+)?|watch\s+|video\s+of\s+|play\s+me\s+|find\s+(?:me\s+)?(?:a\s+)?video\s+(?:of\s+|about\s+|on\s+)?|show\s+(?:me\s+)?(?:a\s+)?video\s+(?:of\s+|about\s+|on\s+)?|can\s+you\s+(?:play|find)\s+(?:a\s+)?video\s+(?:of\s+|about\s+|on\s+)?)(.+)/i);
      return m ? m[1].replace(/[?.!]+$/, '').trim() : null;
    },
  },
  timer: {
    regex: /(?:set\s+(?:a\s+)?timer|countdown|timer)\s+(?:for\s+)?(\d+)\s*(second|minute|hour|min|sec|hr)/i,
    extract: (msg) => {
      const m = msg.match(/(\d+)\s*(second|minute|hour|min|sec|hr)s?/i);
      if (!m) return null;
      const val = parseInt(m[1]);
      const unit = m[2].toLowerCase();
      if (unit.startsWith("h")) return val * 3600;
      if (unit.startsWith("m")) return val * 60;
      return val;
    },
  },
  reminder: {
    regex: /(?:remind\s+me|set\s+(?:a\s+)?reminder|alert\s+me)\s+(?:to\s+|at\s+|in\s+)?(.+)/i,
    extract: (msg) => {
      const atMatch = msg.match(/(?:remind\s+me|reminder|alert\s+me)\s+(?:at\s+)(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s+(?:to\s+)?(.+)/i);
      if (atMatch) return { time: atMatch[1].trim(), task: atMatch[2].trim(), type: "absolute" };
      const inMatch = msg.match(/(?:remind\s+me|reminder|alert\s+me)\s+(?:in\s+)(\d+)\s*(second|minute|hour|min|sec|hr)s?\s+(?:to\s+)?(.+)/i);
      if (inMatch) {
        const val = parseInt(inMatch[1]);
        const unit = inMatch[2].toLowerCase();
        let secs = unit.startsWith("h") ? val * 3600 : unit.startsWith("m") ? val * 60 : val;
        return { seconds: secs, task: inMatch[3].trim(), type: "relative" };
      }
      const toMatch = msg.match(/(?:remind\s+me|reminder|alert\s+me)\s+(?:to\s+)(.+)/i);
      if (toMatch) return { task: toMatch[1].trim(), type: "immediate" };
      return null;
    },
  },
  translate: {
    regex: /(?:translate|say\s+in|how\s+do\s+you\s+say)\s+(.+)/i,
    extract: (msg) => {
      const m = msg.match(/translate\s+["""]?(.+?)["""]?\s+(?:to|into)\s+(\w+)/i);
      if (m) return { text: m[1], target: m[2] };
      const m2 = msg.match(/(?:say|how\s+do\s+you\s+say)\s+["""]?(.+?)["""]?\s+in\s+(\w+)/i);
      if (m2) return { text: m2[1], target: m2[2] };
      return null;
    },
  },
  currency: {
    regex: /(?:convert\s+)?(\d+(?:\.\d+)?)\s*([a-zA-Z]{3})\s+(?:to|in|into)\s+([a-zA-Z]{3})/i,
    extract: (msg) => {
      const m = msg.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]{3})\s+(?:to|in|into)\s+([a-zA-Z]{3})/i);
      if (m) return { amount: parseFloat(m[1]), from: m[2].toUpperCase(), to: m[3].toUpperCase() };
      return null;
    },
  },
  convert: {
    regex: /(\d+(?:\.\d+)?)\s*(km\/h|mph|km|mi|miles|celsius|fahrenheit|kg|pounds|lbs|liters|litres|gallons|gal|meters|metres|feet|ft|inches|inch|in|cm|centimeters|centimetres|oz|ounces|grams|g)\s+(?:to|in|into)\s+(\w+(?:\/\w+)?)/i,
    extract: (msg) => {
      const m = msg.match(/(\d+(?:\.\d+)?)\s*(km\/h|mph|km|mi|miles?|celsius|fahrenheit|kg|pounds?|lbs?|liters?|litres?|gallons?|gal|meters?|metres?|feet|ft|inch(?:es)?|in|cm|centimeters?|centimetres?|oz|ounces?|grams?|g)\s+(?:to|in|into)\s+(\w+(?:\/\w+)?)/i);
      if (m) return { value: parseFloat(m[1]), from: m[2].toLowerCase(), to: m[3].toLowerCase() };
      return null;
    },
  },
  worldclock: {
    regex: /(?:world\s+clocks?|time\s+in|what\s+time|current\s+time|what\s+time\s+is\s+it\s+(?:in|over\s+in|right\s+now\s+in)|do\s+you\s+know\s+(?:the|what)\s+time\s+(?:in|is))/i,
    extract: (msg) => {
      const patterns = [
        /(?:time|what\s+time\s+is\s+it)\s+(?:in|over\s+in|right\s+now\s+in)\s+(.+)/i,
        /what\s+time\s+is\s+it\s+(?:in|over\s+in)\s+(.+)/i,
      ];
      for (const p of patterns) {
        const m = msg.match(p);
        if (m && m[1]) return m[1].replace(/[?.!]+$/, '').trim();
      }
      return "world";
    },
  },
  joke: {
    regex: /(?:joke|tell\s+me\s+a\s+joke|make\s+me\s+laugh|something\s+funny|know\s+any\s+(?:good\s+)?jokes|got\s+a\s+joke|cheer\s+me\s+up|anything\s+funny|say\s+something\s+funny|feeling\s+down.*joke|make\s+me\s+(?:smile|laugh|chuckle))/i,
    extract: () => true,
  },
  memory_save: {
    regex: /^remember\s+(?:that\s+)?(.+)/i,
    extract: (msg) => {
      const m = msg.match(/^remember\s+(?:that\s+)?(.+)/i);
      return m ? m[1].trim() : null;
    },
  },
  memory_query: {
    regex: /(?:what\s+did\s+i\s+(?:say|tell)|what\s+do\s+you\s+remember|recall)\s*(?:about\s+)?(.+)?/i,
    extract: (msg) => {
      const m = msg.match(/(?:what\s+did\s+i\s+(?:say|tell)|what\s+do\s+you\s+remember|recall)\s*(?:about\s+)?(.+)?/i);
      return m ? (m[1] || "").trim() || "*" : "*";
    },
  },
  memory_clear: {
    regex: /(?:forget\s+everything|clear\s+(?:my\s+)?memory|erase\s+(?:my\s+)?memory|forget\s+all)/i,
    extract: () => true,
  },
  code: {
    regex: /(?:write\s+(?:a\s+)?(?:code|function|program|script)|code\s+to|function\s+that|script\s+that)/i,
    extract: (msg) => msg,
  },
  stock: {
    regex: /(?:stock|share\s+price|ticker|stock\s+price|market\s+price|how(?:'s|\s+is)\s+(?:\w+\s+)?(?:stock|doing\s+(?:in|on)\s+the\s+(?:stock|market))|check\s+(?:the\s+)?(?:stock|market)|what(?:'s|\s+is)\s+(?:\w+\s+)?(?:stock|trading\s+at|share\s+price))\s*(?:of\s+|for\s+|on\s+)?(.+)?/i,
    extract: (msg) => {
      const patterns = [
        /(?:stock|share\s+price|ticker|stock\s+price|market\s+price)\s+(?:of\s+|for\s+)?(.+)/i,
        /how(?:'s|\s+is)\s+(\w+)\s+(?:stock|doing\s+(?:in|on)\s+the\s+(?:stock|market))/i,
        /check\s+(?:the\s+)?(?:stock|stocks)\s+(?:on\s+|for\s+|of\s+)?(\w+)/i,
        /what(?:'s|\s+is)\s+(\w+)\s+(?:stock|trading\s+at|share\s+price)/i,
        /how\s+is\s+(\w+)\s+doing/i,
      ];
      for (const p of patterns) {
        const m = msg.match(p);
        if (m && m[1]) return m[1].trim().toUpperCase();
      }
      return null;
    },
  },
  websearch: {
    regex: /(?:search\s+(?:for\s+)?|google\s+|look\s+up\s+|find\s+(?:me\s+)?(?:info\s+(?:on|about)\s+)?|research\s+)(.+)/i,
    extract: (msg) => {
      const m = msg.match(/(?:search\s+(?:for\s+)?|google\s+|look\s+up\s+|find\s+(?:me\s+)?(?:info\s+(?:on|about)\s+)?|research\s+)(.+)/i);
      return m ? m[1].trim() : null;
    },
  },
  browse: {
    regex: /(?:browse|open|go\s+to|visit|fetch)\s+(https?:\/\/\S+)/i,
    extract: (msg) => {
      const m = msg.match(/(?:browse|open|go\s+to|visit|fetch)\s+(https?:\/\/\S+)/i);
      return m ? m[1].trim() : null;
    },
  },
  news: {
    regex: /(?:news|headlines|latest\s+news|top\s+stories|breaking\s+news|what(?:'s|\s+is)\s+(?:going\s+on|happening)\s+(?:in\s+(?:the\s+)?(?:news|world))?|catch\s+me\s+up|(?:pull\s+up|show\s+me|get\s+me)\s+(?:some\s+|the\s+)?news|any\s+(?:new\s+)?(?:news|headlines))\s*(?:about\s+|on\s+|for\s+|around\s+|in\s+|near\s+)?(.+)?/i,
    extract: (msg) => {
      const patterns = [
        /(?:news|headlines)\s*(?:about\s+|on\s+|for\s+|around\s+|in\s+|near\s+)(.+)/i,
        /what(?:'s|\s+is)\s+(?:going\s+on|happening)\s+(?:in|around|near)\s+(.+)/i,
        /(?:pull\s+up|show\s+me|get\s+me)\s+(?:some\s+|the\s+)?news\s+(?:about\s+|on\s+|for\s+|around\s+|in\s+|near\s+)(.+)/i,
      ];
      for (const p of patterns) {
        const m = msg.match(p);
        if (m && m[1]) return m[1].replace(/[?.!]+$/, '').trim();
      }
      return "top";
    },
  },
  image: {
    regex: /(?:generate\s+(?:an?\s+)?image|create\s+(?:an?\s+)?image|draw\s+|imagine\s+|picture\s+of\s+|image\s+of\s+)(.+)/i,
    extract: (msg) => {
      const m = msg.match(/(?:generate\s+(?:an?\s+)?image\s+(?:of\s+)?|create\s+(?:an?\s+)?image\s+(?:of\s+)?|draw\s+|imagine\s+|picture\s+of\s+|image\s+of\s+)(.+)/i);
      return m ? m[1].trim() : null;
    },
  },
  wikipedia: {
    regex: /(?:wiki(?:pedia)?\s+|tell\s+me\s+about\s+|what\s+is\s+(?:a\s+|an\s+|the\s+)?)(.{3,})/i,
    extract: (msg) => {
      const wikiMatch = msg.match(/wiki(?:pedia)?\s+(.+)/i);
      if (wikiMatch) return wikiMatch[1].trim();
      const tellMatch = msg.match(/tell\s+me\s+about\s+(.+)/i);
      if (tellMatch) return tellMatch[1].trim();
      return null;
    },
  },
  calculate: {
    regex: /(?:calculate|calc|compute|math|eval(?:uate)?|what\s+is)\s+([\d\s+\-*/().^%]+)/i,
    extract: (msg) => {
      const m = msg.match(/(?:calculate|calc|compute|math|eval(?:uate)?|what\s+is)\s+([\d\s+\-*/().^%]+)/i);
      return m ? m[1].trim() : null;
    },
  },
  define: {
    regex: /(?:define|definition\s+of|meaning\s+of|what\s+does\s+\w+\s+mean)\s+(.+)/i,
    extract: (msg) => {
      const m = msg.match(/(?:define|definition\s+of|meaning\s+of)\s+(.+)/i);
      if (m) return m[1].trim();
      const m2 = msg.match(/what\s+does\s+(\w+)\s+mean/i);
      if (m2) return m2[1].trim();
      return null;
    },
  },
  qrcode: {
    regex: /(?:qr\s*code|generate\s+(?:a\s+)?qr)\s+(?:for\s+|of\s+)?(.+)/i,
    extract: (msg) => {
      const m = msg.match(/(?:qr\s*code|generate\s+(?:a\s+)?qr)\s+(?:for\s+|of\s+)?(.+)/i);
      return m ? m[1].trim() : null;
    },
  },
  project_start: {
    regex: /(?:start|create|begin|new)\s+(?:a\s+)?project\s+(?:called\s+|named\s+)?(.+)/i,
    extract: (msg) => {
      const m = msg.match(/(?:start|create|begin|new)\s+(?:a\s+)?project\s+(?:called\s+|named\s+)?(.+)/i);
      return m ? m[1].trim() : null;
    },
  },
  project_list: {
    regex: /(?:show|list|display|my)\s+(?:my\s+)?projects?/i,
    extract: () => true,
  },
  project_open: {
    regex: /(?:open|load|resume|pull\s+up)\s+(?:the\s+)?project\s+(.+)/i,
    extract: (msg) => {
      const m = msg.match(/(?:open|load|resume|pull\s+up)\s+(?:the\s+)?project\s+(.+)/i);
      return m ? m[1].trim() : null;
    },
  },
  vision: {
    regex: /(?:camera|look\s+at|what(?:'s|\s+is)\s+this|scan|identify|what\s+(?:am\s+i|do\s+you\s+see)|show\s+you|analyze\s+(?:this|what)|take\s+a\s+(?:photo|picture|look))/i,
    extract: (msg) => msg,
  },
  execute: {
    regex: /(?:run\s+(?:this\s+)?(?:code|script)|execute\s+(?:this\s+)?(?:code|script)?|eval\s+)/i,
    extract: (msg) => {
      const codeBlock = msg.match(/```(?:\w+)?\n?([\s\S]+?)```/);
      if (codeBlock) return codeBlock[1].trim();
      const afterRun = msg.match(/(?:run|execute|eval)\s+(?:this\s+)?(?:code|script)?:?\s*(.+)/is);
      if (afterRun) return afterRun[1].trim();
      return msg;
    },
  },
  screenshot: {
    regex: /(?:analyze\s+(?:this\s+)?(?:url|page|site|website)|read\s+(?:this\s+)?(?:page|site|url|website)|summarize\s+(?:this\s+)?(?:page|site|url|website)|what(?:'s|\s+is)\s+on\s+(?:this\s+)?(?:page|site|website))\s*/i,
    extract: (msg) => {
      const m = msg.match(/https?:\/\/\S+/i);
      return m ? m[0].trim() : null;
    },
  },
  gallery: {
    regex: /(?:(?:generate|create|make)\s+(?:\d+|multiple|several|a\s+(?:few|bunch|gallery|set)\s+(?:of\s+)?)\s*(?:images?|pictures?|art)|art\s+gallery|image\s+gallery)\s*(?:of\s+)?(.+)?/i,
    extract: (msg) => {
      const m = msg.match(/(?:(?:generate|create|make)\s+(?:\d+|multiple|several|a\s+(?:few|bunch|gallery|set)\s+(?:of\s+)?)\s*(?:images?|pictures?|art)|art\s+gallery|image\s+gallery)\s*(?:of\s+)?(.+)?/i);
      const countMatch = msg.match(/(\d+)\s*(?:images?|pictures?)/i);
      return { prompt: m?.[1]?.trim() || "abstract art", count: countMatch ? parseInt(countMatch[1]) : 4 };
    },
  },
  nutrition: {
    regex: /(?:calories|nutrition|macros|protein|carbs|fat)\s+(?:in|of|for)\s+(.+)|(?:i\s+(?:had|ate|just\s+ate|just\s+had|eaten))\s+(.+)|(?:how\s+(?:many|much)\s+calories)\s+(?:in|does)\s+(.+)|(?:track|log)\s+(?:my\s+)?(?:meal|food|what\s+i\s+ate)\s*(.+)?/i,
    extract: (msg) => {
      const patterns = [
        /(?:calories|nutrition|macros|protein|carbs|fat)\s+(?:in|of|for)\s+(.+)/i,
        /(?:i\s+(?:had|ate|just\s+ate|just\s+had|eaten))\s+(?:a\s+|an\s+|some\s+)?(.+?)\s*(?:for\s+(?:breakfast|lunch|dinner|a\s+snack))?\s*$/i,
        /(?:how\s+(?:many|much)\s+calories)\s+(?:in|does)\s+(.+)/i,
        /(?:track|log)\s+(?:my\s+)?(?:meal|food)\s+(.+)/i,
      ];
      for (const p of patterns) {
        const m = msg.match(p);
        if (m) { const val = (m[1] || m[2] || "").trim(); if (val) return val; }
      }
      return null;
    },
  },
  briefing: {
    regex: /(?:good\s+morning|daily\s+briefing|morning\s+briefing|brief\s+me|catch\s+me\s+up\s+on\s+everything|what(?:'s|\s+is)\s+my\s+(?:daily|morning)\s+(?:brief|update|summary)|start\s+my\s+day|what\s+did\s+i\s+miss)/i,
    extract: () => true,
  },
  screen_share: {
    regex: /(?:share\s+(?:my\s+)?screen|screen\s*share|analyze\s+my\s+screen|look\s+at\s+my\s+screen|what(?:'s|\s+is)\s+on\s+my\s+screen|see\s+my\s+screen|capture\s+(?:my\s+)?screen)/i,
    extract: () => true,
  },
};

// Higher-priority keyword signals that override ambiguous matches
const NEWS_SIGNALS = ["news", "headlines", "stories", "breaking", "latest news", "local news", "top stories", "what's happening", "what is happening", "what's going on", "what is going on", "catch me up", "any news"];
const WEATHER_SIGNALS = ["weather", "temperature", "forecast", "humid", "rain chance", "snow", "how's the weather", "how is the weather", "what's the weather", "what is the weather", "is it hot", "is it cold", "is it gonna rain", "is it going to rain"];
const MAP_ONLY_SIGNALS = ["map of", "show me map", "where is", "location of", "navigate to", "directions to"];

function hasSignal(msg, signals) {
  return signals.some(s => msg.includes(s));
}

export function detectIntent(message) {
  const msg = message.toLowerCase().trim();

  // Exact/high-confidence intents first
  if (INTENT_PATTERNS.memory_clear.regex.test(msg)) {
    return { intent: "memory_clear", data: true };
  }
  if (INTENT_PATTERNS.memory_save.regex.test(msg)) {
    return { intent: "memory_save", data: INTENT_PATTERNS.memory_save.extract(msg) };
  }
  if (INTENT_PATTERNS.memory_query.regex.test(msg)) {
    return { intent: "memory_query", data: INTENT_PATTERNS.memory_query.extract(msg) };
  }
  if (INTENT_PATTERNS.project_list.regex.test(msg)) {
    return { intent: "project_list", data: true };
  }
  if (INTENT_PATTERNS.project_start.regex.test(msg)) {
    return { intent: "project_start", data: INTENT_PATTERNS.project_start.extract(msg) };
  }
  if (INTENT_PATTERNS.project_open.regex.test(msg)) {
    return { intent: "project_open", data: INTENT_PATTERNS.project_open.extract(msg) };
  }
  if (INTENT_PATTERNS.reminder.regex.test(msg)) {
    return { intent: "reminder", data: INTENT_PATTERNS.reminder.extract(msg) };
  }
  if (INTENT_PATTERNS.timer.regex.test(msg)) {
    return { intent: "timer", data: INTENT_PATTERNS.timer.extract(msg) };
  }
  if (INTENT_PATTERNS.qrcode.regex.test(msg)) {
    return { intent: "qrcode", data: INTENT_PATTERNS.qrcode.extract(msg) };
  }
  if (INTENT_PATTERNS.define.regex.test(msg) && !hasSignal(msg, NEWS_SIGNALS)) {
    const data = INTENT_PATTERNS.define.extract(msg);
    if (data) return { intent: "define", data };
  }
  if (INTENT_PATTERNS.image.regex.test(msg)) {
    return { intent: "image", data: INTENT_PATTERNS.image.extract(msg) };
  }
  if (INTENT_PATTERNS.calculate.regex.test(msg)) {
    return { intent: "calculate", data: INTENT_PATTERNS.calculate.extract(msg) };
  }

  // NEWS vs MAP disambiguation: news wins if "news" is in the message
  if (hasSignal(msg, NEWS_SIGNALS)) {
    return { intent: "news", data: INTENT_PATTERNS.news.extract(msg) };
  }

  // Weather: only if weather signal present and NOT a map-only signal
  if (INTENT_PATTERNS.weather.regex.test(msg) && hasSignal(msg, WEATHER_SIGNALS)) {
    return { intent: "weather", data: INTENT_PATTERNS.weather.extract(msg) };
  }

  if (INTENT_PATTERNS.translate.regex.test(msg)) {
    const data = INTENT_PATTERNS.translate.extract(msg);
    if (data) return { intent: "translate", data };
  }
  if (INTENT_PATTERNS.currency.regex.test(msg)) {
    const data = INTENT_PATTERNS.currency.extract(msg);
    if (data) return { intent: "currency", data };
  }
  if (INTENT_PATTERNS.convert.regex.test(msg)) {
    const data = INTENT_PATTERNS.convert.extract(msg);
    if (data) return { intent: "convert", data };
  }
  if (INTENT_PATTERNS.worldclock.regex.test(msg)) {
    return { intent: "worldclock", data: INTENT_PATTERNS.worldclock.extract(msg) };
  }
  if (INTENT_PATTERNS.joke.regex.test(msg)) {
    return { intent: "joke", data: true };
  }
  if (INTENT_PATTERNS.browse.regex.test(msg)) {
    return { intent: "browse", data: INTENT_PATTERNS.browse.extract(msg) };
  }
  if (INTENT_PATTERNS.youtube.regex.test(msg)) {
    return { intent: "youtube", data: INTENT_PATTERNS.youtube.extract(msg) };
  }

  // Map: only if explicit map signal
  if (hasSignal(msg, MAP_ONLY_SIGNALS) && INTENT_PATTERNS.map.regex.test(msg)) {
    return { intent: "map", data: INTENT_PATTERNS.map.extract(msg) || "Richmond Virginia" };
  }

  if (INTENT_PATTERNS.execute.regex.test(msg)) {
    return { intent: "execute", data: INTENT_PATTERNS.execute.extract(msg) };
  }
  if (INTENT_PATTERNS.screenshot.regex.test(msg)) {
    const data = INTENT_PATTERNS.screenshot.extract(msg);
    if (data) return { intent: "screenshot", data };
  }
  if (INTENT_PATTERNS.gallery.regex.test(msg)) {
    return { intent: "gallery", data: INTENT_PATTERNS.gallery.extract(msg) };
  }
  if (INTENT_PATTERNS.nutrition.regex.test(msg)) {
    const data = INTENT_PATTERNS.nutrition.extract(msg);
    if (data) return { intent: "nutrition", data };
  }
  if (INTENT_PATTERNS.briefing.regex.test(msg)) {
    return { intent: "briefing", data: true };
  }
  if (INTENT_PATTERNS.screen_share.regex.test(msg)) {
    return { intent: "screen_share", data: true };
  }
  if (INTENT_PATTERNS.code.regex.test(msg)) {
    return { intent: "code", data: msg };
  }
  if (INTENT_PATTERNS.stock.regex.test(msg)) {
    return { intent: "stock", data: INTENT_PATTERNS.stock.extract(msg) };
  }

  // Wikipedia: lower priority so it doesn't swallow everything
  if (INTENT_PATTERNS.wikipedia.regex.test(msg)) {
    const data = INTENT_PATTERNS.wikipedia.extract(msg);
    if (data) return { intent: "wikipedia", data };
  }

  // Web search: "find me X" — broad but lower priority than specific tools
  if (INTENT_PATTERNS.websearch.regex.test(msg)) {
    return { intent: "websearch", data: INTENT_PATTERNS.websearch.extract(msg) };
  }

  return { intent: "chat", data: null };
}
