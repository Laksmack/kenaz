import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { cn } from '../../lib/utils';
import type { CabinetDocument } from '../../types';
import { isPdf, isDocx, isHtml, isImage } from './fileTypes';
import { PdfDetail } from '../PdfDetail';
import { DocxDetail } from './DocxDetail';
import { HtmlDetail } from './HtmlDetail';
import { ImageDetail } from './ImageDetail';
import { FileDetail } from './FileDetail';

// ── Cabinet Document Detail ──────────────────────────────────

const CATEGORY_PRESETS = [
  'invoice', 'receipt', 'tax form', 'birth certificate', 'insurance',
  'contract', 'medical', 'legal', 'warranty', 'other',
];

export function CabinetDocumentDetail({ filePath }: { filePath: string }) {
  const [doc, setDoc] = useState<CabinetDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOcr, setShowOcr] = useState(false);

  const loadDoc = useCallback(async () => {
    try {
      const d = await window.laguz.getCabinetDocument(filePath);
      setDoc(d);
    } catch (e) { console.error('[NoteDetail] Failed to load cabinet document:', e); }
    setLoading(false);
  }, [filePath]);

  useEffect(() => {
    setLoading(true);
    setShowOcr(false);
    loadDoc();
  }, [loadDoc]);

  const updateMetadata = useCallback(async (fields: { notes?: string | null; doc_date?: string | null; category?: string | null }) => {
    await window.laguz.updateCabinetMetadata(filePath, fields);
    const d = await window.laguz.getCabinetDocument(filePath);
    setDoc(d);
  }, [filePath]);

  const updateTags = useCallback(async (tags: string[]) => {
    await window.laguz.tagCabinetDocument(filePath, tags);
    const d = await window.laguz.getCabinetDocument(filePath);
    setDoc(d);
  }, [filePath]);

  // Determine which file viewer to render
  const fileViewer = useMemo(() => {
    if (isPdf(filePath)) return <PdfDetail filePath={filePath} />;
    if (isDocx(filePath)) return <DocxDetail filePath={filePath} />;
    if (isHtml(filePath)) return <HtmlDetail filePath={filePath} />;
    if (isImage(filePath)) return <ImageDetail filePath={filePath} />;
    return <FileDetail filePath={filePath} />;
  }, [filePath]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        Loading document...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {doc && (
        <CabinetMetadataPanel
          doc={doc}
          onUpdateMetadata={updateMetadata}
          onUpdateTags={updateTags}
        />
      )}
      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        {fileViewer}
      </div>
      {doc?.extracted_text && (
        <CabinetOcrPanel
          text={doc.extracted_text}
          expanded={showOcr}
          onToggle={() => setShowOcr(!showOcr)}
        />
      )}
    </div>
  );
}

function CabinetMetadataPanel({ doc, onUpdateMetadata, onUpdateTags }: {
  doc: CabinetDocument;
  onUpdateMetadata: (fields: { notes?: string | null; doc_date?: string | null; category?: string | null }) => void;
  onUpdateTags: (tags: string[]) => void;
}) {
  const [notes, setNotes] = useState(doc.notes || '');
  const [newTag, setNewTag] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [customCategory, setCustomCategory] = useState('');
  const tagInputRef = useRef<HTMLInputElement>(null);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync notes when doc changes (e.g. navigating to a different document)
  useEffect(() => {
    setNotes(doc.notes || '');
    setShowTagInput(false);
    setShowCategoryInput(false);
  }, [doc.path]);

  useEffect(() => {
    if (showTagInput) tagInputRef.current?.focus();
  }, [showTagInput]);

  const handleNotesChange = useCallback((value: string) => {
    setNotes(value);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      onUpdateMetadata({ notes: value || null });
    }, 500);
  }, [onUpdateMetadata]);

  const handleAddTag = useCallback(() => {
    const tag = newTag.trim();
    if (!tag || doc.tags.includes(tag)) return;
    onUpdateTags([...doc.tags, tag]);
    setNewTag('');
  }, [newTag, doc.tags, onUpdateTags]);

  const handleRemoveTag = useCallback((tag: string) => {
    onUpdateTags(doc.tags.filter(t => t !== tag));
  }, [doc.tags, onUpdateTags]);

  const handleCategorySelect = useCallback((cat: string) => {
    if (cat === '__custom__') {
      setShowCategoryInput(true);
      return;
    }
    onUpdateMetadata({ category: cat || null });
  }, [onUpdateMetadata]);

  const handleCustomCategory = useCallback(() => {
    const cat = customCategory.trim();
    if (cat) onUpdateMetadata({ category: cat });
    setShowCategoryInput(false);
    setCustomCategory('');
  }, [customCategory, onUpdateMetadata]);

  return (
    <div className="px-5 py-3 border-b border-border-subtle flex-shrink-0 space-y-2.5">
      {/* Row 1: Category + Date */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Category</span>
          {showCategoryInput ? (
            <input
              type="text"
              value={customCategory}
              onChange={(e) => setCustomCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCustomCategory();
                if (e.key === 'Escape') { setShowCategoryInput(false); setCustomCategory(''); }
              }}
              onBlur={handleCustomCategory}
              autoFocus
              placeholder="Custom category..."
              className="bg-bg-primary border border-border-subtle rounded px-2 py-0.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-primary/40 w-32"
            />
          ) : (
            <select
              value={doc.category || ''}
              onChange={(e) => handleCategorySelect(e.target.value)}
              className="bg-bg-primary border border-border-subtle rounded px-2 py-0.5 text-xs text-text-primary outline-none focus:border-accent-primary/40 cursor-pointer"
            >
              <option value="">—</option>
              {CATEGORY_PRESETS.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
              {doc.category && !CATEGORY_PRESETS.includes(doc.category) && (
                <option value={doc.category}>{doc.category}</option>
              )}
              <option value="__custom__">Custom...</option>
            </select>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-text-muted uppercase tracking-wider">Date</span>
          <input
            type="date"
            value={doc.doc_date || ''}
            onChange={(e) => onUpdateMetadata({ doc_date: e.target.value || null })}
            className="bg-bg-primary border border-border-subtle rounded px-2 py-0.5 text-xs text-text-primary outline-none focus:border-accent-primary/40 cursor-pointer"
          />
        </div>

        {doc.ocr_status !== 'done' && doc.ocr_status !== 'pending' && (
          <span className="text-[10px] text-red-400">OCR {doc.ocr_status}</span>
        )}
        {doc.ocr_status === 'pending' && (
          <span className="text-[10px] text-yellow-500">OCR pending</span>
        )}
      </div>

      {/* Row 2: Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-text-muted uppercase tracking-wider mr-0.5">Tags</span>
        {doc.tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-accent-primary/10 text-accent-primary">
            {tag}
            <button
              onClick={() => handleRemoveTag(tag)}
              className="ml-0.5 hover:text-red-400 transition-colors"
            >
              ×
            </button>
          </span>
        ))}
        {showTagInput ? (
          <input
            ref={tagInputRef}
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddTag();
              if (e.key === 'Escape') { setShowTagInput(false); setNewTag(''); }
            }}
            onBlur={() => { if (newTag.trim()) handleAddTag(); setShowTagInput(false); }}
            placeholder="tag..."
            className="bg-bg-primary border border-border-subtle rounded px-1.5 py-0.5 text-[10px] text-text-primary placeholder-text-muted outline-none focus:border-accent-primary/40 w-20"
          />
        ) : (
          <button
            onClick={() => setShowTagInput(true)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-dashed border-border-subtle text-text-muted hover:text-text-primary hover:border-accent-primary/40 transition-colors"
          >
            +
          </button>
        )}
      </div>

      {/* Row 3: Notes */}
      <div>
        <textarea
          value={notes}
          onChange={(e) => handleNotesChange(e.target.value)}
          placeholder="Add notes..."
          rows={2}
          className="w-full bg-bg-primary border border-border-subtle rounded px-2.5 py-1.5 text-xs text-text-primary placeholder-text-muted outline-none focus:border-accent-primary/40 resize-none"
        />
      </div>
    </div>
  );
}

function CabinetOcrPanel({ text, expanded, onToggle }: {
  text: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const preview = text.slice(0, 120).replace(/\n/g, ' ');

  return (
    <div className="border-t border-border-subtle flex-shrink-0">
      <button
        onClick={onToggle}
        className="w-full px-5 py-2 flex items-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors"
      >
        <svg
          className={cn('w-3 h-3 transition-transform', expanded && 'rotate-90')}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <span className="font-medium">Extracted Text</span>
        {!expanded && (
          <span className="truncate opacity-50 flex-1 text-left">{preview}...</span>
        )}
      </button>
      {expanded && (
        <div className="px-5 pb-3 max-h-[200px] overflow-y-auto scrollbar-hide">
          <pre className="text-[11px] text-text-muted whitespace-pre-wrap font-mono leading-relaxed">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}
