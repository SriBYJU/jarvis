export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { query } = req.body;
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "YOUTUBE_API_KEY not configured" });

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${apiKey}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("YouTube API error: " + resp.status);
    const data = await resp.json();

    const video = data.items?.[0];
    if (!video) return res.status(200).json({ type: "youtube", data: null });

    return res.status(200).json({
      type: "youtube",
      data: {
        videoId: video.id.videoId,
        title: video.snippet.title,
        channel: video.snippet.channelTitle,
        thumbnail: video.snippet.thumbnails?.high?.url || video.snippet.thumbnails?.default?.url,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
