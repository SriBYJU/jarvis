/**
 * Local-first file generation for JARVIS.
 * Generates XLSX/DOCX/PPTX/CSV/JSON/HTML/code without vulnerable XLSX or
 * PowerPoint helper packages. XLSX/PPTX are written as OOXML with JSZip.
 */

export const config = { api: { bodyParser: { sizeLimit: "6mb" } } };

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const LOCAL_MODEL = process.env.JARVIS_MODEL || "qwen3:4b";

function xml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripCodeFence(text) {
  return String(text || "").trim().replace(/^```(?:json|csv|html|python|javascript|markdown|text)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function parseRows(content) {
  const clean = stripCodeFence(content);
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed)) return parsed.map(r => Array.isArray(r) ? r : Object.values(r));
    if (Array.isArray(parsed?.rows)) return parsed.rows;
    if (Array.isArray(parsed?.data)) return parsed.data.map(r => Array.isArray(r) ? r : Object.values(r));
  } catch {}
  const lines = clean.split("\n").map(x => x.trim()).filter(Boolean).filter(x => !/^\|?\s*:?-{3,}/.test(x));
  return lines.map(line => {
    const parts = line.includes("|") ? line.replace(/^\||\|$/g, "").split("|") : line.split(/\t|,/);
    return parts.map(c => c.trim()).filter((c, i, a) => c || a.length === 1);
  }).filter(r => r.length);
}

function colName(index) {
  let n = index + 1, out = "";
  while (n > 0) { const r = (n - 1) % 26; out = String.fromCharCode(65 + r) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

async function generateXlsx(content) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const rows = parseRows(content);
  if (!rows.length) rows.push(["No data available"]);
  const sheetRows = rows.map((row, ri) => {
    const cells = row.map((value, ci) => {
      const ref = `${colName(ci)}${ri + 1}`;
      const n = typeof value === "number" ? value : Number(String(value).replace(/[$,%]/g, ""));
      const numeric = String(value).trim() !== "" && Number.isFinite(n) && !/^0\d+/.test(String(value).trim());
      if (numeric) return `<c r="${ref}"${ri === 0 ? ' s="1"' : ""}><v>${n}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${ri === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  const maxCols = Math.max(...rows.map(r => r.length), 1);
  const dim = `A1:${colName(maxCols - 1)}${rows.length}`;

  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173B57"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dim}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${sheetRows}</sheetData><autoFilter ref="${dim}"/></worksheet>`);
  return zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}

async function generateDocx(content) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx");
  const children = [];
  for (const line of stripCodeFence(content).split("\n")) {
    const t = line.trim();
    if (!t) { children.push(new Paragraph("")); continue; }
    if (t.startsWith("# ")) children.push(new Paragraph({ text: t.slice(2), heading: HeadingLevel.HEADING_1 }));
    else if (t.startsWith("## ")) children.push(new Paragraph({ text: t.slice(3), heading: HeadingLevel.HEADING_2 }));
    else if (t.startsWith("### ")) children.push(new Paragraph({ text: t.slice(4), heading: HeadingLevel.HEADING_3 }));
    else if (/^[-*] /.test(t)) children.push(new Paragraph({ text: t.slice(2), bullet: { level: 0 } }));
    else {
      const runs = t.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(part => new TextRun({ text: part.replace(/^\*\*|\*\*$/g, ""), bold: /^\*\*/.test(part) }));
      children.push(new Paragraph({ children: runs }));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBase64String(doc);
}

function parseSlides(content) {
  const clean = stripCodeFence(content);
  let blocks = clean.split(/\n\s*---\s*\n/g).map(x => x.trim()).filter(Boolean);
  if (blocks.length < 2) blocks = clean.split(/(?=^##?\s+)/gm).map(x => x.trim()).filter(Boolean);
  return blocks.slice(0, 12).map((block, i) => {
    const lines = block.split("\n").map(x => x.trim()).filter(Boolean);
    const title = (lines.shift() || `Slide ${i + 1}`).replace(/^#+\s*/, "");
    const bullets = lines.map(x => x.replace(/^[-*•]\s*/, "").replace(/^\d+[.)]\s*/, "")).filter(Boolean).slice(0, 8);
    return { title, bullets };
  });
}

function shapeXml(id, text, x, y, cx, cy, size, bold = false, color = "E8F7FF") {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="${size}"${bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Aptos"/></a:rPr><a:t>${xml(text)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${size}"/></a:p></p:txBody></p:sp>`;
}

function themeXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="JARVIS"><a:themeElements><a:clrScheme name="JARVIS"><a:dk1><a:srgbClr val="020611"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="173B57"/></a:dk2><a:lt2><a:srgbClr val="E8F7FF"/></a:lt2><a:accent1><a:srgbClr val="75DFFF"/></a:accent1><a:accent2><a:srgbClr val="278FFF"/></a:accent2><a:accent3><a:srgbClr val="55E0A3"/></a:accent3><a:accent4><a:srgbClr val="FFB86B"/></a:accent4><a:accent5><a:srgbClr val="B997FF"/></a:accent5><a:accent6><a:srgbClr val="FF7E9D"/></a:accent6><a:hlink><a:srgbClr val="75DFFF"/></a:hlink><a:folHlink><a:srgbClr val="B997FF"/></a:folHlink></a:clrScheme><a:fontScheme name="JARVIS"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="JARVIS"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="50000"/><a:satMod val="300000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="100000"/><a:satMod val="200000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="16200000" scaled="1"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;
}

async function generatePptx(content) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const slides = parseSlides(content);
  if (!slides.length) slides.push({ title: "JARVIS Presentation", bullets: ["Generated locally by JARVIS"] });
  const overrides = slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${overrides}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  const slideIds = slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("");
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`);
  zip.file("ppt/theme/theme1.xml", themeXml());
  zip.file("ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="JARVIS"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="dk1" bg2="dk2" folHlink="folHlink" hlink="hlink" tx1="lt1" tx2="lt2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
  zip.file("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);

  slides.forEach((slide, i) => {
    const bullets = slide.bullets.length ? slide.bullets : [""];
    const body = bullets.map((b, bi) => shapeXml(3 + bi, `• ${b}`, 914400, 1900000 + bi * 520000, 10400000, 480000, 1900, false, "D9F5FF")).join("");
    zip.file(`ppt/slides/slide${i + 1}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="020611"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapeXml(2, slide.title, 700000, 500000, 10800000, 1100000, 3000, true, "75DFFF")}${body}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`);
    zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
  });
  return zip.generateAsync({ type: "base64", compression: "DEFLATE" });
}

function generateText(content) { return Buffer.from(stripCodeFence(content), "utf8").toString("base64"); }

const PROMPTS = {
  xlsx: p => `Generate spreadsheet data for: ${p}. Return ONLY a JSON array of arrays. First row is headers. Include 8-15 useful rows.`,
  docx: p => `Write a polished professional document about: ${p}. Use #/## headings and concise bullets where useful. Aim for 500-900 words.`,
  pptx: p => `Create a concise 6-8 slide presentation about: ${p}. Separate slides with --- on its own line. First line of each slide is the title. Remaining lines are short bullet points prefixed with - .`,
  csv: p => `Generate useful CSV data for: ${p}. Return only valid CSV with a header and 10-20 rows.`,
  json: p => `Generate a useful JSON structure for: ${p}. Return only valid JSON.`,
  html: p => `Create a complete modern standalone HTML page for: ${p}. Include CSS in a style tag. Return only HTML.`,
  python: p => `Write a complete well-commented Python script for: ${p}. Include error handling and example usage.`,
  javascript: p => `Write a complete well-commented JavaScript/Node.js script for: ${p}. Include error handling.`,
  markdown: p => `Write a comprehensive well-structured markdown document about: ${p}.`,
  txt: p => `Write a detailed, organized plain-text document about: ${p}.`,
};

async function localGenerate(system, prompt) {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LOCAL_MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        stream: false,
        think: false,
        keep_alive: "45m",
        options: { temperature: 0.18, num_ctx: 4096, num_predict: 1400 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d.message?.content ? stripCodeFence(d.message.content) : null;
  } catch { return null; }
}

async function generateContent(fileType, prompt) {
  const instruction = (PROMPTS[fileType] || PROMPTS.txt)(prompt || "the requested topic");
  const local = await localGenerate("You are JARVIS' local document engine. Follow output-format instructions exactly. Do not narrate your reasoning.", instruction);
  if (local) return local;
  const { chatCompletion } = await import("../../../lib/llm");
  const { reply } = await chatCompletion([{ role: "user", content: instruction }], "Create the requested document content only. No preamble.", "fast");
  if (!reply) throw new Error("No document content was generated");
  return stripCodeFence(reply);
}

const FILE_TYPES = {
  xlsx: { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel Spreadsheet" },
  docx: { ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word Document" },
  pptx: { ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint Presentation" },
  csv: { ext: "csv", mime: "text/csv", label: "CSV Spreadsheet" },
  json: { ext: "json", mime: "application/json", label: "JSON File" },
  html: { ext: "html", mime: "text/html", label: "HTML File" },
  python: { ext: "py", mime: "text/plain", label: "Python Script" },
  javascript: { ext: "js", mime: "text/plain", label: "JavaScript File" },
  markdown: { ext: "md", mime: "text/markdown", label: "Markdown Document" },
  txt: { ext: "txt", mime: "text/plain", label: "Text Document" },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { fileType = "txt", prompt, content: providedContent, filename: customFilename } = req.body || {};
  if (!prompt && !providedContent) return res.status(400).json({ error: "prompt or content required" });
  const kind = FILE_TYPES[fileType] ? fileType : "txt";
  const typeConfig = FILE_TYPES[kind];
  const stem = (customFilename || prompt || "jarvis-file").replace(/[^a-z0-9\-_\s]/gi, "").replace(/\s+/g, "-").slice(0, 50).toLowerCase() || "jarvis-file";
  const filename = `${stem}.${typeConfig.ext}`;
  try {
    const content = providedContent || await generateContent(kind, prompt);
    let base64;
    if (kind === "xlsx") base64 = await generateXlsx(content);
    else if (kind === "docx") base64 = await generateDocx(content);
    else if (kind === "pptx") base64 = await generatePptx(content);
    else base64 = generateText(content);
    return res.status(200).json({ type: "file_download", data: { filename, fileType: kind, label: typeConfig.label, mime: typeConfig.mime, base64, prompt, size: Math.round(base64.length * 0.75) } });
  } catch (e) {
    console.error("generate-file error:", e);
    return res.status(500).json({ error: `File generation failed: ${e.message}` });
  }
}
