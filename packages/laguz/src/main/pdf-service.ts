import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFName, PDFString, PDFArray, PDFDict, rgb, StandardFonts } from 'pdf-lib';
import { config } from './config';

function resolveVaultPath(filePath: string): string {
  return filePath.startsWith('/') ? filePath : path.join(config.vaultPath, filePath);
}

export interface PdfInfo {
  pageCount: number;
  title: string | null;
  author: string | null;
  subject: string | null;
  creator: string | null;
  creationDate: string | null;
  modificationDate: string | null;
}

export interface PdfAnnotationData {
  id: string;
  type: 'highlight' | 'underline' | 'text-note' | 'text-box' | 'signature';
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  text?: string;
  color: string;
  author: 'user' | 'claude';
}

export interface PdfField {
  id: string;
  label: string;
  page: number;
  rect: { x: number; y: number; width: number; height: number };
  currentValue?: string;
}

export async function readPdfBase64(filePath: string): Promise<string> {
  const abs = resolveVaultPath(filePath);
  const buf = fs.readFileSync(abs);
  return buf.toString('base64');
}

export async function readPdfText(filePath: string, pageRange?: { start: number; end: number }): Promise<string> {
  const abs = resolveVaultPath(filePath);
  const buf = fs.readFileSync(abs);
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();
  const textParts: string[] = [];

  const startIdx = pageRange ? Math.max(0, pageRange.start - 1) : 0;
  const endIdx = pageRange ? Math.min(pages.length, pageRange.end) : pages.length;

  for (let i = startIdx; i < endIdx; i++) {
    const page = pages[i];
    const { width, height } = page.getSize();
    const extracted = await extractTextFromPage(page, pdfDoc);
    if (extracted) {
      textParts.push(`--- Page ${i + 1} (${Math.round(width)}x${Math.round(height)}) ---\n${extracted}`);
    } else {
      textParts.push(`--- Page ${i + 1} (${Math.round(width)}x${Math.round(height)}) ---\n[No extractable text]`);
    }
  }

  if (pageRange && endIdx < pages.length) {
    textParts.push(`\n[Showing pages ${pageRange.start}-${endIdx} of ${pages.length}]`);
  }

  return textParts.join('\n\n');
}

async function extractTextFromPage(page: any, pdfDoc: PDFDocument): Promise<string> {
  // pdf-lib doesn't have a high-level text extraction API.
  // We parse the page's content stream operators for text-showing operators (Tj, TJ, ', ")
  try {
    const node = page.node;
    const contents = node.get(PDFName.of('Contents'));
    if (!contents) return '';

    const context = pdfDoc.context;
    let streamBytes: Uint8Array;

    if (contents instanceof PDFArray) {
      const parts: Uint8Array[] = [];
      for (let i = 0; i < contents.size(); i++) {
        const ref = contents.get(i);
        const stream = context.lookup(ref);
        if (stream && typeof (stream as any).getContents === 'function') {
          parts.push((stream as any).getContents());
        }
      }
      const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
      streamBytes = new Uint8Array(totalLength);
      let offset = 0;
      for (const p of parts) {
        streamBytes.set(p, offset);
        offset += p.length;
      }
    } else {
      const stream = context.lookup(contents);
      if (!stream || typeof (stream as any).getContents !== 'function') return '';
      streamBytes = (stream as any).getContents();
    }

    const raw = new TextDecoder('latin1').decode(streamBytes);
    return parseTextOperators(raw);
  } catch (e) {
    console.error('[PdfService] Text extraction error:', e);
    return '';
  }
}

function parseTextOperators(content: string): string {
  const lines: string[] = [];
  let currentLine = '';

  // Match text showing operators: (string) Tj, [(array)] TJ, (string) ' , (string) "
  const tjRegex = /\(([^)]*)\)\s*Tj/g;
  const tjArrayRegex = /\[([^\]]*)\]\s*TJ/g;
  // Detect text positioning that implies a new line (Td, TD, T*, ', ")
  const newlineRegex = /\b(T\*|Td|TD)\b/g;

  let lastIndex = 0;
  const combined = content;

  // Simple approach: scan for text operators in order
  const tokens: { index: number; type: string; text: string }[] = [];

  let m: RegExpExecArray | null;

  // (string) Tj
  const tj2 = /\(([^)]*)\)\s*Tj/g;
  while ((m = tj2.exec(combined)) !== null) {
    tokens.push({ index: m.index, type: 'text', text: decodePdfString(m[1]) });
  }

  // [(..)] TJ - array of strings and kerning values
  const tjArr = /\[([^\]]*)\]\s*TJ/g;
  while ((m = tjArr.exec(combined)) !== null) {
    const inner = m[1];
    let text = '';
    const strParts = /\(([^)]*)\)/g;
    let sm: RegExpExecArray | null;
    while ((sm = strParts.exec(inner)) !== null) {
      text += decodePdfString(sm[1]);
    }
    if (text) tokens.push({ index: m.index, type: 'text', text });
  }

  // Newline indicators
  const nl = /\b(T\*)\b/g;
  while ((m = nl.exec(combined)) !== null) {
    tokens.push({ index: m.index, type: 'newline', text: '' });
  }

  // Td with large negative y offset = new line
  const td = /([-\d.]+)\s+([-\d.]+)\s+Td/g;
  while ((m = td.exec(combined)) !== null) {
    const yOffset = parseFloat(m[2]);
    if (Math.abs(yOffset) > 1) {
      tokens.push({ index: m.index, type: 'newline', text: '' });
    }
  }

  // BT/ET for text blocks
  const bt = /\bBT\b/g;
  while ((m = bt.exec(combined)) !== null) {
    tokens.push({ index: m.index, type: 'newline', text: '' });
  }

  tokens.sort((a, b) => a.index - b.index);

  for (const token of tokens) {
    if (token.type === 'newline') {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
        currentLine = '';
      }
    } else {
      currentLine += token.text;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }

  return lines.join('\n');
}

function decodePdfString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

export async function getPdfInfo(filePath: string): Promise<PdfInfo> {
  const abs = resolveVaultPath(filePath);
  const buf = fs.readFileSync(abs);
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });

  return {
    pageCount: pdfDoc.getPageCount(),
    title: pdfDoc.getTitle() ?? null,
    author: pdfDoc.getAuthor() ?? null,
    subject: pdfDoc.getSubject() ?? null,
    creator: pdfDoc.getCreator() ?? null,
    creationDate: pdfDoc.getCreationDate()?.toISOString() ?? null,
    modificationDate: pdfDoc.getModificationDate()?.toISOString() ?? null,
  };
}

export async function addAnnotation(filePath: string, annotation: PdfAnnotationData): Promise<void> {
  const abs = resolveVaultPath(filePath);
  const buf = fs.readFileSync(abs);
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  if (annotation.page < 0 || annotation.page >= pages.length) {
    throw new Error(`Page ${annotation.page} out of range (0-${pages.length - 1})`);
  }

  const page = pages[annotation.page];
  const { x, y, width, height } = annotation.rect;
  const color = hexToRgb(annotation.color);

  switch (annotation.type) {
    case 'highlight': {
      // Draw a semi-transparent rectangle behind text
      page.drawRectangle({
        x, y, width, height,
        color: rgb(color.r, color.g, color.b),
        opacity: 0.3,
      });
      break;
    }
    case 'underline': {
      page.drawLine({
        start: { x, y },
        end: { x: x + width, y },
        thickness: 1,
        color: rgb(color.r, color.g, color.b),
        opacity: 0.8,
      });
      break;
    }
    case 'text-note':
    case 'text-box': {
      if (annotation.text) {
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontSize = Math.min(12, height * 0.8);
        page.drawText(annotation.text, {
          x: x + 2,
          y: y + 2,
          size: fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        });
      }
      break;
    }
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(abs, Buffer.from(pdfBytes));
}

export async function placeSignature(
  filePath: string,
  page: number,
  rect: { x: number; y: number; width: number; height: number },
  signaturePngBase64: string,
): Promise<void> {
  const abs = resolveVaultPath(filePath);
  const buf = fs.readFileSync(abs);
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  if (page < 0 || page >= pages.length) {
    throw new Error(`Page ${page} out of range`);
  }

  const pngBytes = Buffer.from(signaturePngBase64, 'base64');
  const pngImage = await pdfDoc.embedPng(pngBytes);

  pages[page].drawImage(pngImage, {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(abs, Buffer.from(pdfBytes));
}

export async function flattenPdf(filePath: string, outputPath?: string): Promise<string> {
  const abs = resolveVaultPath(filePath);
  const buf = fs.readFileSync(abs);
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });

  // "Flatten" by saving - pdf-lib bakes drawn content into the page stream
  const pdfBytes = await pdfDoc.save();

  const out = outputPath
    ? resolveVaultPath(outputPath)
    : abs.replace(/\.pdf$/i, ' (signed).pdf');

  fs.writeFileSync(out, Buffer.from(pdfBytes));

  // Return vault-relative path
  if (out.startsWith(config.vaultPath + '/')) {
    return out.slice(config.vaultPath.length + 1);
  }
  return out;
}

export async function fillField(
  filePath: string,
  fieldRect: { page: number; x: number; y: number; width: number; height: number },
  value: string,
): Promise<void> {
  const abs = resolveVaultPath(filePath);
  const buf = fs.readFileSync(abs);
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  if (fieldRect.page < 0 || fieldRect.page >= pages.length) {
    throw new Error(`Page ${fieldRect.page} out of range`);
  }

  const page = pages[fieldRect.page];
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSize = Math.min(11, fieldRect.height * 0.75);

  page.drawText(value, {
    x: fieldRect.x + 1,
    y: fieldRect.y + (fieldRect.height - fontSize) / 2,
    size: fontSize,
    font,
    color: rgb(0, 0, 0),
  });

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(abs, Buffer.from(pdfBytes));
}

// Sidecar notes
export function getSidecarPath(pdfPath: string): string {
  const abs = resolveVaultPath(pdfPath);
  return abs.replace(/\.pdf$/i, '.md');
}

export function readSidecar(pdfPath: string): string | null {
  const mdPath = getSidecarPath(pdfPath);
  if (fs.existsSync(mdPath)) {
    return fs.readFileSync(mdPath, 'utf-8');
  }
  return null;
}

export function writeSidecar(pdfPath: string, content: string): void {
  const mdPath = getSidecarPath(pdfPath);
  const dir = path.dirname(mdPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(mdPath, content, 'utf-8');
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
  };
}
