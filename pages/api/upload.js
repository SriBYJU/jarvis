import { IncomingForm } from "formidable";
import fs from "fs";
import path from "path";

export const config = { api: { bodyParser: false } };

const UPLOAD_DIR = path.join(process.cwd(), ".data", "uploads");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch {}

  const form = new IncomingForm({
    uploadDir: UPLOAD_DIR,
    keepExtensions: true,
    maxFileSize: 50 * 1024 * 1024, // 50MB
  });

  form.parse(req, (err, fields, files) => {
    if (err) return res.status(400).json({ error: "Upload failed: " + err.message });

    const file = files.file?.[0] || files.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const ext = path.extname(file.originalFilename || "").toLowerCase();
    const name = file.originalFilename || "file";
    const size = file.size;

    // Read text-based files to include content for the AI
    const textExts = [".txt", ".md", ".json", ".js", ".ts", ".jsx", ".tsx", ".py", ".html", ".css", ".csv", ".xml", ".yaml", ".yml", ".toml", ".env", ".sh", ".bat", ".sql", ".log", ".cfg", ".ini", ".conf", ".java", ".c", ".cpp", ".h", ".rs", ".go", ".rb", ".php", ".swift", ".kt"];
    let content = null;

    if (textExts.includes(ext) && size < 500000) {
      try { content = fs.readFileSync(file.filepath, "utf-8"); } catch {}
    }

    return res.status(200).json({
      type: "file_upload",
      data: {
        name,
        size,
        ext,
        content: content ? content.slice(0, 10000) : null,
        path: file.filepath,
        isText: !!content,
      },
    });
  });
}
