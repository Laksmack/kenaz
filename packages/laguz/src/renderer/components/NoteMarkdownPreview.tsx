import React, { useMemo, useRef, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

function stripFrontmatter(content: string): string {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return content;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') return lines.slice(i + 1).join('\n').trimStart();
  }
  return content;
}

interface CheckboxPosition {
  lineIndex: number;
  charIndex: number;
  checked: boolean;
}

function findTableCheckboxes(content: string): CheckboxPosition[] {
  const positions: CheckboxPosition[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trimStart().startsWith('|')) continue;
    if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) continue;
    let searchStart = 0;
    while (true) {
      const unchecked = line.indexOf('[ ]', searchStart);
      const checked = line.indexOf('[x]', searchStart);
      let idx = -1;
      let isChecked = false;
      if (unchecked >= 0 && (checked < 0 || unchecked < checked)) { idx = unchecked; }
      else if (checked >= 0) { idx = checked; isChecked = true; }
      if (idx < 0) break;
      positions.push({ lineIndex: i, charIndex: idx, checked: isChecked });
      searchStart = idx + 3;
    }
  }
  return positions;
}

function toggleCheckboxInContent(content: string, pos: CheckboxPosition): string {
  const lines = content.split('\n');
  const line = lines[pos.lineIndex];
  const replacement = pos.checked ? '[ ]' : '[x]';
  lines[pos.lineIndex] = line.substring(0, pos.charIndex) + replacement + line.substring(pos.charIndex + 3);
  return lines.join('\n');
}

function addTableCheckboxesToHtml(html: string): string {
  let idx = 0;
  return html.replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (match, attrs, cellContent) => {
    let modified = false;
    const processed = cellContent.replace(/\[([ x])\]/g, (_: string, state: string) => {
      modified = true;
      const checked = state === 'x';
      return `<input type="checkbox" class="laguz-table-cb" data-cb-idx="${idx++}" ${checked ? 'checked' : ''} />`;
    });
    return modified ? `<td${attrs}>${processed}</td>` : match;
  });
}

function addWikiLinksToHtml(html: string, folderNames: Set<string>): string {
  return html.replace(/\[\[([^\]]+)\]\]/g, (_, target) => {
    const isFolder = folderNames.has(target);
    const icon = isFolder ? '\uD83D\uDCC1' : '\uD83D\uDCC4';
    const cls = isFolder ? 'laguz-wikilink laguz-wikilink-folder' : 'laguz-wikilink laguz-wikilink-note';
    return `<a class="${cls}" data-wiki-target="${encodeURIComponent(target)}" href="#">${icon} ${target}</a>`;
  });
}

const PURIFY_MARKDOWN = {
  ADD_ATTR: ['data-cb-idx', 'data-wiki-target'],
} as const;

export function NoteViewer({ content, notePath, onContentChange, folderNames, onFolderNavigate, onNoteNavigate, onPdfOpen }: {
  content: string;
  notePath?: string;
  onContentChange?: (content: string) => void;
  folderNames?: Set<string>;
  onFolderNavigate?: (folderName: string) => void;
  onNoteNavigate?: (noteName: string) => void;
  onPdfOpen?: (pdfPath: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const { html, checkboxPositions } = useMemo(() => {
    const body = stripFrontmatter(content);
    let rendered = marked.parse(body, { async: false }) as string;
    const positions = findTableCheckboxes(content);
    rendered = addTableCheckboxesToHtml(rendered);
    rendered = addWikiLinksToHtml(rendered, folderNames ?? new Set());
    const safe = DOMPurify.sanitize(rendered, PURIFY_MARKDOWN);
    return { html: safe, checkboxPositions: positions };
  }, [content, folderNames]);

  useEffect(() => {
    if (!containerRef.current) return;

    const handleCheckboxChange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (!target.classList.contains('laguz-table-cb')) return;
      e.preventDefault();
      const idx = parseInt(target.dataset.cbIdx || '0', 10);
      const pos = checkboxPositions[idx];
      if (!pos) return;
      const newContent = toggleCheckboxInContent(content, pos);
      onContentChange?.(newContent);
      if (notePath) {
        window.laguz.writeNote(notePath, newContent).catch(console.error);
      }
    };

    const handleClick = (e: Event) => {
      const wikiAnchor = (e.target as HTMLElement).closest('.laguz-wikilink') as HTMLAnchorElement | null;
      if (wikiAnchor) {
        e.preventDefault();
        const target = decodeURIComponent(wikiAnchor.dataset.wikiTarget || '');
        if (!target) return;
        if (/\.pdf$/i.test(target)) {
          onPdfOpen?.(target);
          return;
        }
        if (wikiAnchor.classList.contains('laguz-wikilink-folder')) {
          onFolderNavigate?.(target);
        } else {
          onNoteNavigate?.(target);
        }
        return;
      }

      const anchor = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null;
      if (anchor && !anchor.classList.contains('laguz-wikilink')) {
        const href = anchor.getAttribute('href') || '';
        if (/\.pdf$/i.test(href) && !href.startsWith('http')) {
          e.preventDefault();
          onPdfOpen?.(href);
        }
      }
    };

    const el = containerRef.current;
    el.addEventListener('change', handleCheckboxChange);
    el.addEventListener('click', handleClick);
    return () => {
      el.removeEventListener('change', handleCheckboxChange);
      el.removeEventListener('click', handleClick);
    };
  }, [html, checkboxPositions, content, notePath, onContentChange, onFolderNavigate, onNoteNavigate, onPdfOpen]);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4">
      <div className="prose-laguz" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
