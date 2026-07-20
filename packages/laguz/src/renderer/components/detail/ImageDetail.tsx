import React, { useEffect, useState } from 'react';
import { extFromPath, MIME_MAP } from './fileTypes';

// ── Image Detail ─────────────────────────────────────────────

export function ImageDetail({ filePath }: { filePath: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filename = filePath.split('/').pop() || filePath;
  const ext = extFromPath(filePath);

  useEffect(() => {
    setDataUrl(null);
    setError(null);
    window.laguz.readFileBase64(filePath).then((b64) => {
      const mime = MIME_MAP[ext] || 'application/octet-stream';
      setDataUrl(`data:${mime};base64,${b64}`);
    }).catch((e: any) => {
      setError(e.message || 'Failed to load image');
    });
  }, [filePath, ext]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text-primary font-mono">{filename}</h1>
          <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
            style={{ background: 'rgba(92, 184, 165, 0.12)', color: '#5CB8A5' }}
          >
            {ext.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
          <span>{filePath}</span>
        </div>
      </div>
      <div className="flex-1 overflow-auto scrollbar-hide flex items-start justify-center p-6 bg-[#1a1a2e]">
        {error ? (
          <div className="text-red-400 text-sm">{error}</div>
        ) : dataUrl ? (
          <img src={dataUrl} alt={filename} className="max-w-full object-contain rounded shadow-lg" style={{ maxHeight: '90vh' }} />
        ) : (
          <div className="text-text-muted text-sm">Loading image...</div>
        )}
      </div>
    </div>
  );
}
