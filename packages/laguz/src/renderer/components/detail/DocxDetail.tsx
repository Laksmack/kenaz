import React, { useCallback, useEffect, useState } from 'react';
import { sanitizeLaguzHtml } from '../../lib/sanitizeHtml';
import { PdfDetail } from '../PdfDetail';

// ── DOCX Detail ──────────────────────────────────────────────

export function DocxDetail({ filePath }: { filePath: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [pdfPath, setPdfPath] = useState<string | null>(null);

  const filename = filePath.split('/').pop() || filePath;

  useEffect(() => {
    setHtml(null);
    setError(null);
    setPdfPath(null);
    window.laguz.readDocxHtml(filePath).then((res) => {
      setHtml(res.html);
    }).catch((e: any) => {
      setError(e.message || 'Failed to load DOCX');
    });
  }, [filePath]);

  const handleConvertToPdf = useCallback(async () => {
    setConverting(true);
    try {
      const result = await window.laguz.convertDocxToPdf(filePath);
      setPdfPath(result.pdfPath);
    } catch (e: any) {
      alert(`Conversion failed: ${e.message}`);
    } finally {
      setConverting(false);
    }
  }, [filePath]);

  if (pdfPath) {
    return <PdfDetail filePath={pdfPath} />;
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-border-subtle flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold text-text-primary font-mono">{filename}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleConvertToPdf}
              disabled={converting || !html}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                background: converting ? 'rgba(74, 168, 154, 0.08)' : 'rgba(74, 168, 154, 0.15)',
                color: '#4AA89A',
                opacity: converting || !html ? 0.6 : 1,
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              {converting ? 'Converting...' : 'Convert to PDF'}
            </button>
            <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider"
              style={{ background: 'rgba(92, 184, 165, 0.12)', color: '#5CB8A5' }}
            >
              DOCX
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
          <span>{filePath}</span>
          <span>Convert to PDF to annotate and sign</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4">
        {error ? (
          <div className="text-red-400 text-sm">{error}</div>
        ) : html ? (
          <div className="prose-laguz" dangerouslySetInnerHTML={{ __html: sanitizeLaguzHtml(html) }} />
        ) : (
          <div className="text-text-muted text-sm">Loading document...</div>
        )}
      </div>

      <div className="h-6 flex items-center px-3 gap-4 border-t border-border-subtle bg-bg-secondary text-[10px] text-text-muted flex-shrink-0 select-none">
        <span>DOCX</span>
        <div className="flex-1" />
        {pdfPath === null && <span>Convert to PDF for annotations & signatures</span>}
      </div>
    </div>
  );
}
