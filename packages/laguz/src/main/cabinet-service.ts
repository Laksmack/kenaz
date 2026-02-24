import path from 'path';
import fs from 'fs';
import { config } from './config';
import type { VaultStore } from './vault-store';
import * as pdfService from './pdf-service';

let Tesseract: any;
try {
  Tesseract = require('tesseract.js');
} catch {
  console.warn('[Laguz] tesseract.js not available — OCR disabled');
}

let mammoth: any;
try {
  mammoth = require('mammoth');
} catch {
  console.warn('[Laguz] mammoth not available — DOCX text extraction disabled');
}

const CABINET_DIR = '_cabinet';
const SUPPORTED_EXTS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'tiff', 'tif', 'docx', 'doc', 'txt']);
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'tiff', 'tif']);
const MIN_PDF_TEXT_LENGTH = 50;

export class CabinetService {
  private store: VaultStore;
  private processing = false;
  private queue: string[] = [];

  constructor(store: VaultStore) {
    this.store = store;
  }

  isCabinetPath(filePath: string): boolean {
    const rel = filePath.startsWith('/')
      ? path.relative(config.vaultPath, filePath)
      : filePath;
    return rel.startsWith(CABINET_DIR + '/');
  }

  isSupportedExt(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().replace('.', '');
    return SUPPORTED_EXTS.has(ext);
  }

  indexDocument(filePath: string): void {
    this.store.indexCabinetDocument(filePath);
    this.enqueueOcr(filePath);
  }

  removeDocument(filePath: string): void {
    this.store.removeCabinetDocument(filePath);
  }

  private enqueueOcr(filePath: string): void {
    const rel = path.relative(config.vaultPath, filePath);
    this.queue.push(rel);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const docPath = this.queue.shift()!;
      try {
        await this.extractText(docPath);
      } catch (e: any) {
        console.error(`[Laguz Cabinet] OCR failed for ${docPath}:`, e.message);
        this.store.updateCabinetOcr(docPath, 'failed', null);
      }
    }

    this.processing = false;
  }

  private async extractText(docPath: string): Promise<void> {
    const abs = path.join(config.vaultPath, docPath);
    if (!fs.existsSync(abs)) return;

    const ext = path.extname(docPath).toLowerCase().replace('.', '');
    this.store.updateCabinetOcr(docPath, 'processing', null);

    if (ext === 'pdf') {
      await this.extractPdfText(docPath, abs);
    } else if (IMAGE_EXTS.has(ext)) {
      await this.extractImageText(docPath, abs);
    } else if (ext === 'docx' || ext === 'doc') {
      await this.extractDocxText(docPath, abs);
    } else {
      await this.extractPlainText(docPath, abs);
    }
  }

  private async extractPdfText(docPath: string, abs: string): Promise<void> {
    let text = '';
    let pageCount: number | undefined;

    try {
      const info = await pdfService.getPdfInfo(docPath);
      pageCount = info.pageCount;
    } catch {}

    try {
      text = await pdfService.readPdfText(docPath);
    } catch (e: any) {
      console.warn(`[Laguz Cabinet] PDF text extraction failed for ${docPath}:`, e.message);
    }

    // If PDF has very little text, it's likely scanned — try OCR
    if (text.trim().length < MIN_PDF_TEXT_LENGTH && Tesseract) {
      try {
        const ocrText = await this.ocrPdfPages(abs);
        if (ocrText.length > text.length) {
          text = ocrText;
        }
      } catch (e: any) {
        console.warn(`[Laguz Cabinet] PDF OCR fallback failed for ${docPath}:`, e.message);
      }
    }

    this.store.updateCabinetOcr(docPath, 'done', text || null, pageCount);
  }

  private async ocrPdfPages(abs: string): Promise<string> {
    if (!Tesseract) return '';

    // Use pdfjs-dist to render pages to images, then OCR
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
    const buf = fs.readFileSync(abs);
    const uint8 = new Uint8Array(buf);
    const doc = await pdfjsLib.getDocument({ data: uint8 }).promise;
    const textParts: string[] = [];

    const maxPages = Math.min(doc.numPages, 20);
    for (let i = 1; i <= maxPages; i++) {
      try {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });

        const { createCanvas } = require('canvas');
        const canvas = createCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d');

        await page.render({ canvasContext: ctx, viewport }).promise;
        const pngBuffer = canvas.toBuffer('image/png');

        const { data: { text } } = await Tesseract.recognize(pngBuffer, 'eng');
        if (text?.trim()) {
          textParts.push(`--- Page ${i} ---\n${text.trim()}`);
        }
      } catch (e: any) {
        console.warn(`[Laguz Cabinet] OCR page ${i} failed:`, e.message);
      }
    }

    return textParts.join('\n\n');
  }

  private async extractImageText(docPath: string, abs: string): Promise<void> {
    if (!Tesseract) {
      this.store.updateCabinetOcr(docPath, 'failed', null);
      return;
    }

    try {
      const { data: { text } } = await Tesseract.recognize(abs, 'eng');
      this.store.updateCabinetOcr(docPath, 'done', text?.trim() || null);
    } catch (e: any) {
      console.error(`[Laguz Cabinet] Image OCR failed for ${docPath}:`, e.message);
      this.store.updateCabinetOcr(docPath, 'failed', null);
    }
  }

  private async extractDocxText(docPath: string, abs: string): Promise<void> {
    if (!mammoth) {
      this.store.updateCabinetOcr(docPath, 'failed', null);
      return;
    }

    try {
      const result = await mammoth.extractRawText({ path: abs });
      this.store.updateCabinetOcr(docPath, 'done', result.value?.trim() || null);
    } catch (e: any) {
      console.error(`[Laguz Cabinet] DOCX extraction failed for ${docPath}:`, e.message);
      this.store.updateCabinetOcr(docPath, 'failed', null);
    }
  }

  private async extractPlainText(docPath: string, abs: string): Promise<void> {
    try {
      const text = fs.readFileSync(abs, 'utf-8');
      const truncated = text.length > 100_000 ? text.slice(0, 100_000) : text;
      this.store.updateCabinetOcr(docPath, 'done', truncated);
    } catch (e: any) {
      this.store.updateCabinetOcr(docPath, 'failed', null);
    }
  }

  async reprocessPending(): Promise<void> {
    const pending = this.store.getCabinetPending();
    for (const doc of pending) {
      this.queue.push(doc.path);
    }
    this.processQueue();
  }

  ensureCabinetDir(): void {
    const dir = path.join(config.vaultPath, CABINET_DIR);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  copyCabinetFile(sourcePath: string, targetFolder: string): { path: string; filename: string } {
    const cabinetDir = path.join(config.vaultPath, CABINET_DIR, targetFolder);
    if (!fs.existsSync(cabinetDir)) fs.mkdirSync(cabinetDir, { recursive: true });

    const filename = path.basename(sourcePath);
    let destFilename = filename;
    let counter = 1;
    while (fs.existsSync(path.join(cabinetDir, destFilename))) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      destFilename = `${base} (${counter})${ext}`;
      counter++;
    }

    fs.copyFileSync(sourcePath, path.join(cabinetDir, destFilename));
    const relPath = path.join(CABINET_DIR, targetFolder, destFilename);
    this.indexDocument(path.join(config.vaultPath, relPath));
    return { path: relPath, filename: destFilename };
  }
}
