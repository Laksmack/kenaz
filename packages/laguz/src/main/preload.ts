import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  platform: process.platform,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  search: (params: { q?: string; type?: string; company?: string; since?: string; tags?: string }) =>
    ipcRenderer.invoke('laguz:search', params),
  getNote: (path: string) => ipcRenderer.invoke('laguz:getNote', path),
  getMeetings: (company: string, since?: string) => ipcRenderer.invoke('laguz:getMeetings', company, since),
  getAccount: (path: string) => ipcRenderer.invoke('laguz:getAccount', path),
  getSubfolders: (parentPath: string) => ipcRenderer.invoke('laguz:getSubfolders', parentPath),
  getFolderNotes: (folderPath: string) => ipcRenderer.invoke('laguz:getFolderNotes', folderPath),
  getUnprocessed: (since?: string) => ipcRenderer.invoke('laguz:getUnprocessed', since),
  writeNote: (path: string, content: string) => ipcRenderer.invoke('laguz:writeNote', path, content),
  updateFrontmatter: (path: string, fields: Record<string, any>) => ipcRenderer.invoke('laguz:updateFrontmatter', path, fields),
  getCompanies: () => ipcRenderer.invoke('laguz:getCompanies'),
  getRecent: (limit?: number) => ipcRenderer.invoke('laguz:getRecent', limit),
  readFile: (filePath: string) => ipcRenderer.invoke('laguz:readFile', filePath),
  readFileBase64: (filePath: string) => ipcRenderer.invoke('laguz:readFileBase64', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('laguz:writeFile', filePath, content),
  createFile: (filePath: string, content?: string) => ipcRenderer.invoke('laguz:createFile', filePath, content),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('laguz:renameFile', oldPath, newPath),
  deleteFile: (filePath: string) => ipcRenderer.invoke('laguz:deleteFile', filePath),
  getVaultFiles: (ext?: string) => ipcRenderer.invoke('laguz:getVaultFiles', ext),
  copyAttachment: (sourcePath: string) => ipcRenderer.invoke('laguz:copyAttachment', sourcePath),
  readExternalFile: (filePath: string) => ipcRenderer.invoke('laguz:readExternalFile', filePath),
  getConfig: () => ipcRenderer.invoke('laguz:getConfig'),
  saveConfig: (config: any) => ipcRenderer.invoke('laguz:saveConfig', config),

  // DOCX
  readDocxHtml: (filePath: string) => ipcRenderer.invoke('laguz:readDocxHtml', filePath),
  convertDocxToPdf: (filePath: string, outputPath?: string) => ipcRenderer.invoke('laguz:convertDocxToPdf', filePath, outputPath),

  // PDF
  readPdfBase64: (filePath: string) => ipcRenderer.invoke('laguz:readPdfBase64', filePath),
  readPdfText: (filePath: string) => ipcRenderer.invoke('laguz:readPdfText', filePath),
  getPdfInfo: (filePath: string) => ipcRenderer.invoke('laguz:getPdfInfo', filePath),
  addPdfAnnotation: (filePath: string, annotation: any) => ipcRenderer.invoke('laguz:addPdfAnnotation', filePath, annotation),
  placePdfSignature: (filePath: string, page: number, rect: any, signatureName?: string) =>
    ipcRenderer.invoke('laguz:placePdfSignature', filePath, page, rect, signatureName),
  placePdfSignatureRaw: (filePath: string, page: number, rect: any, pngBase64: string) =>
    ipcRenderer.invoke('laguz:placePdfSignatureRaw', filePath, page, rect, pngBase64),
  flattenPdf: (filePath: string, outputPath?: string) => ipcRenderer.invoke('laguz:flattenPdf', filePath, outputPath),
  fillPdfField: (filePath: string, fieldRect: any, value: string) => ipcRenderer.invoke('laguz:fillPdfField', filePath, fieldRect, value),
  readSidecar: (pdfPath: string) => ipcRenderer.invoke('laguz:readSidecar', pdfPath),
  writeSidecar: (pdfPath: string, content: string) => ipcRenderer.invoke('laguz:writeSidecar', pdfPath, content),

  // Signatures
  getSignatures: () => ipcRenderer.invoke('laguz:getSignatures'),
  saveSignature: (name: string, pngBase64: string) => ipcRenderer.invoke('laguz:saveSignature', name, pngBase64),
  deleteSignature: (name: string) => ipcRenderer.invoke('laguz:deleteSignature', name),
  getProfile: () => ipcRenderer.invoke('laguz:getProfile'),
  saveProfile: (profile: any) => ipcRenderer.invoke('laguz:saveProfile', profile),
  // Folders
  getVaultFolders: () => ipcRenderer.invoke('laguz:getVaultFolders'),
  getFolderContext: (folderName: string) => ipcRenderer.invoke('laguz:getFolderContext', folderName),

  // Cabinet
  getCabinetFolders: (parent?: string) => ipcRenderer.invoke('laguz:getCabinetFolders', parent),
  getCabinetDocuments: (folder?: string, ext?: string) => ipcRenderer.invoke('laguz:getCabinetDocuments', folder, ext),
  searchCabinet: (q: string, filters?: { folder?: string; ext?: string }) => ipcRenderer.invoke('laguz:searchCabinet', q, filters),
  getCabinetDocument: (docPath: string) => ipcRenderer.invoke('laguz:getCabinetDocument', docPath),
  tagCabinetDocument: (docPath: string, tags: string[]) => ipcRenderer.invoke('laguz:tagCabinetDocument', docPath, tags),
  createCabinetFolder: (folderPath: string) => ipcRenderer.invoke('laguz:createCabinetFolder', folderPath),
  moveCabinetDocument: (from: string, to: string) => ipcRenderer.invoke('laguz:moveCabinetDocument', from, to),
  getCabinetOcrStatus: () => ipcRenderer.invoke('laguz:getCabinetOcrStatus'),
  copyCabinetFile: (sourcePath: string, targetFolder: string) => ipcRenderer.invoke('laguz:copyCabinetFile', sourcePath, targetFolder),

  // Cross-app
  crossAppFetch: (url: string, options?: any) => ipcRenderer.invoke('cross-app:fetch', url, options),

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
    ipcRenderer.on('laguz:open-file', handler);
    return () => ipcRenderer.removeListener('laguz:open-file', handler);
  },
};

contextBridge.exposeInMainWorld('laguz', api);
