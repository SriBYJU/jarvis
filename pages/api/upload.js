import formidable from "formidable";
import fs from "fs";
import path from "path";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const dataDir = path.join(process.cwd(), ".data", "uploads");
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch {}

  const form = formidable({ maxFileSize: 50 * 1024 * 1024, uploadDir: dataDir, keepExtensions: true });

  form.parse(req, (err, fields, files) => {
    if (err) return res.status(400).json({ error: "Upload failed: " + err.message });

    const file = files.file?.[0] || files.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const ext = path.extname(file.originalFilename || "").toLowerCase();
    const name = file.originalFilename || "upload" + ext;
    const size = file.size || 0;
    const isText = [".txt", ".md", ".js", ".ts", ".py", ".json", ".csv", ".html", ".css", ".xml", ".yaml", ".yml", ".sh", ".env", ".log", ".jsx", ".tsx", ".sql", ".java", ".c", ".cpp", ".h", ".rs", ".go", ".rb", ".php"].includes(ext);

    let content = null;
    if (isText) {
      try { content = fs.readFileSync(file.filepath, "utf-8"); } catch {}
    }

    // For PDFs, try to extract text
    let pdfText = null;
    if (ext === ".pdf") {
      try {
        const buffer = fs.readFileSync(file.filepath);
        const text = buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
        if (text.length > 100) pdfText = text.slice(0, 10000);
      } catch {}
    }

    return res.json({
      type: "file_upload",
      data: {
        name,
        size,
        ext,
        isText,
        content: content ? content.slice(0, 10000) : null,
        pdfText,
        path: file.filepath,
      },
    });
  });
}
