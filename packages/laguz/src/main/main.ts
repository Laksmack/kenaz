import { app, BrowserWindow, shell, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

import { initAutoUpdater, getUpdateMenuItems } from '@futhark/core/lib/auto-updater';

// Catch fatal errors during module loading
process.on('uncaughtException', (e) => {
  const msg = `[Laguz] FATAL uncaught exception: ${e?.message ?? e}\n${e?.stack ?? ''}`;
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), `${new Date().toISOString()} ${msg}\n`); } catch {}
  console.error(msg);
});

import { config } from './config';
import { startApiServer, setCabinetService } from './api-server';
import { VaultStore } from './vault-store';
import { VaultWatcher } from './watcher';
import { LaguzConfigManager } from './laguz-config';
import { CabinetService } from './cabinet-service';
import * as pdfService from './pdf-service';
import { SignatureStore } from './signature-store';

let mainWindow: BrowserWindow | null = null;
let store: VaultStore;
let watcher: VaultWatcher;
let configManager: LaguzConfigManager;
let signatureStore: SignatureStore;
let cabinetService: CabinetService;
let pendingFilePath: string | null = null;

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log(`[Laguz] v${app.getVersion()} — ${isDev ? 'development' : 'production'}`);
  console.log('[Laguz] __dirname:', __dirname);
  console.log('[Laguz] preload path:', preloadPath);
  console.log('[Laguz] vault path:', config.vaultPath);

  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#0f1a1e',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    const devURL = 'http://localhost:5177';
    mainWindow.loadURL(devURL).catch(() => {
      console.log('[Laguz] Vite not ready, retrying in 2s...');
      setTimeout(() => mainWindow?.loadURL(devURL), 2000);
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const htmlPath = path.join(__dirname, '../../renderer/index.html');
    console.log('[Laguz] Loading HTML from:', htmlPath);
    mainWindow.loadFile(htmlPath);
  }

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.meta && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[Laguz] Failed to load:', errorCode, errorDescription);
    if (isDev && errorCode === -102) {
      console.log('[Laguz] Connection refused — Vite probably not ready, retrying...');
      setTimeout(() => {
        mainWindow?.loadURL('http://localhost:5177');
      }, 2000);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    console.log('[Laguz] Window closed');
    mainWindow = null;
  });
}

// ── MCP ─────────────────────────────────────────────────────
// Unified Futhark MCP server installed to ~/.futhark/ on startup.

// ── IPC Handlers ─────────────────────────────────────────────

function registerIpcHandlers() {
  ipcMain.handle('laguz:search', async (_event, params: any) => {
    return store.search(params.q || '', {
      type: params.type,
      company: params.company,
      since: params.since,
      tags: params.tags ? params.tags.split(',') : undefined,
    });
  });

  ipcMain.handle('laguz:getNote', async (_event, notePath: string) => {
    return store.getNote(notePath);
  });

  ipcMain.handle('laguz:getMeetings', async (_event, company: string, since?: string) => {
    return store.getMeetings(company, since);
  });

  ipcMain.handle('laguz:getAccount', async (_event, folderPath: string) => {
    return store.getAccount(folderPath);
  });

  ipcMain.handle('laguz:getSubfolders', async (_event, parentPath: string) => {
    return store.getSubfolders(parentPath);
  });

  ipcMain.handle('laguz:getFolderNotes', async (_event, folderPath: string) => {
    return store.getFolderNotes(folderPath);
  });

  ipcMain.handle('laguz:getUnprocessed', async (_event, since?: string) => {
    return store.getUnprocessed(since);
  });

  ipcMain.handle('laguz:writeNote', async (_event, notePath: string, content: string) => {
    store.writeNote(notePath, content);
    return store.getNote(notePath);
  });

  ipcMain.handle('laguz:updateFrontmatter', async (_event, notePath: string, fields: Record<string, any>) => {
    return store.updateFrontmatter(notePath, fields);
  });

  ipcMain.handle('laguz:getCompanies', async () => {
    return store.getCompanies();
  });

  ipcMain.handle('laguz:readFile', async (_event, filePath: string) => {
    return store.readFile(filePath);
  });

  ipcMain.handle('laguz:readFileBase64', async (_event, filePath: string) => {
    const abs = filePath.startsWith('/') ? filePath : path.join(config.vaultPath, filePath);
    return fs.readFileSync(abs).toString('base64');
  });

  ipcMain.handle('laguz:writeFile', async (_event, filePath: string, content: string) => {
    const abs = filePath.startsWith('/') ? filePath : require('path').join(config.vaultPath, filePath);
    require('fs').writeFileSync(abs, content, 'utf-8');
    return { success: true };
  });

  ipcMain.handle('laguz:createFile', async (_event, filePath: string, content?: string) => {
    const abs = filePath.startsWith('/') ? filePath : path.join(config.vaultPath, filePath);
    const dir = path.dirname(abs);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(abs, content ?? '', 'utf-8');
    if (/\.(md|markdown|mdx)$/i.test(filePath)) {
      store.writeNote(filePath, content ?? '');
      return store.getNote(filePath);
    }
    return { path: filePath, success: true };
  });

  ipcMain.handle('laguz:renameFile', async (_event, oldPath: string, newPath: string) => {
    const absOld = oldPath.startsWith('/') ? oldPath : path.join(config.vaultPath, oldPath);
    const absNew = newPath.startsWith('/') ? newPath : path.join(config.vaultPath, newPath);
    const dir = path.dirname(absNew);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(absOld, absNew);
    return { oldPath, newPath, success: true };
  });

  ipcMain.handle('laguz:deleteFile', async (_event, filePath: string) => {
    const abs = filePath.startsWith('/') ? filePath : path.join(config.vaultPath, filePath);
    fs.unlinkSync(abs);
    return { path: filePath, success: true };
  });

  ipcMain.handle('laguz:getRecent', async (_event, limit?: number) => {
    return store.getRecent(limit);
  });

  ipcMain.handle('laguz:getVaultFiles', async (_event, ext?: string) => {
    return store.getVaultFiles(ext);
  });

  ipcMain.handle('laguz:getConfig', async () => {
    return configManager.get();
  });

  ipcMain.handle('laguz:saveConfig', async (_event, newConfig: any) => {
    configManager.save(newConfig);
    return configManager.get();
  });

  // ── Attachment / Drop Handlers ───────────────────────────────

  ipcMain.handle('laguz:copyAttachment', async (_event, sourcePath: string) => {
    const filename = path.basename(sourcePath);
    const attachDir = path.join(config.vaultPath, '_attachments');
    if (!fs.existsSync(attachDir)) fs.mkdirSync(attachDir, { recursive: true });

    let destFilename = filename;
    let counter = 1;
    while (fs.existsSync(path.join(attachDir, destFilename))) {
      const ext = path.extname(filename);
      const base = path.basename(filename, ext);
      destFilename = `${base} (${counter})${ext}`;
      counter++;
    }

    fs.copyFileSync(sourcePath, path.join(attachDir, destFilename));
    store.indexFile(path.join(attachDir, destFilename));
    return { path: `_attachments/${destFilename}`, filename: destFilename };
  });

  ipcMain.handle('laguz:readExternalFile', async (_event, filePath: string) => {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { content, filename: path.basename(filePath) };
  });

  // ── DOCX Handlers ──────────────────────────────────────────

  ipcMain.handle('laguz:readDocxHtml', async (_event, filePath: string) => {
    const mammoth = require('mammoth');
    const abs = filePath.startsWith('/') ? filePath : path.join(config.vaultPath, filePath);
    const result = await mammoth.convertToHtml({ path: abs });
    return { html: result.value as string, messages: result.messages };
  });

  ipcMain.handle('laguz:convertDocxToPdf', async (_event, filePath: string, outputPath?: string) => {
    const mammoth = require('mammoth');
    const abs = filePath.startsWith('/') ? filePath : path.join(config.vaultPath, filePath);
    const result = await mammoth.convertToHtml({ path: abs });
    const html = result.value as string;

    const styledHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif;
         font-size: 11pt; line-height: 1.5; color: #222; max-width: 7.5in;
         margin: 0.75in auto; padding: 0; }
  h1 { font-size: 18pt; margin: 18pt 0 8pt; }
  h2 { font-size: 15pt; margin: 16pt 0 6pt; }
  h3 { font-size: 13pt; margin: 14pt 0 4pt; }
  p { margin: 0 0 8pt; }
  table { border-collapse: collapse; width: 100%; margin: 8pt 0; }
  td, th { border: 1px solid #ccc; padding: 4pt 8pt; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  img { max-width: 100%; }
  ul, ol { margin: 0 0 8pt; padding-left: 24pt; }
</style></head><body>${html}</body></html>`;

    const pdfOut = outputPath
      ? (outputPath.startsWith('/') ? outputPath : path.join(config.vaultPath, outputPath))
      : abs.replace(/\.docx?$/i, '.pdf');

    const hiddenWin = new BrowserWindow({
      show: false, width: 816, height: 1056,
      webPreferences: { offscreen: true },
    });

    try {
      await hiddenWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(styledHtml)}`);
      await new Promise(r => setTimeout(r, 500));
      const pdfData = await hiddenWin.webContents.printToPDF({
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      });
      fs.writeFileSync(pdfOut, pdfData);
    } finally {
      hiddenWin.destroy();
    }

    const vaultPath = config.vaultPath;
    const relative = pdfOut.startsWith(vaultPath + '/')
      ? pdfOut.slice(vaultPath.length + 1) : pdfOut;
    return { pdfPath: relative, absolutePath: pdfOut };
  });

  // ── PDF Handlers ────────────────────────────────────────────

  ipcMain.handle('laguz:readPdfBase64', async (_event, filePath: string) => {
    return pdfService.readPdfBase64(filePath);
  });

  ipcMain.handle('laguz:readPdfText', async (_event, filePath: string) => {
    return pdfService.readPdfText(filePath);
  });

  ipcMain.handle('laguz:getPdfInfo', async (_event, filePath: string) => {
    return pdfService.getPdfInfo(filePath);
  });

  ipcMain.handle('laguz:addPdfAnnotation', async (_event, filePath: string, annotation: any) => {
    await pdfService.addAnnotation(filePath, annotation);
    return { success: true };
  });

  ipcMain.handle('laguz:placePdfSignature', async (_event, filePath: string, page: number, rect: any, signatureName?: string) => {
    const sig = signatureStore.get(signatureName);
    if (!sig) throw new Error('No signature found');
    await pdfService.placeSignature(filePath, page, rect, sig);
    return { success: true };
  });

  ipcMain.handle('laguz:placePdfSignatureRaw', async (_event, filePath: string, page: number, rect: any, pngBase64: string) => {
    await pdfService.placeSignature(filePath, page, rect, pngBase64);
    return { success: true };
  });

  ipcMain.handle('laguz:flattenPdf', async (_event, filePath: string, outputPath?: string) => {
    const result = await pdfService.flattenPdf(filePath, outputPath);
    return { outputPath: result };
  });

  ipcMain.handle('laguz:fillPdfField', async (_event, filePath: string, fieldRect: any, value: string) => {
    await pdfService.fillField(filePath, fieldRect, value);
    return { success: true };
  });

  ipcMain.handle('laguz:readSidecar', async (_event, pdfPath: string) => {
    return pdfService.readSidecar(pdfPath);
  });

  ipcMain.handle('laguz:writeSidecar', async (_event, pdfPath: string, content: string) => {
    pdfService.writeSidecar(pdfPath, content);
    return { success: true };
  });

  // ── Signature Handlers ────────────────────────────────────────

  ipcMain.handle('laguz:getSignatures', async () => {
    return signatureStore.list();
  });

  ipcMain.handle('laguz:saveSignature', async (_event, name: string, pngBase64: string) => {
    signatureStore.save(name, pngBase64);
    return { success: true };
  });

  ipcMain.handle('laguz:deleteSignature', async (_event, name: string) => {
    signatureStore.remove(name);
    return { success: true };
  });

  ipcMain.handle('laguz:getProfile', async () => {
    return signatureStore.getProfile();
  });

  ipcMain.handle('laguz:saveProfile', async (_event, profile: any) => {
    signatureStore.saveProfile(profile);
    return { success: true };
  });

  // ── Folder Handlers ──────────────────────────────────────────

  ipcMain.handle('laguz:getVaultFolders', async () => {
    return store.getAllFolders();
  });

  ipcMain.handle('laguz:getFolderContext', async (_event, folderName: string) => {
    const allFolders = store.getAllFolders();
    const folder = allFolders.find(f => f.name === folderName)
      || allFolders.find(f => f.path === folderName);
    const notes = folder ? store.getFolderNotes(folder.path) : [];

    const fetchJson = async (url: string, timeoutMs = 3000) => {
      try {
        const res = await fetch(url, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        return res.json();
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

    return {
      folder: folder?.path || folderName,
      notes,
      emails,
      tasks,
      events,
    };
  });

  // ── Cabinet Handlers ──────────────────────────────────────────

  ipcMain.handle('laguz:getCabinetFolders', async (_event, parent?: string) => {
    return store.getCabinetFolders(parent);
  });

  ipcMain.handle('laguz:getCabinetDocuments', async (_event, folder?: string, ext?: string) => {
    return store.getCabinetDocuments(folder, ext);
  });

  ipcMain.handle('laguz:searchCabinet', async (_event, q: string, filters?: { folder?: string; ext?: string }) => {
    return store.searchCabinet(q, filters);
  });

  ipcMain.handle('laguz:getCabinetDocument', async (_event, docPath: string) => {
    return store.getCabinetDocument(docPath);
  });

  ipcMain.handle('laguz:tagCabinetDocument', async (_event, docPath: string, tags: string[]) => {
    store.tagCabinetDocument(docPath, tags);
    return { success: true };
  });

  ipcMain.handle('laguz:createCabinetFolder', async (_event, folderPath: string) => {
    store.createCabinetFolder(folderPath);
    return { success: true };
  });

  ipcMain.handle('laguz:moveCabinetDocument', async (_event, from: string, to: string) => {
    return store.moveCabinetDocument(from, to);
  });

  ipcMain.handle('laguz:getCabinetOcrStatus', async () => {
    return store.getCabinetOcrStatus();
  });

  ipcMain.handle('laguz:copyCabinetFile', async (_event, sourcePath: string, targetFolder: string) => {
    return cabinetService.copyCabinetFile(sourcePath, targetFolder || '');
  });

  ipcMain.handle('laguz:openScanner', async (_event, cabinetFolder?: string) => {
    if (process.platform !== 'darwin') return { supported: false };

    const targetDir = path.join(config.vaultPath, '_cabinet', cabinetFolder || '');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    // Open Image Capture and reveal the target folder so the user knows where to save
    const { exec } = require('child_process');
    exec('open -a "Image Capture"');
    shell.openPath(targetDir);

    return { supported: true, saveTo: targetDir };
  });

  // Cross-app
  ipcMain.handle('cross-app:fetch', async (_event, url: string, options?: any) => {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cross-app request failed (${res.status}): ${text}`);
    }
    return res.json();
  });
}

async function initServices() {
  console.log('[Laguz] Initializing services...');
  configManager = new LaguzConfigManager();
  store = new VaultStore();
  signatureStore = new SignatureStore();
  cabinetService = new CabinetService(store);
  cabinetService.ensureCabinetDir();

  setCabinetService(cabinetService);

  try {
    startApiServer(store, signatureStore, config.apiPort);
  } catch (e: any) {
    console.error('[Laguz] API server failed to start:', e.message);
  }

  watcher = new VaultWatcher(store);
  watcher.setCabinetService(cabinetService);
  await watcher.start();

  cabinetService.reprocessPending();

  console.log('[Laguz] Services initialized');
}

// ── Open File Handler ─────────────────────────────────────────

function sendFileToRenderer(filePath: string) {
  const abs = path.resolve(filePath);
  const vaultPath = config.vaultPath;
  const relative = abs.startsWith(vaultPath + '/')
    ? abs.slice(vaultPath.length + 1)
    : abs;
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('laguz:open-file', relative);
  } else {
    pendingFilePath = relative;
  }
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  sendFileToRenderer(filePath);
});

// ── Default .md Viewer ────────────────────────────────────────

function getAppBundlePath(): string | null {
  if (process.platform !== 'darwin') return null;
  const exePath = app.getPath('exe');
  const match = exePath.match(/^(.+\.app)\//);
  return match ? match[1] : null;
}

function isDefaultMdViewer(): boolean {
  if (process.platform !== 'darwin') return false;
  const appBundle = getAppBundlePath();
  if (!appBundle) return false;
  try {
    const result = execSync(
      `swift -e 'import AppKit; import UniformTypeIdentifiers; if let t = UTType(filenameExtension: "md"), let u = NSWorkspace.shared.urlForApplication(toOpen: t) { print(u.path) }'`,
      { encoding: 'utf8', timeout: 10000 }
    ).trim();
    return result === appBundle;
  } catch { return false; }
}

function setDefaultMdViewer(): boolean {
  if (process.platform !== 'darwin') return false;
  const appBundle = getAppBundlePath();
  if (!appBundle) return false;
  try {
    execSync(
      `swift -e '
import AppKit
import UniformTypeIdentifiers
let app = URL(fileURLWithPath: "${appBundle}")
let types: [UTType] = [.init(filenameExtension: "md")!, .init(filenameExtension: "markdown")!].compactMap { $0 }
let group = DispatchGroup()
for t in types {
    group.enter()
    NSWorkspace.shared.setDefaultApplication(at: app, toOpenContentType: t) { _ in group.leave() }
}
group.wait()
'`,
      { encoding: 'utf8', timeout: 15000 }
    );
    return true;
  } catch (e: any) {
    console.error('[Laguz] Failed to set default .md viewer:', e.message);
    return false;
  }
}

// ── App Menu ──────────────────────────────────────────────────

function buildAppMenu() {
  const isMac = process.platform === 'darwin';
  const isDefault = isDefaultMdViewer();

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        ...getUpdateMenuItems(),
        { type: 'separator' as const },
        {
          label: isDefault ? 'Default .md Viewer \u2713' : 'Make Default .md Viewer',
          enabled: !isDefault,
          click: () => {
            if (setDefaultMdViewer()) {
              buildAppMenu();
            }
          },
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── App Lifecycle ────────────────────────────────────────────

async function installFutharkMcp() {
  try {
    const corePkg = require.resolve('@futhark/core/package.json');
    const installerPath = path.join(path.dirname(corePkg), 'dist', 'mcp', 'installer.js');
    const bundlePath = path.join(path.dirname(corePkg), 'dist', 'mcp', 'futhark-mcp.js');
    const { ensureFutharkMcp } = require(installerPath);
    await ensureFutharkMcp({
      bundlePath,
      showPrompt: async (msg: string) => {
        const { response } = await dialog.showMessageBox({
          type: 'question',
          buttons: ['Register', 'Not Now'],
          defaultId: 0,
          title: 'Futhark MCP',
          message: msg,
        });
        return response === 0;
      },
    });
  } catch (e: any) {
    console.error('[Laguz] Failed to install Futhark MCP:', e.message);
  }
}

app.whenReady().then(async () => {
  console.log('[Laguz] app ready');
  try {
    await initServices();
  } catch (e: any) {
    console.error('[Laguz] initServices failed:', e);
  }
  registerIpcHandlers();
  createWindow();

  try {
    buildAppMenu();
  } catch (e: any) {
    console.error('[Laguz] buildAppMenu failed:', e.message);
  }

  initAutoUpdater(mainWindow!, buildAppMenu);
  installFutharkMcp();

  // Send any file that was opened before the window was ready
  if (mainWindow && pendingFilePath) {
    mainWindow.webContents.on('did-finish-load', () => {
      if (pendingFilePath) {
        mainWindow?.webContents.send('laguz:open-file', pendingFilePath);
        pendingFilePath = null;
      }
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  console.log('[Laguz] All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  console.log('[Laguz] will-quit event');
});

app.on('before-quit', () => {
  console.log('[Laguz] before-quit event');
  watcher?.stop();
  store?.close();
});

process.on('uncaughtException', (e) => {
  console.error('[Laguz] Uncaught exception:', e);
});

process.on('unhandledRejection', (e) => {
  console.error('[Laguz] Unhandled rejection:', e);
});
