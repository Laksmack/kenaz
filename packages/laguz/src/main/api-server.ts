import express from 'express';
import path from 'path';
import fs from 'fs';
import type { VaultStore } from './vault-store';
import type { SignatureStore } from './signature-store';
import * as pdfService from './pdf-service';
import { detectPdfFields } from './pdf-fields';
import { config } from './config';

let mammoth: any;
try {
  mammoth = require('mammoth');
} catch {
  console.warn('[Laguz] mammoth not available — DOCX text extraction disabled');
}

export function startApiServer(store: VaultStore, signatureStore: SignatureStore, port: number) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // ── Search ─────────────────────────────────────────────────

  app.get('/api/search', (req, res) => {
    try {
      const q = (req.query.q as string) || '';
      const type = req.query.type as string | undefined;
      const company = req.query.company as string | undefined;
      const since = req.query.since as string | undefined;
      const tags = req.query.tags ? (req.query.tags as string).split(',') : undefined;
      const notes = store.search(q, { type, company, since, tags });
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Get Note ───────────────────────────────────────────────

  app.get('/api/note', (req, res) => {
    try {
      const notePath = req.query.path as string;
      if (!notePath) return res.status(400).json({ error: 'path is required' });
      const note = store.getNote(notePath);
      if (!note) return res.status(404).json({ error: 'Note not found' });
      res.json(note);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Meetings ───────────────────────────────────────────────

  app.get('/api/meetings', (req, res) => {
    try {
      const company = req.query.company as string;
      if (!company) return res.status(400).json({ error: 'company is required' });
      const since = req.query.since as string | undefined;
      const notes = store.getMeetings(company, since);
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Account ────────────────────────────────────────────────

  app.get('/api/account', (req, res) => {
    try {
      const folderPath = req.query.path as string;
      if (!folderPath) return res.status(400).json({ error: 'path is required' });
      const notes = store.getAccount(folderPath);
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Subfolders ──────────────────────────────────────────────

  app.get('/api/subfolders', (req, res) => {
    try {
      const parentPath = req.query.path as string;
      if (!parentPath) return res.status(400).json({ error: 'path is required' });
      const subfolders = store.getSubfolders(parentPath);
      res.json({ subfolders });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Folder Notes ────────────────────────────────────────────

  app.get('/api/folder', (req, res) => {
    try {
      const folderPath = req.query.path as string;
      if (!folderPath) return res.status(400).json({ error: 'path is required' });
      const notes = store.getFolderNotes(folderPath);
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Unprocessed ────────────────────────────────────────────

  app.get('/api/unprocessed', (req, res) => {
    try {
      const since = req.query.since as string | undefined;
      const notes = store.getUnprocessed(since);
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Companies ──────────────────────────────────────────────

  app.get('/api/companies', (_req, res) => {
    try {
      const companies = store.getCompanies();
      res.json({ companies });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Recent ────────────────────────────────────────────────

  app.get('/api/recent', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const notes = store.getRecent(limit);
      res.json({ notes });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Write Note ─────────────────────────────────────────────

  app.post('/api/note', (req, res) => {
    try {
      const { path: notePath, content } = req.body;
      if (!notePath || content == null) {
        return res.status(400).json({ error: 'path and content are required' });
      }
      store.writeNote(notePath, content);
      const note = store.getNote(notePath);
      res.json(note);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/note/fields', (req, res) => {
    try {
      const { path: notePath, fields } = req.body;
      if (!notePath || !Array.isArray(fields) || !fields.length) {
        return res.status(400).json({ error: 'path and fields[] are required' });
      }
      const result = store.getFields(notePath, fields);
      res.json(result);
    } catch (e: any) {
      const status = e.message?.includes('not found') ? 404 : 500;
      res.status(status).json({ error: e.message });
    }
  });

  app.post('/api/note/frontmatter', (req, res) => {
    try {
      const { path: notePath, fields } = req.body;
      if (!notePath || !fields || typeof fields !== 'object') {
        return res.status(400).json({ error: 'path and fields are required' });
      }
      const result = store.updateFrontmatter(notePath, fields);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PDF: Text Extraction ───────────────────────────────────

  app.get('/api/pdf/text', async (req, res) => {
    try {
      const pdfPath = req.query.path as string;
      if (!pdfPath) return res.status(400).json({ error: 'path is required' });
      const text = await pdfService.readPdfText(pdfPath);
      res.json({ path: pdfPath, text });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PDF: Info ─────────────────────────────────────────────

  app.get('/api/pdf/info', async (req, res) => {
    try {
      const pdfPath = req.query.path as string;
      if (!pdfPath) return res.status(400).json({ error: 'path is required' });
      const info = await pdfService.getPdfInfo(pdfPath);
      res.json({ path: pdfPath, ...info });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PDF: Fields Detection ─────────────────────────────────

  app.get('/api/pdf/fields', async (req, res) => {
    try {
      const pdfPath = req.query.path as string;
      if (!pdfPath) return res.status(400).json({ error: 'path is required' });
      const text = await pdfService.readPdfText(pdfPath);
      const fields = detectPdfFields(text);
      res.json({ path: pdfPath, fields });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PDF: Add Annotation ───────────────────────────────────

  app.post('/api/pdf/annotate', async (req, res) => {
    try {
      const { path: pdfPath, annotation } = req.body;
      if (!pdfPath || !annotation) return res.status(400).json({ error: 'path and annotation are required' });
      await pdfService.addAnnotation(pdfPath, annotation);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PDF: Fill Field ───────────────────────────────────────

  app.post('/api/pdf/fill-field', async (req, res) => {
    try {
      const { path: pdfPath, field_rect, value } = req.body;
      if (!pdfPath || !field_rect || value == null) {
        return res.status(400).json({ error: 'path, field_rect, and value are required' });
      }
      await pdfService.fillField(pdfPath, field_rect, value);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PDF: Place Signature ──────────────────────────────────

  app.post('/api/pdf/sign', async (req, res) => {
    try {
      const { path: pdfPath, page, rect, signature_name } = req.body;
      if (!pdfPath || page == null || !rect) {
        return res.status(400).json({ error: 'path, page, and rect are required' });
      }
      const sigData = signatureStore.get(signature_name);
      if (!sigData) return res.status(404).json({ error: 'No signature found' });
      await pdfService.placeSignature(pdfPath, page, rect, sigData);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PDF: Flatten ──────────────────────────────────────────

  app.post('/api/pdf/flatten', async (req, res) => {
    try {
      const { path: pdfPath, output_path } = req.body;
      if (!pdfPath) return res.status(400).json({ error: 'path is required' });
      const outputPath = await pdfService.flattenPdf(pdfPath, output_path);
      res.json({ success: true, output_path: outputPath });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── PDF: Sidecar Notes ────────────────────────────────────

  app.get('/api/pdf/sidecar', (req, res) => {
    try {
      const pdfPath = req.query.path as string;
      if (!pdfPath) return res.status(400).json({ error: 'path is required' });
      const content = pdfService.readSidecar(pdfPath);
      res.json({ path: pdfPath, content });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/pdf/sidecar', (req, res) => {
    try {
      const { path: pdfPath, content } = req.body;
      if (!pdfPath || content == null) return res.status(400).json({ error: 'path and content are required' });
      pdfService.writeSidecar(pdfPath, content);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Folders ────────────────────────────────────────────────

  app.get('/api/folders', (_req, res) => {
    try {
      const folders = store.getAllFolders();
      res.json({ folders });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/context', async (req, res) => {
    try {
      const folderName = req.query.name as string;
      if (!folderName) return res.status(400).json({ error: 'name is required' });

      const allFolders = store.getAllFolders();
      const folder = allFolders.find(f => f.name === folderName)
        || allFolders.find(f => f.path === folderName);
      const notes = folder ? store.getFolderNotes(folder.path) : [];

      const fetchJson = async (url: string, timeoutMs = 3000) => {
        try {
          const r = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!r.ok) return null;
          return r.json();
        } catch { return null; }
      };

      const [emailData, taskData, taskGroupData, agendaData] = await Promise.all([
        fetchJson(`http://localhost:3141/api/search?q=${encodeURIComponent(folderName)}`),
        fetchJson(`http://localhost:3142/api/search?q=${encodeURIComponent(folderName)}`),
        fetchJson(`http://localhost:3142/api/group/${encodeURIComponent(folderName)}`),
        fetchJson(`http://localhost:3143/api/agenda?days=30`),
      ]);

      const emails = (emailData?.threads || []).slice(0, 10);
      const searchTasks = taskData?.tasks || [];
      const groupTasks = taskGroupData?.tasks || [];
      const taskIds = new Set(searchTasks.map((t: any) => t.id));
      const tasks = [...searchTasks, ...groupTasks.filter((t: any) => !taskIds.has(t.id))].slice(0, 15);
      const nameLower = folderName.toLowerCase();
      const events = (agendaData?.events || [])
        .filter((e: any) =>
          (e.summary || '').toLowerCase().includes(nameLower)
          || (e.description || '').toLowerCase().includes(nameLower))
        .slice(0, 10);

      res.json({ folder: folder?.path || folderName, notes, emails, tasks, events });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Attachment Read (for MCP) ────────────────────────────────

  app.get('/api/attachment/read', async (req, res) => {
    try {
      const filePath = req.query.path as string;
      const pageRange = req.query.page_range as string | undefined;
      if (!filePath) return res.status(400).json({ error: 'path is required' });

      const abs = filePath.startsWith('/') ? filePath : path.join(config.vaultPath, filePath);
      if (!fs.existsSync(abs)) return res.status(404).json({ error: 'File not found' });

      const ext = path.extname(abs).toLowerCase();

      if (ext === '.pdf') {
        let range: { start: number; end: number } | undefined;
        if (pageRange) {
          const parts = pageRange.split('-').map(Number);
          range = { start: parts[0] || 1, end: parts[1] || parts[0] || 1 };
        }
        const text = await pdfService.readPdfText(filePath, range);
        const info = await pdfService.getPdfInfo(filePath);
        return res.json({ type: 'pdf', path: filePath, page_count: info.pageCount, text });
      }

      if (ext === '.docx') {
        if (!mammoth) return res.status(500).json({ error: 'mammoth library not available. Run: npm install mammoth --workspace=@futhark/laguz' });
        const result = await mammoth.extractRawText({ path: abs });
        const text = result.value as string;
        const MAX = 50 * 1024;
        const truncated = text.length > MAX;
        return res.json({
          type: 'docx',
          path: filePath,
          text: truncated ? text.slice(0, MAX) : text,
          truncated,
          ...(truncated && { note: `Truncated to 50KB (full file is ${(text.length / 1024).toFixed(1)} KB)` }),
        });
      }

      if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tiff'].includes(ext)) {
        const stat = fs.statSync(abs);
        return res.json({
          type: 'image',
          path: filePath,
          filename: path.basename(abs),
          size_bytes: stat.size,
          size_human: stat.size < 1024 * 1024
            ? `${(stat.size / 1024).toFixed(1)} KB`
            : `${(stat.size / 1024 / 1024).toFixed(1)} MB`,
          extension: ext.slice(1),
          note: 'Image binary content not included to avoid flooding context. Use the file path to reference this image.',
        });
      }

      // Default: treat as text
      const MAX = 50 * 1024;
      const stat = fs.statSync(abs);
      let raw: string;
      try {
        raw = fs.readFileSync(abs, 'utf-8');
      } catch {
        return res.status(400).json({ error: 'File is not readable as text' });
      }
      const truncated = raw.length > MAX;
      return res.json({
        type: 'text',
        path: filePath,
        text: truncated ? raw.slice(0, MAX) : raw,
        truncated,
        ...(truncated && { note: `Truncated to 50KB (full file is ${(stat.size / 1024).toFixed(1)} KB)` }),
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Health ─────────────────────────────────────────────────

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'laguz', vault_path: config.vaultPath });
  });

  // ── Start Server ──────────────────────────────────────────

  const server = app.listen(port, '127.0.0.1', () => {
    console.log(`[Laguz] API running on http://localhost:${port}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[Laguz] Port ${port} in use, trying ${port + 1}...`);
      server.close();
      app.listen(port + 1, '127.0.0.1', () => {
        console.log(`[Laguz] API running on http://localhost:${port + 1}`);
      });
    }
  });

  return server;
}
