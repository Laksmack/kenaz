import React, { useCallback, useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onCmdEnter?: () => void;
}

export function RichTextEditor({ content, onChange, placeholder, autoFocus, onCmdEnter }: Props) {
  const [linkPopover, setLinkPopover] = useState<{ open: boolean; url: string }>({ open: false, url: '' });
  const linkInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // StarterKit v3 bundles Link and Underline — configure them here instead of adding separately
        link: {
          openOnClick: false,
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        },
        underline: {},
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Color,
      TextStyle,
      Image,
      Placeholder.configure({
        placeholder: placeholder || 'Write your email...',
      }),
    ],
    content,
    autofocus: autoFocus ? 'end' : false,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
          event.preventDefault();
          onCmdEnter?.();
          return true;
        }
        return false;
      },
      // Handle pasted images
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.type.startsWith('image/')) {
            event.preventDefault();
            const file = item.getAsFile();
            if (!file) return true;
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
              const dataUrl = readerEvent.target?.result as string;
              if (dataUrl && editor) {
                editor.chain().focus().setImage({ src: dataUrl }).run();
              }
            };
            reader.readAsDataURL(file);
            return true;
          }
        }
        return false;
      },
      attributes: {
        class: 'prose prose-invert max-w-none focus:outline-none min-h-[200px] px-4 py-3 text-sm text-text-primary',
      },
    },
  });

  // Focus the link input when popover opens
  useEffect(() => {
    if (linkPopover.open) {
      setTimeout(() => linkInputRef.current?.focus(), 50);
    }
  }, [linkPopover.open]);

  const openLinkPopover = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href || '';
    setLinkPopover({ open: true, url: previousUrl });
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const url = linkPopover.url.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    setLinkPopover({ open: false, url: '' });
  }, [editor, linkPopover.url]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setLinkPopover({ open: false, url: '' });
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Formatting Toolbar */}
      <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border-subtle bg-bg-secondary/50 flex-wrap relative">
        {/* Text style group */}
        <ToolbarGroup>
          <ToolbarButton
            active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold (Cmd+B)"
          >
            <span className="font-bold">B</span>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic (Cmd+I)"
          >
            <span className="italic">I</span>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('underline')}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline (Cmd+U)"
          >
            <span className="underline">U</span>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            title="Strikethrough"
          >
            <span className="line-through">S</span>
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarDivider />

        {/* Heading group */}
        <ToolbarGroup>
          <ToolbarButton
            active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            title="Heading 1"
          >
            H1
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            H2
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            H3
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarDivider />

        {/* List group */}
        <ToolbarGroup>
          <ToolbarButton
            active={editor.isActive('bulletList')}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('orderedList')}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Ordered list"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6v.01M3 12v.01M3 18v.01" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            title="Blockquote"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
            </svg>
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarDivider />

        {/* Link */}
        <ToolbarGroup>
          <ToolbarButton
            active={editor.isActive('link')}
            onClick={openLinkPopover}
            title="Insert link"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.54a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.342" />
            </svg>
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarDivider />

        {/* Text align group */}
        <ToolbarGroup>
          <ToolbarButton
            active={editor.isActive({ textAlign: 'left' })}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            title="Align left"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h12M3 18h18" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive({ textAlign: 'center' })}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            title="Align center"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M6 12h12M3 18h18" />
            </svg>
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive({ textAlign: 'right' })}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            title="Align right"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M9 12h12M3 18h18" />
            </svg>
          </ToolbarButton>
        </ToolbarGroup>

        <ToolbarDivider />

        {/* Text color */}
        <ToolbarGroup>
          <label className="relative" title="Text color">
            <input
              type="color"
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              value={editor.getAttributes('textStyle').color || '#ffffff'}
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            />
            <span className="flex items-center justify-center w-6 h-6 rounded text-[11px] font-bold hover:bg-bg-hover transition-colors cursor-pointer"
              style={{ color: editor.getAttributes('textStyle').color || 'var(--color-text-primary)' }}
            >
              A
            </span>
          </label>
        </ToolbarGroup>

        <ToolbarDivider />

        {/* Clear formatting */}
        <ToolbarGroup>
          <ToolbarButton
            active={false}
            onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
            title="Clear formatting"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </ToolbarButton>
        </ToolbarGroup>

        {/* Link popover */}
        {linkPopover.open && (
          <div className="absolute top-full left-0 mt-1 z-50 flex items-center gap-1.5 bg-bg-tertiary border border-border-subtle rounded-lg shadow-lg px-3 py-2 ml-3">
            <input
              ref={linkInputRef}
              type="text"
              value={linkPopover.url}
              onChange={(e) => setLinkPopover({ ...linkPopover, url: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); applyLink(); }
                if (e.key === 'Escape') { e.preventDefault(); setLinkPopover({ open: false, url: '' }); editor.chain().focus().run(); }
              }}
              className="w-64 bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
              placeholder="https://example.com"
            />
            <button
              type="button"
              onClick={applyLink}
              className="px-2 py-1 bg-accent-primary text-white text-[10px] rounded font-medium hover:bg-accent-primary/80 transition-colors"
            >
              Apply
            </button>
            {editor.isActive('link') && (
              <button
                type="button"
                onClick={removeLink}
                className="px-2 py-1 bg-bg-hover text-text-muted text-[10px] rounded font-medium hover:text-accent-danger transition-colors"
              >
                Remove
              </button>
            )}
            <button
              type="button"
              onClick={() => { setLinkPopover({ open: false, url: '' }); editor.chain().focus().run(); }}
              className="p-0.5 text-text-muted hover:text-text-secondary transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Editor area */}
      <div className="flex-1 overflow-y-auto bg-bg-primary selectable">
        <EditorContent editor={editor} className="h-full" />
      </div>
    </div>
  );
}

// ── Toolbar sub-components ──────────────────────────────────

function ToolbarButton({ active, onClick, title, children }: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex items-center justify-center w-6 h-6 rounded text-[11px] font-medium transition-colors
        ${active
          ? 'bg-accent-primary/20 text-accent-primary'
          : 'text-text-muted hover:bg-bg-hover hover:text-text-secondary'
        }`}
    >
      {children}
    </button>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-0.5">{children}</div>;
}

function ToolbarDivider() {
  return <div className="w-px h-4 bg-border-subtle mx-1" />;
}
