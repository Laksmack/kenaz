import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn, timeAgo } from '../lib/utils';
import type { CabinetDocument, CabinetOcrStatus } from '../types';

interface CabinetViewProps {
  activeFilePath: string | null;
  onOpenFile: (path: string, inNewTab?: boolean) => void;
}

const EXT_ICONS: Record<string, string> = {
  pdf: '📄', jpg: '🖼', jpeg: '🖼', png: '🖼', tiff: '🖼', tif: '🖼',
  docx: '📝', doc: '📝', txt: '📃',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function CabinetView({ activeFilePath, onOpenFile }: CabinetViewProps) {
  const [folders, setFolders] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string>('');
  const [folderStack, setFolderStack] = useState<string[]>([]);
  const [documents, setDocuments] = useState<CabinetDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CabinetDocument[] | null>(null);
  const [ocrStatus, setOcrStatus] = useState<CabinetOcrStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const newFolderRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadFolders = useCallback(async (parent: string) => {
    try {
      const f = await window.laguz.getCabinetFolders(parent || undefined);
      setFolders(f);
    } catch { setFolders([]); }
  }, []);

  const loadDocuments = useCallback(async (folder: string) => {
    setLoading(true);
    try {
      const docs = await window.laguz.getCabinetDocuments(folder || undefined);
      setDocuments(docs);
    } catch { setDocuments([]); }
    setLoading(false);
  }, []);

  const refreshOcrStatus = useCallback(async () => {
    try {
      const status = await window.laguz.getCabinetOcrStatus();
      setOcrStatus(status);
    } catch {}
  }, []);

  useEffect(() => {
    loadFolders(currentFolder);
    loadDocuments(currentFolder);
    refreshOcrStatus();
  }, [currentFolder, loadFolders, loadDocuments, refreshOcrStatus]);

  // Poll OCR status while processing
  useEffect(() => {
    if (!ocrStatus || (ocrStatus.pending === 0 && ocrStatus.processing === 0)) return;
    const interval = setInterval(() => {
      refreshOcrStatus();
      loadDocuments(currentFolder);
    }, 3000);
    return () => clearInterval(interval);
  }, [ocrStatus, currentFolder, refreshOcrStatus, loadDocuments]);

  const navigateToFolder = useCallback((folderName: string) => {
    const newPath = currentFolder ? `${currentFolder}/${folderName}` : folderName;
    setFolderStack(prev => [...prev, currentFolder]);
    setCurrentFolder(newPath);
    setSearchQuery('');
    setSearchResults(null);
  }, [currentFolder]);

  const navigateBack = useCallback(() => {
    const prev = folderStack[folderStack.length - 1];
    setFolderStack(s => s.slice(0, -1));
    setCurrentFolder(prev ?? '');
    setSearchQuery('');
    setSearchResults(null);
  }, [folderStack]);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    if (!q.trim()) {
      setSearchResults(null);
      return;
    }

    searchTimerRef.current = setTimeout(async () => {
      try {
        const results = await window.laguz.searchCabinet(q, {
          folder: currentFolder || undefined,
        });
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    }, 300);
  }, [currentFolder]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropActive(false);
    const files = e.dataTransfer?.files;
    if (!files?.length) return;

    for (const file of Array.from(files)) {
      const filePath = window.laguz.getPathForFile(file);
      if (!filePath) continue;
      await window.laguz.copyCabinetFile(filePath, currentFolder);
    }

    loadDocuments(currentFolder);
    loadFolders(currentFolder);
    refreshOcrStatus();
  }, [currentFolder, loadDocuments, loadFolders, refreshOcrStatus]);

  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folderPath = currentFolder ? `${currentFolder}/${name}` : name;
    await window.laguz.createCabinetFolder(folderPath);
    setNewFolderName('');
    setShowNewFolder(false);
    loadFolders(currentFolder);
  }, [newFolderName, currentFolder, loadFolders]);

  useEffect(() => {
    if (showNewFolder) newFolderRef.current?.focus();
  }, [showNewFolder]);

  const handleScan = useCallback(async () => {
    await window.laguz.openScanner(currentFolder || undefined);
  }, [currentFolder]);

  const isMac = window.laguz.platform === 'darwin';
  const displayDocs = searchResults ?? documents;
  const breadcrumbs = currentFolder ? currentFolder.split('/') : [];

  return (
    <div
      className={cn(
        'w-2/5 min-w-[280px] max-w-[450px] border-r border-border-subtle flex flex-col flex-shrink-0',
        dropActive && 'ring-2 ring-inset ring-accent-primary/50'
      )}
      onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
      onDragLeave={() => setDropActive(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border-subtle space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary flex items-center gap-1.5">
            <span className="opacity-60">🗃</span>
            Cabinet
          </h2>
          <div className="flex items-center gap-1.5">
            {ocrStatus && (ocrStatus.pending > 0 || ocrStatus.processing > 0) && (
              <span className="text-[10px] text-amber-400 animate-pulse" title="OCR processing...">
                ⚙ {ocrStatus.pending + ocrStatus.processing}
              </span>
            )}
            {isMac && (
              <button
                onClick={handleScan}
                className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
                title="Scan document"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18.75 7.159l-.351.064" />
                </svg>
              </button>
            )}
            <button
              onClick={() => setShowNewFolder(true)}
              className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-primary transition-colors"
              title="New Folder"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
              </svg>
            </button>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search documents..."
          className="w-full bg-bg-primary border border-border-subtle rounded-md px-3 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-primary/40"
        />

        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-xs text-text-muted overflow-x-auto">
          <button
            onClick={() => { setFolderStack([]); setCurrentFolder(''); }}
            className={cn('hover:text-text-primary shrink-0', !currentFolder && 'text-text-primary font-medium')}
          >
            Cabinet
          </button>
          {breadcrumbs.map((crumb, i) => {
            const crumbPath = breadcrumbs.slice(0, i + 1).join('/');
            const isLast = i === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumbPath}>
                <span className="opacity-40">/</span>
                <button
                  onClick={() => {
                    setFolderStack(prev => prev.slice(0, i));
                    setCurrentFolder(crumbPath);
                  }}
                  className={cn('hover:text-text-primary truncate', isLast && 'text-text-primary font-medium')}
                >
                  {crumb}
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* New folder input */}
      {showNewFolder && (
        <div className="px-4 py-2 border-b border-border-subtle flex items-center gap-2">
          <input
            ref={newFolderRef}
            type="text"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
            }}
            placeholder="Folder name..."
            className="flex-1 bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-primary/40"
          />
          <button onClick={handleCreateFolder} className="text-xs text-accent-primary hover:underline">Create</button>
          <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} className="text-xs text-text-muted hover:text-text-primary">Cancel</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {/* Back button */}
        {currentFolder && !searchQuery && (
          <button
            onClick={navigateBack}
            className="w-full px-4 py-2 flex items-center gap-2 text-xs text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        )}

        {/* Subfolders */}
        {!searchQuery && folders.map(folder => (
          <button
            key={folder}
            onClick={() => navigateToFolder(folder)}
            className="w-full px-4 py-2 flex items-center gap-2.5 hover:bg-bg-hover transition-colors group"
          >
            <span className="text-sm opacity-60">📁</span>
            <span className="text-xs text-text-primary truncate flex-1 text-left">{folder}</span>
            <svg className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}

        {/* Separator between folders and documents */}
        {!searchQuery && folders.length > 0 && displayDocs.length > 0 && (
          <div className="mx-4 my-1 border-t border-border-subtle" />
        )}

        {/* Documents */}
        {loading && displayDocs.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-text-muted">Loading...</div>
        )}

        {displayDocs.map(doc => (
          <button
            key={doc.id}
            onClick={() => onOpenFile(doc.path)}
            className={cn(
              'w-full px-4 py-2.5 flex items-start gap-2.5 hover:bg-bg-hover transition-colors text-left',
              activeFilePath === doc.path && 'bg-bg-hover'
            )}
          >
            <span className="text-sm mt-0.5 shrink-0">{EXT_ICONS[doc.ext] || '📎'}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-primary truncate">{doc.filename}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-text-muted uppercase">{doc.ext}</span>
                <span className="text-[10px] text-text-muted">{formatSize(doc.size)}</span>
                {doc.modified && (
                  <span className="text-[10px] text-text-muted">{timeAgo(doc.modified)}</span>
                )}
                <OcrBadge status={doc.ocr_status} />
              </div>
              {doc.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {doc.tags.map(tag => (
                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              {searchResults && doc.extracted_text && (
                <div className="text-[10px] text-text-muted mt-1 line-clamp-2">
                  {doc.extracted_text.slice(0, 200)}...
                </div>
              )}
            </div>
          </button>
        ))}

        {!loading && displayDocs.length === 0 && folders.length === 0 && (
          <div className="px-4 py-8 text-center">
            <div className="text-2xl mb-2 opacity-30">🗃</div>
            <div className="text-xs text-text-muted">
              {searchQuery ? 'No documents found' : 'Drop files here to add them'}
            </div>
          </div>
        )}

        {/* Drop zone indicator */}
        {dropActive && (
          <div className="absolute inset-0 bg-accent-primary/5 flex items-center justify-center pointer-events-none z-10">
            <div className="text-sm text-accent-primary font-medium bg-bg-primary/90 px-4 py-2 rounded-lg shadow-lg">
              Drop to add to cabinet
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OcrBadge({ status }: { status: string }) {
  if (status === 'done') return null;
  const colors: Record<string, string> = {
    pending: 'text-yellow-500',
    processing: 'text-amber-400 animate-pulse',
    failed: 'text-red-400',
  };
  const labels: Record<string, string> = {
    pending: 'OCR pending',
    processing: 'OCR...',
    failed: 'OCR failed',
  };
  return (
    <span className={cn('text-[9px]', colors[status] || 'text-text-muted')}>
      {labels[status] || status}
    </span>
  );
}
