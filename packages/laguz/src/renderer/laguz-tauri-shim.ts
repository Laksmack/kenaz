// Tauri-mode shim for window.laguz.
//
// Only activates when window.laguz is not already defined (i.e. we're NOT
// running inside Electron's contextIsolation bridge). Maps the same API
// surface onto fetch calls against the Laguz Express server on :3144.
//
// Phase 1 PoC scope: covers the read paths (search, get*, list*) and the
// write paths (writeNote, frontmatter, file CRUD). Native-only operations
// (printing, scanner, dialogs, file-open events from main) are stubbed with
// console warnings — those will get Tauri command equivalents in phase 2+.
//
// To delete this file once the renderer migrates to native fetch calls,
// remove the import in main.tsx.

// PoC port: lets the Tauri sidecar run alongside Electron Laguz (which holds :3144).
// Production target is :3144 once Electron is retired.
const API_BASE = 'http://localhost:13144';

function q(params: Record<string, unknown>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

async function jget<T = unknown>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}${q(params)}`);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function jpost<T = unknown>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${res.statusText}`);
  return res.json();
}

function notImpl(method: string) {
  return (..._args: unknown[]) => {
    console.warn(`[laguz-tauri-shim] ${method}() not implemented in Tauri mode`);
    return Promise.resolve(null);
  };
}

// Install when window.laguz is absent (Tauri/browser), OR when we were the
// ones who installed it — the latter lets Vite HMR refresh the method table
// without a full page reload. Never clobbers Electron's real preload bridge.
const SHIM_MARKER = '__laguzTauriShimInstalled';
if (typeof (window as any).laguz === 'undefined' || (window as any)[SHIM_MARKER]) {
  console.log('[laguz-tauri-shim] installing fetch-backed window.laguz (Tauri mode)');
  (window as any)[SHIM_MARKER] = true;

  (window as any).laguz = {
    platform: 'darwin',
    getPathForFile: (file: File) => file.name,

    // ── Notes ──────────────────────────────────────────────────
    // HTTP routes wrap arrays in {notes:}, {folders:}, etc. — IPC handlers
    // returned the arrays directly, so we unwrap here to match renderer expectations.
    search: (params: { q?: string; type?: string; company?: string; since?: string; tags?: string }) =>
      jget('/api/search', params).then((r: any) => r.notes ?? r),
    getNote: (path: string) => jget('/api/note', { path }),
    getMeetings: (company: string, since?: string) =>
      jget('/api/meetings', { company, since }).then((r: any) => r.notes ?? r),
    getAccount: (path: string) => jget('/api/account', { path }).then((r: any) => r.notes ?? r),
    // Renderer often calls with '' for root — coerce to '.'
    getSubfolders: (parentPath: string) =>
      jget('/api/subfolders', { path: parentPath || '.' }).then((r: any) => r.folders ?? r.subfolders ?? r),
    getFolderNotes: (folderPath: string) =>
      jget('/api/folder', { path: folderPath }).then((r: any) => r.notes ?? r),
    getUnprocessed: (since?: string) =>
      jget('/api/unprocessed', { since }).then((r: any) => r.notes ?? r),
    getCompanies: () => jget('/api/companies').then((r: any) => r.companies ?? r),
    getRecent: (limit?: number) =>
      jget('/api/recent', { limit }).then((r: any) => r.notes ?? r),
    getVaultFolders: () => jget('/api/folders').then((r: any) => r.folders ?? r),
    getFolderContext: (folderName: string) => jget('/api/context', { name: folderName }),

    // ── Writes ────────────────────────────────────────────────
    writeNote: (path: string, content: string) => jpost('/api/note', { path, content }),
    updateFrontmatter: (path: string, fields: Record<string, unknown>) =>
      jpost('/api/note/frontmatter', { path, fields }),

    // ── Files ─────────────────────────────────────────────────
    readFile: (filePath: string) =>
      jget('/api/vault/read', { path: filePath }).then((r: any) => r.content),
    readFileBase64: (filePath: string) =>
      jget('/api/vault/read-base64', { path: filePath }).then((r: any) => r.base64),
    writeFile: notImpl('writeFile'),
    createFile: notImpl('createFile'),
    renameFile: notImpl('renameFile'),
    deleteFile: notImpl('deleteFile'),
    getVaultFiles: (ext?: string) =>
      jget('/api/vault/files', { ext }).then((r: any) => r.files ?? r),
    copyAttachment: notImpl('copyAttachment'),
    readExternalFile: notImpl('readExternalFile'),

    // ── Config ────────────────────────────────────────────────
    getConfig: () => jget('/api/config'),
    saveConfig: (cfg: unknown) => jpost('/api/config', cfg),

    // ── DOCX / PDF ────────────────────────────────────────────
    readDocxHtml: notImpl('readDocxHtml'),
    convertDocxToPdf: notImpl('convertDocxToPdf'),
    readPdfBase64: notImpl('readPdfBase64'),
    readPdfText: (filePath: string) => jget('/api/pdf/text', { path: filePath }),
    getPdfInfo: (filePath: string) => jget('/api/pdf/info', { path: filePath }),
    addPdfAnnotation: (filePath: string, annotation: unknown) =>
      jpost('/api/pdf/annotate', { path: filePath, annotation }),
    placePdfSignature: notImpl('placePdfSignature'),
    placePdfSignatureRaw: notImpl('placePdfSignatureRaw'),
    flattenPdf: (filePath: string, outputPath?: string) =>
      jpost('/api/pdf/flatten', { path: filePath, outputPath }),
    fillPdfField: (filePath: string, fieldRect: unknown, value: string) =>
      jpost('/api/pdf/fill-field', { path: filePath, fieldRect, value }),
    readSidecar: (pdfPath: string) => jget('/api/pdf/sidecar', { path: pdfPath }),
    writeSidecar: (pdfPath: string, content: string) =>
      jpost('/api/pdf/sidecar', { path: pdfPath, content }),

    // ── Signatures / profile ──────────────────────────────────
    getSignatures: notImpl('getSignatures'),
    saveSignature: notImpl('saveSignature'),
    deleteSignature: notImpl('deleteSignature'),
    getProfile: notImpl('getProfile'),
    saveProfile: notImpl('saveProfile'),

    // ── Cabinet ───────────────────────────────────────────────
    getCabinetFolders: (parent?: string) =>
      jget('/api/cabinet/folders', { parent }).then((r: any) => r.folders ?? r),
    getCabinetDocuments: (folder?: string, ext?: string) =>
      jget('/api/cabinet/documents', { folder, ext }).then((r: any) => r.documents ?? r),
    searchCabinet: (q: string, filters?: { folder?: string; ext?: string }) =>
      jget('/api/cabinet/search', { q, ...(filters ?? {}) }).then((r: any) => r.documents ?? r.results ?? r),
    getCabinetDocument: (docPath: string) => jget('/api/cabinet/document', { path: docPath }),
    tagCabinetDocument: (docPath: string, tags: string[]) =>
      jpost('/api/cabinet/tag', { path: docPath, tags }),
    updateCabinetMetadata: (docPath: string, fields: unknown) =>
      jpost('/api/cabinet/metadata', { path: docPath, fields }),
    createCabinetFolder: (folderPath: string) =>
      jpost('/api/cabinet/mkdir', { path: folderPath }),
    moveCabinetDocument: (from: string, to: string) =>
      jpost('/api/cabinet/move', { from, to }),
    getCabinetOcrStatus: () => jget('/api/cabinet/ocr-status'),
    copyCabinetFile: notImpl('copyCabinetFile'),
    openScanner: notImpl('openScanner'),

    // ── Native-only (stub) ────────────────────────────────────
    printFile: notImpl('printFile'),
    saveFileAs: notImpl('saveFileAs'),
    crossAppFetch: (url: string, options?: RequestInit) =>
      fetch(url, options).then(async (r) => ({
        ok: r.ok,
        status: r.status,
        text: await r.text(),
      })),

    // ── Updates ───────────────────────────────────────────────
    onUpdateState: (_cb: (state: unknown) => void) => () => {
      /* no-op unsubscribe */
    },
    checkForUpdates: notImpl('checkForUpdates'),
    installUpdate: notImpl('installUpdate'),

    // ── Events from main ──────────────────────────────────────
    onOpenFile: (_cb: (path: string) => void) => () => {
      /* no-op */
    },
  };
}

export {};
