import React, { useState, useCallback } from 'react';
import { PdfViewer } from './PdfViewer';
import { PdfAnnotationToolbar } from './PdfAnnotationToolbar';
import { SignaturePanel } from './SignaturePanel';
import type { PdfAnnotation, SignatureInfo } from '../types';

const EDIT_COLORS = ['#E8834A', '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#F39C12', '#000000'];

interface PdfDetailProps {
  filePath: string;
}

let annotationCounter = 0;

export function PdfDetail({ filePath }: PdfDetailProps) {
  const [annotations, setAnnotations] = useState<PdfAnnotation[]>([]);
  const [activeTool, setActiveTool] = useState<PdfAnnotation['type'] | null>(null);
  const [activeColor, setActiveColor] = useState('#E8834A');
  const [signatureMode, setSignatureMode] = useState<{ pngBase64: string } | null>(null);
  const [showSignPanel, setShowSignPanel] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingAnnotation, setEditingAnnotation] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const reloadPdf = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleAnnotationCreate = useCallback((partial: Omit<PdfAnnotation, 'id'>) => {
    const annotation: PdfAnnotation = {
      ...partial,
      id: `ann-${++annotationCounter}-${Date.now()}`,
    };

    if (annotation.type === 'text-note' || annotation.type === 'text-box') {
      annotation.text = '';
      setAnnotations(prev => [...prev, annotation]);
      setEditingAnnotation(annotation.id);
      setEditText('');
      return;
    }

    setAnnotations(prev => [...prev, annotation]);
  }, []);

  const handleAnnotationSelect = useCallback((annotation: PdfAnnotation) => {
    if (annotation.type === 'text-note' || annotation.type === 'text-box') {
      setEditingAnnotation(annotation.id);
      setEditText(annotation.text || '');
    }
  }, []);

  const submitEdit = useCallback(() => {
    if (!editingAnnotation) return;
    if (editText.trim()) {
      setAnnotations(prev => prev.map(a => a.id === editingAnnotation ? { ...a, text: editText.trim() } : a));
    } else {
      setAnnotations(prev => prev.filter(a => a.id !== editingAnnotation));
    }
    setEditingAnnotation(null);
  }, [editingAnnotation, editText]);

  const cancelEdit = useCallback(() => {
    if (!editingAnnotation) return;
    setAnnotations(prev => prev.filter(a => a.id !== editingAnnotation || (a.text && a.text.trim())));
    setEditingAnnotation(null);
  }, [editingAnnotation]);

  const handleAnnotationResize = useCallback((id: string, newRect: { x: number; y: number; width: number; height: number }) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, rect: newRect } : a));
  }, []);

  const handleAnnotationMove = useCallback((id: string, newRect: { x: number; y: number; width: number; height: number }) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, rect: newRect } : a));
  }, []);

  const handleAnnotationDelete = useCallback((id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleSave = useCallback(async () => {
    try {
      for (const ann of annotations) {
        if (ann.type === 'signature' && ann.text) {
          await window.laguz.placePdfSignatureRaw(filePath, ann.page, ann.rect, ann.text);
        } else {
          await window.laguz.addPdfAnnotation(filePath, ann);
        }
      }
      setAnnotations([]);
      reloadPdf();
    } catch (e: any) {
      console.error('Failed to save annotations:', e);
    }
  }, [filePath, annotations, reloadPdf]);

  const handleFlatten = useCallback(async () => {
    try {
      for (const ann of annotations) {
        if (ann.type === 'signature' && ann.text) {
          await window.laguz.placePdfSignatureRaw(filePath, ann.page, ann.rect, ann.text);
        } else {
          await window.laguz.addPdfAnnotation(filePath, ann);
        }
      }
      setAnnotations([]);
      const result = await window.laguz.flattenPdf(filePath);
      reloadPdf();
      alert(`Flattened PDF saved: ${result.outputPath}`);
    } catch (e: any) {
      console.error('Failed to flatten:', e);
    }
  }, [filePath, annotations, reloadPdf]);

  const handleSignClick = useCallback(() => {
    setActiveTool(null);
    setShowSignPanel(true);
  }, []);

  const handleSignatureSelect = useCallback((sig: SignatureInfo) => {
    setSignatureMode({ pngBase64: sig.pngBase64 });
    setShowSignPanel(false);
  }, []);

  const handleSignaturePlaced = useCallback((page: number, rect: { x: number; y: number; width: number; height: number }) => {
    if (!signatureMode) return;
    const annotation: PdfAnnotation = {
      id: `ann-${++annotationCounter}-${Date.now()}`,
      type: 'signature',
      page,
      rect,
      text: signatureMode.pngBase64,
      color: '#000000',
      author: 'user',
    };
    setAnnotations(prev => [...prev, annotation]);
    setSignatureMode(null);
  }, [signatureMode]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <PdfAnnotationToolbar
        activeTool={activeTool}
        onToolChange={(tool) => { setActiveTool(tool); setSignatureMode(null); }}
        onSave={handleSave}
        onFlatten={handleFlatten}
        hasAnnotations={annotations.length > 0}
        onSignClick={handleSignClick}
        activeColor={activeColor}
        onColorChange={setActiveColor}
      />

      <PdfViewer
        filePath={filePath}
        refreshKey={refreshKey}
        annotations={annotations}
        activeTool={activeTool}
        activeColor={activeColor}
        onAnnotationCreate={handleAnnotationCreate}
        onAnnotationSelect={handleAnnotationSelect}
        onAnnotationResize={handleAnnotationResize}
        onAnnotationMove={handleAnnotationMove}
        onAnnotationDelete={handleAnnotationDelete}
        signatureMode={signatureMode}
        onSignaturePlaced={handleSignaturePlaced}
      />

      {editingAnnotation && (() => {
        const editAnn = annotations.find(a => a.id === editingAnnotation);
        const editColor = editAnn?.color || activeColor;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={(e) => { if (e.target === e.currentTarget) cancelEdit(); }}>
            <div className="bg-bg-secondary border border-border-subtle rounded-lg shadow-xl p-4 w-80">
              <label className="text-xs text-text-muted block mb-1.5">Annotation text</label>
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className="w-full bg-bg-primary border border-border-subtle rounded-md px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent-primary/40"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitEdit();
                  else if (e.key === 'Escape') cancelEdit();
                }}
                placeholder="Type text and press Enter"
              />
              <div className="flex items-center gap-1.5 mt-3">
                <span className="text-[10px] text-text-muted mr-1">Color</span>
                {EDIT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setAnnotations(prev => prev.map(a => a.id === editingAnnotation ? { ...a, color: c } : a))}
                    className={`w-4 h-4 rounded-full transition-all hover:scale-110 ${editColor === c ? 'scale-125' : ''}`}
                    style={{
                      backgroundColor: c,
                      boxShadow: editColor === c ? '0 0 0 2px rgba(255,255,255,0.3)' : 'none',
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-2 mt-3 justify-end">
                <button onClick={cancelEdit} className="px-3 py-1 rounded text-xs text-text-secondary hover:bg-bg-hover">
                  Cancel
                </button>
                <button
                  onClick={submitEdit}
                  className="px-3 py-1 rounded text-xs font-medium text-white"
                  style={{ backgroundColor: '#4AA89A' }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {showSignPanel && (
        <SignaturePanel
          onSelect={handleSignatureSelect}
          onClose={() => setShowSignPanel(false)}
        />
      )}
    </div>
  );
}
