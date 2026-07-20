import React from 'react';
import { isPdf, isDocx, isHtml, isImage, isMarkdown } from './detail/fileTypes';
import { PdfDetail } from './PdfDetail';
import { MarkdownDetail } from './detail/MarkdownDetail';
import { FileDetail } from './detail/FileDetail';
import { HtmlDetail } from './detail/HtmlDetail';
import { DocxDetail } from './detail/DocxDetail';
import { ImageDetail } from './detail/ImageDetail';
import { CabinetDocumentDetail } from './detail/CabinetDocumentDetail';

// ── Smart Router ─────────────────────────────────────────────
// Picks the right viewer/editor for a given path. The individual
// viewers live under ./detail/.

interface NoteDetailProps {
  notePath: string | null;
  onMarkProcessed?: () => void;
  onFolderNavigate?: (folderName: string) => void;
  onNoteNavigate?: (noteName: string) => void;
  /** Reports whether the open editor has unsaved changes (drives the tab dot). */
  onDirtyChange?: (dirty: boolean) => void;
}

export function NoteDetail({ notePath, onMarkProcessed, onFolderNavigate, onNoteNavigate, onDirtyChange }: NoteDetailProps) {
  if (!notePath) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-40">ᛚ</div>
          <div className="text-sm">Select a note to view</div>
        </div>
      </div>
    );
  }

  if (notePath.startsWith('_cabinet/')) {
    return <CabinetDocumentDetail filePath={notePath} />;
  }

  if (isPdf(notePath)) {
    return <PdfDetail filePath={notePath} />;
  }

  if (isDocx(notePath)) {
    return <DocxDetail filePath={notePath} />;
  }

  if (isHtml(notePath)) {
    return <HtmlDetail filePath={notePath} onDirtyChange={onDirtyChange} />;
  }

  if (isImage(notePath)) {
    return <ImageDetail filePath={notePath} />;
  }

  if (isMarkdown(notePath)) {
    return <MarkdownDetail notePath={notePath} onMarkProcessed={onMarkProcessed} onFolderNavigate={onFolderNavigate} onNoteNavigate={onNoteNavigate} onDirtyChange={onDirtyChange} />;
  }

  return <FileDetail filePath={notePath} onDirtyChange={onDirtyChange} />;
}
