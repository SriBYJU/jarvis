export const config = { api: { bodyParser: false } };

function parseMultipart(buf, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from("--" + boundary);
  let start = buf.indexOf(boundaryBuf);
  while (start !== -1) {
    start += boundaryBuf.length;
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break;
    start = buf.indexOf(Buffer.from("\r\n"), start) + 2;
    const headerEnd = buf.indexOf(Buffer.from("\r\n\r\n"), start);
    if (headerEnd === -1) break;
    const headers = buf.slice(start, headerEnd).toString("utf-8");
    const bodyStart = headerEnd + 4;
    const nextBoundary = buf.indexOf(boundaryBuf, bodyStart);
    if (nextBoundary === -1) break;
    const bodyEnd = nextBoundary - 2;
    const nameMatch = headers.match(/name="([^"]+)"/);
    const fileMatch = headers.match(/filename="([^"]+)"/);
    if (nameMatch) {
      parts.push({
        name: nameMatch[1],
        filename: fileMatch ? fileMatch[1] : null,
        data: buf.slice(bodyStart, bodyEnd),
        headers,
      });
    }
    start = nextBoundary;
  }
  return parts;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const contentType = req.headers["content-type"] || "";
  const boundaryMatch = contentType.match(/boundary=(.+)/);
  if (!boundaryMatch) return res.status(400).json({ error: "No multipart boundary found" });

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buf = Buffer.concat(chunks);

  const parts = parseMultipart(buf, boundaryMatch[1]);
  const filePart = parts.find(p => p.filename);
  if (!filePart) return res.status(400).json({ error: "No file uploaded" });

  const name = filePart.filename;
  const ext = (name.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  const size = filePart.data.length;
  const textExts = [".txt", ".md", ".js", ".ts", ".py", ".json", ".csv", ".html", ".css", ".xml", ".yaml", ".yml", ".sh", ".env", ".log", ".jsx", ".tsx", ".sql", ".java", ".c", ".cpp", ".h", ".rs", ".go", ".rb", ".php"];
  const isText = textExts.includes(ext);

  let content = null;
  if (isText) {
    content = filePart.data.toString("utf-8").slice(0, 10000);
  }

  let pdfText = null;
  if (ext === ".pdf") {
    const raw = filePart.data.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
    if (raw.length > 100) pdfText = raw.slice(0, 10000);
  }

  return res.json({
    type: "file_upload",
    data: { name, size, ext, isText, content, pdfText, path: null },
  });
}
