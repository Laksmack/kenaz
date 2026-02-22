import React from 'react';
import type { PdfAnnotation } from '../types';

type AnnotationType = PdfAnnotation['type'];

interface ToolDef {
  type: AnnotationType;
  label: string;
  icon: React.ReactNode;
}

const COLORS = ['#E8834A', '#E74C3C', '#3498DB', '#2ECC71', '#9B59B6', '#F39C12', '#000000'];

const TOOLS: ToolDef[] = [
  {
    type: 'highlight',
    label: 'Highlight',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
  },
  {
    type: 'underline',
    label: 'Underline',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" d="M6 19h12" />
        <path strokeLinecap="round" d="M8 5v6a4 4 0 008 0V5" />
      </svg>
    ),
  },
  {
    type: 'text-note',
    label: 'Note',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
    ),
  },
  {
    type: 'text-box',
    label: 'Text Box',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
      </svg>
    ),
  },
];

interface PdfAnnotationToolbarProps {
  activeTool: AnnotationType | null;
  onToolChange: (tool: AnnotationType | null) => void;
  onSave: () => void;
  onFlatten: () => void;
  hasAnnotations: boolean;
  onSignClick: () => void;
  activeColor: string;
  onColorChange: (color: string) => void;
}

export function PdfAnnotationToolbar({
  activeTool,
  onToolChange,
  onSave,
  onFlatten,
  hasAnnotations,
  onSignClick,
  activeColor,
  onColorChange,
}: PdfAnnotationToolbarProps) {
  return (
    <div className="h-9 flex items-center gap-1 px-3 border-b border-border-subtle bg-bg-secondary flex-shrink-0">
      {/* Annotation tools */}
      {TOOLS.map((tool) => (
        <button
          key={tool.type}
          onClick={() => onToolChange(activeTool === tool.type ? null : tool.type)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
            activeTool === tool.type
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
          }`}
          title={tool.label}
        >
          {tool.icon}
          <span className="hidden sm:inline">{tool.label}</span>
        </button>
      ))}

      <div className="w-px h-5 bg-border-subtle mx-1" />

      {/* Sign button */}
      <button
        onClick={onSignClick}
        className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
        title="Place signature"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0016.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m0 0a6.003 6.003 0 01-5.54 0" />
        </svg>
        <span>Sign</span>
      </button>

      <div className="w-px h-5 bg-border-subtle mx-1" />

      {/* Color picker */}
      <div className="flex items-center gap-1">
        {COLORS.map(c => (
          <button
            key={c}
            onClick={() => onColorChange(c)}
            className={`w-4 h-4 rounded-full transition-all hover:scale-110 ${activeColor === c ? 'scale-125' : ''}`}
            style={{
              backgroundColor: c,
              boxShadow: activeColor === c ? '0 0 0 2px rgba(255,255,255,0.3)' : 'none',
            }}
          />
        ))}
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <button
        onClick={onSave}
        disabled={!hasAnnotations}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
          hasAnnotations
            ? 'bg-accent-primary/15 text-accent-primary hover:bg-accent-primary/25'
            : 'text-text-muted/40 cursor-default'
        }`}
      >
        Save to PDF
      </button>
      <button
        onClick={onFlatten}
        disabled={!hasAnnotations}
        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
          hasAnnotations
            ? 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            : 'text-text-muted/40 cursor-default'
        }`}
        title="Save flattened copy (bakes annotations into a new PDF)"
      >
        Export Copy
      </button>
    </div>
  );
}
