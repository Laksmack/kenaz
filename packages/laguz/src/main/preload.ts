import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { LaguzIPC } from '../shared/ipc-channels';

const api = {
  platform: process.platform,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  search: (params: { q?: string; type?: string; company?: string; since?: string; tags?: string }) =>
    ipcRenderer.invoke(LaguzIPC.SEARCH, params),
  getNote: (path: string) => ipcRenderer.invoke(LaguzIPC.GET_NOTE, path),
  getMeetings: (company: string, since?: string) => ipcRenderer.invoke(LaguzIPC.GET_MEETINGS, company, since),
  getAccount: (path: string) => ipcRenderer.invoke(LaguzIPC.GET_ACCOUNT, path),
  getSubfolders: (parentPath: string) => ipcRenderer.invoke(LaguzIPC.GET_SUBFOLDERS, parentPath),
  getFolderNotes: (folderPath: string) => ipcRenderer.invoke(LaguzIPC.GET_FOLDER_NOTES, folderPath),
  getUnprocessed: (since?: string) => ipcRenderer.invoke(LaguzIPC.GET_UNPROCESSED, since),
  writeNote: (path: string, content: string) => ipcRenderer.invoke(LaguzIPC.WRITE_NOTE, path, content),
  updateFrontmatter: (path: string, fields: Record<string, any>) => ipcRenderer.invoke(LaguzIPC.UPDATE_FRONTMATTER, path, fields),
  getCompanies: () => ipcRenderer.invoke(LaguzIPC.GET_COMPANIES),
  getRecent: (limit?: number) => ipcRenderer.invoke(LaguzIPC.GET_RECENT, limit),
  readFile: (filePath: string) => ipcRenderer.invoke(LaguzIPC.READ_FILE, filePath),
  readFileBase64: (filePath: string) => ipcRenderer.invoke(LaguzIPC.READ_FILE_BASE64, filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke(LaguzIPC.WRITE_FILE, filePath, content),
  createFile: (filePath: string, content?: string) => ipcRenderer.invoke(LaguzIPC.CREATE_FILE, filePath, content),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke(LaguzIPC.RENAME_FILE, oldPath, newPath),
  deleteFile: (filePath: string) => ipcRenderer.invoke(LaguzIPC.DELETE_FILE, filePath),
  getVaultFiles: (ext?: string) => ipcRenderer.invoke(LaguzIPC.GET_VAULT_FILES, ext),
  copyAttachment: (sourcePath: string) => ipcRenderer.invoke(LaguzIPC.COPY_ATTACHMENT, sourcePath),
  readExternalFile: (filePath: string) => ipcRenderer.invoke(LaguzIPC.READ_EXTERNAL_FILE, filePath),
  getConfig: () => ipcRenderer.invoke(LaguzIPC.GET_CONFIG),
  saveConfig: (config: any) => ipcRenderer.invoke(LaguzIPC.SAVE_CONFIG, config),

  // DOCX
  readDocxHtml: (filePath: string) => ipcRenderer.invoke(LaguzIPC.READ_DOCX_HTML, filePath),
  convertDocxToPdf: (filePath: string, outputPath?: string) => ipcRenderer.invoke(LaguzIPC.CONVERT_DOCX_TO_PDF, filePath, outputPath),

  // PDF
  readPdfBase64: (filePath: string) => ipcRenderer.invoke(LaguzIPC.READ_PDF_BASE64, filePath),
  readPdfText: (filePath: string) => ipcRenderer.invoke(LaguzIPC.READ_PDF_TEXT, filePath),
  getPdfInfo: (filePath: string) => ipcRenderer.invoke(LaguzIPC.GET_PDF_INFO, filePath),
  addPdfAnnotation: (filePath: string, annotation: any) => ipcRenderer.invoke(LaguzIPC.ADD_PDF_ANNOTATION, filePath, annotation),
  placePdfSignature: (filePath: string, page: number, rect: any, signatureName?: string) =>
    ipcRenderer.invoke(LaguzIPC.PLACE_PDF_SIGNATURE, filePath, page, rect, signatureName),
  placePdfSignatureRaw: (filePath: string, page: number, rect: any, pngBase64: string) =>
    ipcRenderer.invoke(LaguzIPC.PLACE_PDF_SIGNATURE_RAW, filePath, page, rect, pngBase64),
  flattenPdf: (filePath: string, outputPath?: string) => ipcRenderer.invoke(LaguzIPC.FLATTEN_PDF, filePath, outputPath),
  fillPdfField: (filePath: string, fieldRect: any, value: string) => ipcRenderer.invoke(LaguzIPC.FILL_PDF_FIELD, filePath, fieldRect, value),
  readSidecar: (pdfPath: string) => ipcRenderer.invoke(LaguzIPC.READ_SIDECAR, pdfPath),
  writeSidecar: (pdfPath: string, content: string) => ipcRenderer.invoke(LaguzIPC.WRITE_SIDECAR, pdfPath, content),

  // Signatures
  getSignatures: () => ipcRenderer.invoke(LaguzIPC.GET_SIGNATURES),
  saveSignature: (name: string, pngBase64: string) => ipcRenderer.invoke(LaguzIPC.SAVE_SIGNATURE, name, pngBase64),
  deleteSignature: (name: string) => ipcRenderer.invoke(LaguzIPC.DELETE_SIGNATURE, name),
  getProfile: () => ipcRenderer.invoke(LaguzIPC.GET_PROFILE),
  saveProfile: (profile: any) => ipcRenderer.invoke(LaguzIPC.SAVE_PROFILE, profile),
  // Folders
  getVaultFolders: () => ipcRenderer.invoke(LaguzIPC.GET_VAULT_FOLDERS),
  getFolderContext: (folderName: string) => ipcRenderer.invoke(LaguzIPC.GET_FOLDER_CONTEXT, folderName),

  // Cabinet
  getCabinetFolders: (parent?: string) => ipcRenderer.invoke(LaguzIPC.GET_CABINET_FOLDERS, parent),
  getCabinetDocuments: (folder?: string, ext?: string) => ipcRenderer.invoke(LaguzIPC.GET_CABINET_DOCUMENTS, folder, ext),
  searchCabinet: (q: string, filters?: { folder?: string; ext?: string }) => ipcRenderer.invoke(LaguzIPC.SEARCH_CABINET, q, filters),
  getCabinetDocument: (docPath: string) => ipcRenderer.invoke(LaguzIPC.GET_CABINET_DOCUMENT, docPath),
  tagCabinetDocument: (docPath: string, tags: string[]) => ipcRenderer.invoke(LaguzIPC.TAG_CABINET_DOCUMENT, docPath, tags),
  updateCabinetMetadata: (docPath: string, fields: any) => ipcRenderer.invoke(LaguzIPC.UPDATE_CABINET_METADATA, docPath, fields),
  createCabinetFolder: (folderPath: string) => ipcRenderer.invoke(LaguzIPC.CREATE_CABINET_FOLDER, folderPath),
  moveCabinetDocument: (from: string, to: string) => ipcRenderer.invoke(LaguzIPC.MOVE_CABINET_DOCUMENT, from, to),
  getCabinetOcrStatus: () => ipcRenderer.invoke(LaguzIPC.GET_CABINET_OCR_STATUS),
  copyCabinetFile: (sourcePath: string, targetFolder: string) => ipcRenderer.invoke(LaguzIPC.COPY_CABINET_FILE, sourcePath, targetFolder),
  openScanner: (cabinetFolder?: string) => ipcRenderer.invoke(LaguzIPC.OPEN_SCANNER, cabinetFolder),

  // Print
  printFile: (filePath: string) => ipcRenderer.invoke(LaguzIPC.PRINT_FILE, filePath),
  saveFileAs: (filePath: string) => ipcRenderer.invoke(LaguzIPC.SAVE_FILE_AS, filePath),

  // Cross-app
  crossAppFetch: (url: string, options?: any) => ipcRenderer.invoke(LaguzIPC.CROSS_APP_FETCH, url, options),

  // Update
  onUpdateState: (callback: (state: any) => void) => {
    const handler = (_event: any, state: any) => callback(state);
    ipcRenderer.on('update:state', handler);
    return () => { ipcRenderer.removeListener('update:state', handler); };
  },
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),

  // Events from main process
  onOpenFile: (cb: (path: string) => void) => {
    const handler = (_e: any, path: string) => cb(path);
    ipcRenderer.on(LaguzIPC.OPEN_FILE, handler);
    return () => ipcRenderer.removeListener(LaguzIPC.OPEN_FILE, handler);
  },
};

contextBridge.exposeInMainWorld('laguz', api);
