/**
 * pages/api/tools/generate-file.js
 * Generates downloadable files: xlsx, docx, pptx, csv, json, html, code files
 */

export const config = { api: { bodyParser: { sizeLimit: "4mb" } } };

// ── XLSX ──────────────────────────────────────────────────────────
async function generateXlsx(prompt, content) {
  const XLSX = (await import("xlsx")).default;
  const wb = XLSX.utils.book_new();

  // Parse content — expect array of arrays or parse from LLM text
  let rows = [];
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) rows = parsed;
    else if (parsed.rows) rows = parsed.rows;
    else if (parsed.data) rows = parsed.data;
  } catch {
    // Parse markdown table or plain text into rows
    const lines = content.split("\n").filter(l => l.trim() && !l.match(/^[-|]+$/));
    rows = lines.map(l =>
      l.split(/[|\t,]/).map(c => c.trim()).filter(Boolean)
    );
  }

  if (!rows.length) rows = [["No data available"]];

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Auto-width columns
  const colWidths = rows[0]?.map((_, ci) =>
    Math.min(30, Math.max(10, ...rows.map(r => String(r[ci] || "").length)))
  ) || [];
  ws["!cols"] = colWidths.map(w => ({ wch: w }));

  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "base64", bookType: "xlsx" });
}

// ── DOCX ──────────────────────────────────────────────────────────
async function generateDocx(prompt, content) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = await import("docx");

  const lines = content.split("\n");
  const children = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { children.push(new Paragraph("")); continue; }

    if (trimmed.startsWith("# ")) {
      children.push(new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_1 }));
    } else if (trimmed.startsWith("## ")) {
      children.push(new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 }));
    } else if (trimmed.startsWith("### ")) {
      children.push(new Paragraph({ text: trimmed.slice(4), heading: HeadingLevel.HEADING_3 }));
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      children.push(new Paragraph({ text: trimmed.slice(2), bullet: { level: 0 } }));
    } else if (trimmed.match(/^\d+\. /)) {
      children.push(new Paragraph({ text: trimmed.replace(/^\d+\. /, ""), numbering: { reference: "default", level: 0 } }));
    } else {
      // Handle inline bold **text**
      const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
      const runs = parts.map(part => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return new TextRun({ text: part.slice(2, -2), bold: true });
        }
        return new TextRun({ text: part });
      });
      children.push(new Paragraph({ children: runs }));
    }
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 24 } },
      },
    },
    sections: [{ properties: {}, children }],
  });

  return await Packer.toBase64String(doc);
}

// ── PPTX ──────────────────────────────────────────────────────────
async function generatePptx(prompt, content) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_WIDE";
  pptx.theme = { headFontFace: "Calibri", bodyFontFace: "Calibri" };

  // Parse slides — split on "---" or "## " headers
  const slideBlocks = content.split(/\n---\n|\n## /g).filter(Boolean);

  slideBlocks.forEach((block, idx) => {
    const lines = block.trim().split("\n").filter(Boolean);
    const slide = pptx.addSlide();

    // Dark background
    slide.background = { color: "0a0f1e" };

    const title = lines[0]?.replace(/^#+ /, "").trim() || `Slide ${idx + 1}`;
    const bodyLines = lines.slice(1).filter(l => l.trim());

    // Title
    slide.addText(title, {
      x: 0.5, y: 0.4, w: "90%", h: 1.0,
      fontSize: 28, bold: true, color: "7ecfff",
      fontFace: "Calibri",
    });

    // Body bullets
    if (bodyLines.length) {
      const bulletItems = bodyLines.map(l => ({
        text: l.replace(/^[-*•]\s*/, "").replace(/^\d+\.\s*/, ""),
        options: { bullet: l.match(/^[-*•]/) ? true : false, fontSize: 16, color: "e0e8f0" },
      }));
      slide.addText(bulletItems, {
        x: 0.5, y: 1.6, w: "90%", h: 4.5,
        fontFace: "Calibri", valign: "top",
      });
    }

    // Slide number
    slide.addText(`${idx + 1}`, {
      x: "90%", y: "92%", w: 0.5, h: 0.3,
      fontSize: 10, color: "444466", align: "right",
    });
  });

  // Ensure at least one slide
  if (slideBlocks.length === 0) {
    const slide = pptx.addSlide();
    slide.background = { color: "0a0f1e" };
    slide.addText(prompt, { x: 1, y: 2, w: "80%", fontSize: 24, color: "7ecfff" });
  }

  return await pptx.write({ outputType: "base64" });
}

// ── CSV ───────────────────────────────────────────────────────────
function generateCsv(content) {
  return Buffer.from(content).toString("base64");
}

// ── Plain text / code / JSON / HTML / markdown ─────────────────────
function generateText(content) {
  return Buffer.from(content).toString("base64");
}

// ── LLM content generator ─────────────────────────────────────────
async function generateContent(fileType, prompt, userContext) {
  const { chatCompletion } = await import("../../../lib/llm");

  const PROMPTS = {
    xlsx: `Generate data for a spreadsheet about: "${prompt}". 
Output ONLY a JSON array of arrays (rows). First row = headers. 8-15 data rows minimum. No explanation, no markdown, just the JSON array.
Example: [["Name","Price","Change"],["AAPL",189.5,"+1.2%"]]`,

    docx: `Write a professional Word document about: "${prompt}".
Use markdown formatting: # for title, ## for sections, ### for subsections, - for bullets.
Write at least 400 words. Be thorough and professional.`,

    pptx: `Create a presentation about: "${prompt}".
Format as slides separated by "---" on its own line.
Each slide: title on first line, then bullet points with "- " prefix.
Create 5-8 slides. Be visual and concise per slide.
Example:
# Introduction
- Key point one
- Key point two
---
## Main Topic
- Detail here`,

    csv: `Generate CSV data about: "${prompt}".
Output ONLY valid CSV with a header row. 10-20 data rows. No explanation.`,

    json: `Generate a JSON data structure about: "${prompt}".
Output ONLY valid JSON, no explanation, no markdown code fences.`,

    html: `Create a complete, styled HTML page about: "${prompt}".
Include CSS in a <style> tag. Make it look professional and modern.
Output only the complete HTML document.`,

    python: `Write a complete, well-commented Python script for: "${prompt}".
Include proper imports, docstrings, error handling, and example usage.`,

    javascript: `Write a complete, well-commented JavaScript/Node.js script for: "${prompt}".
Include proper error handling and comments explaining each section.`,

    markdown: `Write a comprehensive markdown document about: "${prompt}".
Use proper markdown: headers, bullets, code blocks, tables where appropriate.
Be thorough and well-structured.`,

    txt: `Write a detailed, well-organized plain text document about: "${prompt}".`,
  };

  const systemPrompt = PROMPTS[fileType] || PROMPTS.txt;
  const { reply } = await chatCompletion(
    [{ role: "user", content: systemPrompt + (userContext ? `\n\nContext: ${userContext}` : "") }],
    "You are a professional document creator. Output exactly what is requested with no preamble.",
    "thinking"
  );
  return reply;
}

// ── File type config ──────────────────────────────────────────────
const FILE_TYPES = {
  xlsx: { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel Spreadsheet" },
  docx: { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word Document" },
  pptx: { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint Presentation" },
  csv:  { ext: "csv",  mime: "text/csv", label: "CSV Spreadsheet" },
  json: { ext: "json", mime: "application/json", label: "JSON File" },
  html: { ext: "html", mime: "text/html", label: "HTML File" },
  python: { ext: "py", mime: "text/plain", label: "Python Script" },
  javascript: { ext: "js", mime: "text/plain", label: "JavaScript File" },
  markdown: { ext: "md", mime: "text/markdown", label: "Markdown Document" },
  txt:  { ext: "txt",  mime: "text/plain", label: "Text File" },
};

// ── Main handler ──────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { fileType = "txt", prompt, content: providedContent, filename: customFilename } = req.body;

  if (!prompt && !providedContent) {
    return res.status(400).json({ error: "prompt or content required" });
  }

  const typeConfig = FILE_TYPES[fileType] || FILE_TYPES.txt;
  const safeFilename = (customFilename || prompt || "jarvis-file")
    .replace(/[^a-z0-9\-_\s]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 50)
    .toLowerCase();
  const filename = `${safeFilename}.${typeConfig.ext}`;

  try {
    // Generate content via LLM if not provided
    const content = providedContent || await generateContent(fileType, prompt);

    // Generate file as base64
    let base64;
    switch (fileType) {
      case "xlsx": base64 = await generateXlsx(prompt, content); break;
      case "docx": base64 = await generateDocx(prompt, content); break;
      case "pptx": base64 = await generatePptx(prompt, content); break;
      case "csv":  base64 = generateCsv(content); break;
      default:     base64 = generateText(content); break;
    }

    return res.status(200).json({
      type: "file_download",
      data: {
        filename,
        fileType,
        label: typeConfig.label,
        mime: typeConfig.mime,
        base64,
        prompt,
        size: Math.round(base64.length * 0.75), // approximate byte size
      },
    });
  } catch (e) {
    console.error("generate-file error:", e);
    return res.status(500).json({ error: "File generation failed: " + e.message });
  }
}
