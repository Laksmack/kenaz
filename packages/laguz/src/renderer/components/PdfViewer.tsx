import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { PdfAnnotation, PdfInfo } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url,
).toString();

// ── Types ────────────────────────────────────────────────────

type ZoomMode = 'fit-width' | 'fit-page' | number;

interface PdfViewerProps {
  filePath: string;
  refreshKey?: number;
  annotations?: PdfAnnotation[];
  activeTool?: PdfAnnotation['type'] | null;
  activeColor?: string;
  onAnnotationCreate?: (annotation: Omit<PdfAnnotation, 'id'>) => void;
  onAnnotationSelect?: (annotation: PdfAnnotation) => void;
  onAnnotationResize?: (id: string, rect: { x: number; y: number; width: number; height: number }) => void;
  onAnnotationMove?: (id: string, rect: { x: number; y: number; width: number; height: number }) => void;
  onAnnotationDelete?: (id: string) => void;
  onTextSelect?: (text: string, page: number, rect: { x: number; y: number; width: number; height: number }) => void;
  signatureMode?: { pngBase64: string } | null;
  onSignaturePlaced?: (page: number, rect: { x: number; y: number; width: number; height: number }) => void;
}

// ── Main Component ───────────────────────────────────────────

export function PdfViewer({
  filePath,
  refreshKey = 0,
  annotations = [],
  activeTool,
  activeColor = '#E8834A',
  onAnnotationCreate,
  onAnnotationSelect,
  onAnnotationResize,
  onAnnotationMove,
  onAnnotationDelete,
  onTextSelect,
  signatureMode,
  onSignaturePlaced,
}: PdfViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfInfo, setPdfInfo] = useState<PdfInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState<ZoomMode>('fit-width');
  const [scale, setScale] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidecar, setSidecar] = useState<string | null>(null);
  const [showSidecar, setShowSidecar] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const renderedPages = useRef<Set<number>>(new Set());
  const renderGeneration = useRef(0);
  const lastFilePathRef = useRef<string>('');
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number; pageNum: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; pageNum: number } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ startX: number; startY: number; endX: number; endY: number; pageNum: number } | null>(null);

  // Track container width via ResizeObserver so we re-render when layout settles.
  // Depends on `loading` because the scroll container isn't mounted during the loading state.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading]);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;
    const fileChanged = filePath !== lastFilePathRef.current;
    lastFilePathRef.current = filePath;

    if (fileChanged) {
      setLoading(true);
      setPdfDoc(null);
    }
    setError(null);
    renderedPages.current.clear();

    async function load() {
      try {
        const base64 = await window.laguz.readPdfBase64(filePath);
        const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const doc = await pdfjsLib.getDocument({ data }).promise;
        if (cancelled) { doc.destroy(); return; }
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        if (fileChanged) setCurrentPage(1);

        const info = await window.laguz.getPdfInfo(filePath);
        if (!cancelled) setPdfInfo(info);

        const sc = await window.laguz.readSidecar(filePath);
        if (!cancelled) setSidecar(sc);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [filePath, refreshKey]);

  // Calculate effective scale based on zoom mode
  const calcScale = useCallback((page: PDFPageProxy, cw: number, ch: number): number => {
    const viewport = page.getViewport({ scale: 1 });
    if (zoom === 'fit-width') {
      return Math.max(0.1, (cw - 48) / viewport.width);
    }
    if (zoom === 'fit-page') {
      const sw = (cw - 48) / viewport.width;
      const sh = (ch - 20) / viewport.height;
      return Math.max(0.1, Math.min(sw, sh));
    }
    return zoom;
  }, [zoom]);

  // Render a single page using canvasContext for explicit DPR control
  const renderPage = useCallback(async (pageNum: number, generation: number) => {
    if (!pdfDoc) return;
    if (generation !== renderGeneration.current) return;

    const canvas = canvasRefs.current.get(pageNum);
    const textLayerDiv = textLayerRefs.current.get(pageNum);
    const container = scrollContainerRef.current;
    if (!canvas || !container) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (cw <= 0) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      if (generation !== renderGeneration.current) return;

      const s = calcScale(page, cw, ch);
      setScale(s);

      const viewport = page.getViewport({ scale: s });
      const dpr = window.devicePixelRatio || 1;

      canvas.width = viewport.width * dpr;
      canvas.height = viewport.height * dpr;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const transform: [number, number, number, number, number, number] = [dpr, 0, 0, dpr, 0, 0];
      await page.render({ canvasContext: ctx, viewport, transform }).promise;

      if (textLayerDiv) {
        textLayerDiv.innerHTML = '';
        textLayerDiv.style.width = `${viewport.width}px`;
        textLayerDiv.style.height = `${viewport.height}px`;

        const textContent = await page.getTextContent();
        for (const item of textContent.items) {
          if (!('str' in item) || !item.str) continue;
          const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
          const span = document.createElement('span');
          span.textContent = item.str;
          span.style.position = 'absolute';
          span.style.left = `${tx[4]}px`;
          span.style.top = `${tx[5] - item.height * s}px`;
          span.style.fontSize = `${item.height * s}px`;
          span.style.fontFamily = 'sans-serif';
          span.style.transformOrigin = '0 0';
          textLayerDiv.appendChild(span);
        }
      }
    } catch (e) {
      console.error(`[PdfViewer] Failed to render page ${pageNum}:`, e);
    }
  }, [pdfDoc, calcScale]);

  // Re-render all pages when doc, zoom, or container width changes
  useEffect(() => {
    if (!pdfDoc || containerWidth <= 0) return;

    const gen = ++renderGeneration.current;
    renderedPages.current.clear();

    for (let i = 1; i <= Math.min(3, totalPages); i++) {
      renderPage(i, gen);
    }
  }, [pdfDoc, zoom, totalPages, containerWidth, renderPage]);

  // Intersection observer for lazy rendering of off-screen pages
  useEffect(() => {
    if (!pdfDoc || containerWidth <= 0) return;

    const gen = renderGeneration.current;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute('data-page') || '0');
            if (pageNum > 3) renderPage(pageNum, gen);
          }
        }
      },
      { root: scrollContainerRef.current, rootMargin: '200px' },
    );

    pageRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [pdfDoc, totalPages, containerWidth, renderPage]);

  // Track current page on scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const scrollTop = container.scrollTop + container.clientHeight / 3;
      let foundPage = 1;
      pageRefs.current.forEach((el, num) => {
        if (el.offsetTop <= scrollTop) foundPage = num;
      });
      setCurrentPage(foundPage);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [totalPages]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const scrollToPage = useCallback((pageNum: number) => {
    const el = pageRefs.current.get(pageNum);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const handleZoomIn = () => {
    const current = typeof zoom === 'number' ? zoom : scale;
    setZoom(Math.min(current + 0.25, 5));
  };

  const handleZoomOut = () => {
    const current = typeof zoom === 'number' ? zoom : scale;
    setZoom(Math.max(current - 0.25, 0.25));
  };

  const handlePageClick = useCallback((pageNum: number, e: React.MouseEvent<HTMLDivElement>) => {
    if (dragStartRef.current) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (signatureMode && onSignaturePlaced) {
      const canvas = canvasRefs.current.get(pageNum);
      if (!canvas) return;
      const pageHeight = canvas.height / (window.devicePixelRatio || 1) / scale;
      onSignaturePlaced(pageNum - 1, {
        x,
        y: pageHeight - y - 40,
        width: 150,
        height: 40,
      });
      return;
    }

    if (activeTool && activeTool !== 'highlight' && activeTool !== 'underline' && onAnnotationCreate) {
      const canvas = canvasRefs.current.get(pageNum);
      if (!canvas) return;
      const pageHeight = canvas.height / (window.devicePixelRatio || 1) / scale;

      onAnnotationCreate({
        type: activeTool,
        page: pageNum - 1,
        rect: { x, y: pageHeight - y - 20, width: 200, height: 20 },
        text: activeTool === 'text-note' || activeTool === 'text-box' ? '' : undefined,
        color: activeColor,
        author: 'user',
      });
    }
  }, [scale, activeTool, activeColor, signatureMode, onAnnotationCreate, onSignaturePlaced]);

  const handleMouseDown = useCallback((pageNum: number, e: React.MouseEvent) => {
    if (activeTool !== 'highlight' && activeTool !== 'underline') return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    dragStartRef.current = { x: sx, y: sy, pageNum };
    setDragPreview({ startX: sx, startY: sy, endX: sx, endY: sy, pageNum });
  }, [activeTool]);

  const handleMouseMove = useCallback((pageNum: number, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragStartRef.current && dragStartRef.current.pageNum === pageNum) {
      setDragPreview({
        startX: dragStartRef.current.x,
        startY: dragStartRef.current.y,
        endX: mx,
        endY: my,
        pageNum,
      });
      return;
    }

    if (signatureMode || activeTool === 'text-box' || activeTool === 'text-note') {
      setGhostPos({ x: mx, y: my, pageNum });
    } else {
      setGhostPos(null);
    }
  }, [signatureMode, activeTool]);

  const handleMouseUp = useCallback((pageNum: number, e: React.MouseEvent) => {
    const start = dragStartRef.current;
    if (!start || start.pageNum !== pageNum) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    dragStartRef.current = null;
    setDragPreview(null);

    const canvas = canvasRefs.current.get(pageNum);
    if (!canvas || !onAnnotationCreate || !activeTool) return;

    const pageHeight = canvas.height / (window.devicePixelRatio || 1) / scale;
    const x1 = Math.min(start.x, endX) / scale;
    const x2 = Math.max(start.x, endX) / scale;
    const y1 = Math.min(start.y, endY) / scale;
    const y2 = Math.max(start.y, endY) / scale;
    const w = x2 - x1;

    if (w < 5) return;

    const h = activeTool === 'underline' ? 2 : (y2 - y1);

    onAnnotationCreate({
      type: activeTool,
      page: pageNum - 1,
      rect: { x: x1, y: pageHeight - y2, width: w, height: Math.max(h, 2) },
      color: activeColor,
      author: 'user',
    });
  }, [activeTool, activeColor, scale, onAnnotationCreate]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="text-text-muted text-sm">Loading PDF...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center bg-bg-primary">
        <div className="text-center">
          <div className="text-red-400 text-sm mb-2">Failed to load PDF</div>
          <div className="text-text-muted text-xs">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="h-10 flex items-center gap-2 px-3 border-b border-border-subtle bg-bg-secondary flex-shrink-0">
        {/* Page nav */}
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <button onClick={() => scrollToPage(Math.max(1, currentPage - 1))} className="px-1.5 py-0.5 rounded hover:bg-bg-hover" disabled={currentPage <= 1}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
          </button>
          <span>{currentPage} / {totalPages}</span>
          <button onClick={() => scrollToPage(Math.min(totalPages, currentPage + 1))} className="px-1.5 py-0.5 rounded hover:bg-bg-hover" disabled={currentPage >= totalPages}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        <div className="w-px h-5 bg-border-subtle" />

        {/* Zoom controls */}
        <div className="flex items-center gap-1 text-xs text-text-secondary">
          <button onClick={handleZoomOut} className="px-1.5 py-0.5 rounded hover:bg-bg-hover" title="Zoom out">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" /></svg>
          </button>
          <span className="w-10 text-center">{Math.round((typeof zoom === 'number' ? zoom : scale) * 100)}%</span>
          <button onClick={handleZoomIn} className="px-1.5 py-0.5 rounded hover:bg-bg-hover" title="Zoom in">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          </button>
        </div>

        <div className="w-px h-5 bg-border-subtle" />

        {/* Fit modes */}
        <button
          onClick={() => setZoom('fit-width')}
          className={`px-2 py-0.5 rounded text-xs ${zoom === 'fit-width' ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-secondary hover:bg-bg-hover'}`}
        >
          Fit Width
        </button>
        <button
          onClick={() => setZoom('fit-page')}
          className={`px-2 py-0.5 rounded text-xs ${zoom === 'fit-page' ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-secondary hover:bg-bg-hover'}`}
        >
          Fit Page
        </button>

        <div className="flex-1" />

        {/* Sidecar toggle */}
        {sidecar !== null && (
          <button
            onClick={() => setShowSidecar(!showSidecar)}
            className={`px-2 py-0.5 rounded text-xs ${showSidecar ? 'bg-accent-primary/20 text-accent-primary' : 'text-text-secondary hover:bg-bg-hover'}`}
            title="Claude's notes"
          >
            Notes
          </button>
        )}

        {/* Search */}
        <button
          onClick={() => setSearchOpen(!searchOpen)}
          className="p-1 rounded hover:bg-bg-hover text-text-secondary"
          title="Search (Cmd+F)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* PDF info */}
        {pdfInfo?.title && (
          <span className="text-xs text-text-muted truncate max-w-[200px]">{pdfInfo.title}</span>
        )}
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="h-9 flex items-center gap-2 px-3 border-b border-border-subtle bg-bg-secondary flex-shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in document..."
            className="bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary placeholder-text-muted outline-none w-64 focus:border-accent-primary/40"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false); }}
          />
          <span className="text-xs text-text-muted">Press Escape to close</span>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Main PDF area */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-auto bg-[#1a1a2e] scrollbar-hide"
        >
          <div className="flex flex-col items-center py-4 gap-4">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => {
              const isInteractive = !!(activeTool || signatureMode);
              return (
                <div
                  key={pageNum}
                  ref={(el) => { if (el) pageRefs.current.set(pageNum, el); }}
                  data-page={pageNum}
                  className="relative shadow-lg"
                  style={{ cursor: isInteractive ? (signatureMode ? 'crosshair' : 'cell') : 'default' }}
                  onMouseDown={(e) => handleMouseDown(pageNum, e)}
                  onClick={(e) => handlePageClick(pageNum, e)}
                  onMouseMove={(e) => handleMouseMove(pageNum, e)}
                  onMouseUp={(e) => handleMouseUp(pageNum, e)}
                  onMouseLeave={() => { setGhostPos(null); if (dragStartRef.current) { dragStartRef.current = null; setDragPreview(null); } }}
                >
                  <canvas
                    ref={(el) => { if (el) canvasRefs.current.set(pageNum, el); }}
                    className="block"
                  />
                  <div
                    ref={(el) => { if (el) textLayerRefs.current.set(pageNum, el); }}
                    className="absolute inset-0 overflow-hidden"
                    style={{ color: 'transparent', lineHeight: 1, pointerEvents: isInteractive ? 'none' : 'auto' }}
                  />
                  {annotations
                    .filter(a => a.page === pageNum - 1)
                    .map(a => (
                      <AnnotationOverlay
                        key={a.id}
                        annotation={a}
                        scale={scale}
                        pageHeight={(canvasRefs.current.get(pageNum)?.height || 0) / (window.devicePixelRatio || 1) / scale}
                        onClick={() => onAnnotationSelect?.(a)}
                        onResize={onAnnotationResize}
                        onMove={onAnnotationMove}
                        onDelete={onAnnotationDelete}
                      />
                    ))
                  }
                  {/* Signature ghost */}
                  {signatureMode && ghostPos?.pageNum === pageNum && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: ghostPos.x,
                        top: ghostPos.y,
                        width: 150 * scale,
                        height: 40 * scale,
                        border: '2px dashed rgba(74, 168, 154, 0.8)',
                        borderRadius: 3,
                        backgroundColor: 'rgba(74, 168, 154, 0.08)',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <img
                        src={`data:image/png;base64,${signatureMode.pngBase64}`}
                        style={{ maxWidth: '100%', maxHeight: '100%', opacity: 0.6 }}
                        alt=""
                      />
                    </div>
                  )}
                  {/* Text tool ghost */}
                  {!signatureMode && (activeTool === 'text-box' || activeTool === 'text-note') && ghostPos?.pageNum === pageNum && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: ghostPos.x,
                        top: ghostPos.y,
                        width: 200 * scale,
                        height: 20 * scale,
                        border: activeTool === 'text-box'
                          ? `2px dashed ${activeColor}88`
                          : `1px solid ${activeColor}55`,
                        borderRadius: 2,
                        backgroundColor: activeTool === 'text-note' ? `${activeColor}15` : 'transparent',
                      }}
                    />
                  )}
                  {/* Drag preview for highlight/underline */}
                  {dragPreview && dragPreview.pageNum === pageNum && (
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: Math.min(dragPreview.startX, dragPreview.endX),
                        top: Math.min(dragPreview.startY, dragPreview.endY),
                        width: Math.abs(dragPreview.endX - dragPreview.startX),
                        height: Math.abs(dragPreview.endY - dragPreview.startY),
                        backgroundColor: `${activeColor}33`,
                        border: `1px solid ${activeColor}66`,
                        borderRadius: 1,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidecar panel */}
        {showSidecar && sidecar !== null && (
          <div className="w-72 border-l border-border-subtle bg-bg-secondary overflow-y-auto flex-shrink-0">
            <div className="p-4">
              <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Claude's Notes</h3>
              <div className="prose-laguz text-xs" dangerouslySetInnerHTML={{ __html: sidecar }} />
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="h-6 flex items-center px-3 gap-4 border-t border-border-subtle bg-bg-secondary text-[10px] text-text-muted flex-shrink-0 select-none">
        <span>Page {currentPage} of {totalPages}</span>
        <span>{Math.round((typeof zoom === 'number' ? zoom : scale) * 100)}%</span>
        {pdfInfo?.author && <span>Author: {pdfInfo.author}</span>}
        <div className="flex-1" />
        <span>PDF</span>
      </div>
    </div>
  );
}

// ── Annotation Overlay ───────────────────────────────────────

function AnnotationOverlay({
  annotation,
  scale,
  pageHeight,
  onClick,
  onResize,
  onMove,
  onDelete,
}: {
  annotation: PdfAnnotation;
  scale: number;
  pageHeight: number;
  onClick: () => void;
  onResize?: (id: string, rect: { x: number; y: number; width: number; height: number }) => void;
  onMove?: (id: string, rect: { x: number; y: number; width: number; height: number }) => void;
  onDelete?: (id: string) => void;
}) {
  const { rect, type, text, color } = annotation;
  const top = (pageHeight - rect.y - rect.height) * scale;
  const left = rect.x * scale;
  const width = rect.width * scale;
  const height = rect.height * scale;

  let style: React.CSSProperties = {
    position: 'absolute',
    top, left, width, height,
    pointerEvents: 'auto',
    cursor: onMove ? 'move' : 'pointer',
  };

  switch (type) {
    case 'highlight':
      style.backgroundColor = color;
      style.opacity = 0.3;
      break;
    case 'underline':
      style.borderBottom = `2px solid ${color}`;
      style.opacity = 0.8;
      break;
    case 'text-note':
      style.backgroundColor = `${color}22`;
      style.border = `1px solid ${color}55`;
      style.borderRadius = '2px';
      break;
    case 'text-box':
      style.border = `1px dashed ${color}88`;
      style.borderRadius = '2px';
      break;
    case 'signature':
      style.border = `1px solid ${color}44`;
      break;
  }

  const handleMoveStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const origX = rect.x;
    const origY = rect.y;
    let moved = false;

    const handleMouseMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) moved = true;
      if (moved && onMove) {
        const dx = (ev.clientX - startX) / scale;
        const dy = (ev.clientY - startY) / scale;
        onMove(annotation.id, { ...rect, x: origX + dx, y: origY - dy });
      }
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (!moved) onClick();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!onResize) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origW = rect.width;
    const origH = rect.height;

    const handleMove = (ev: MouseEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      onResize(annotation.id, {
        ...rect,
        width: Math.max(20, origW + dx),
        height: Math.max(10, origH + dy),
      });
    };

    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const showResize = onResize && type !== 'underline';

  return (
    <div className="group" style={style} onMouseDown={handleMoveStart} title={text || `${type} annotation`}>
      {(type === 'text-note' || type === 'text-box') && text && (
        <span
          className="block truncate px-1"
          style={{ fontSize: Math.max(8, height * 0.7), color, lineHeight: `${height}px` }}
        >
          {text}
        </span>
      )}
      {type === 'signature' && text && (
        <img
          src={`data:image/png;base64,${text}`}
          style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
          draggable={false}
          alt=""
        />
      )}
      {onDelete && (
        <div
          onMouseDown={(e) => { e.stopPropagation(); onDelete(annotation.id); }}
          className="absolute opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          style={{
            top: -6,
            right: -6,
            width: 14,
            height: 14,
            backgroundColor: '#E74C3C',
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: 9,
            color: '#fff',
            lineHeight: '14px',
          }}
        >
          ×
        </div>
      )}
      {showResize && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            right: -3,
            bottom: -3,
            width: 8,
            height: 8,
            backgroundColor: color,
            borderRadius: 1,
            cursor: 'nwse-resize',
          }}
        />
      )}
    </div>
  );
}
