import { contextBridge, ipcRenderer } from 'electron';

const api = {
  platform: process.platform,
  search: (params: { q?: string; type?: string; company?: string; since?: string; tags?: string }) =>
    ipcRenderer.invoke('laguz:search', params),
  getNote: (path: string) => ipcRenderer.invoke('laguz:getNote', path),
  getMeetings: (company: string, since?: string) => ipcRenderer.invoke('laguz:getMeetings', company, since),
  getAccount: (path: string) => ipcRenderer.invoke('laguz:getAccount', path),
  getSubfolders: (parentPath: string) => ipcRenderer.invoke('laguz:getSubfolders', parentPath),
  getFolderNotes: (folderPath: string) => ipcRenderer.invoke('laguz:getFolderNotes', folderPath),
  getUnprocessed: (since?: string) => ipcRenderer.invoke('laguz:getUnprocessed', since),
  writeNote: (path: string, content: string) => ipcRenderer.invoke('laguz:writeNote', path, content),
  getCompanies: () => ipcRenderer.invoke('laguz:getCompanies'),
  getRecent: (limit?: number) => ipcRenderer.invoke('laguz:getRecent', limit),
  readFile: (filePath: string) => ipcRenderer.invoke('laguz:readFile', filePath),
  writeFile: (filePath: string, content: string) => ipcRenderer.invoke('laguz:writeFile', filePath, content),
  createFile: (filePath: string, content?: string) => ipcRenderer.invoke('laguz:createFile', filePath, content),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('laguz:renameFile', oldPath, newPath),
  deleteFile: (filePath: string) => ipcRenderer.invoke('laguz:deleteFile', filePath),
  getConfig: () => ipcRenderer.invoke('laguz:getConfig'),
  saveConfig: (config: any) => ipcRenderer.invoke('laguz:saveConfig', config),

  // Cross-app
  crossAppFetch: (url: string, options?: any) => ipcRenderer.invoke('cross-app:fetch', url, options),

  // Events from main process
  onOpenFile: (cb: (path: string) => void) => {
    const handler = (_e: any, path: string) => cb(path);
    ipcRenderer.on('laguz:open-file', handler);
    return () => ipcRenderer.removeListener('laguz:open-file', handler);
  },
};

contextBridge.exposeInMainWorld('laguz', api);
