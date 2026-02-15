import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ComposeData, SendEmailPayload, EmailAttachment } from '@shared/types';
import { RichTextEditor } from './RichTextEditor';

// ── Email Chip Input with Autocomplete ──────────────────────
// Renders emails as removable chips. Autocompletes from local contact cache.

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().replace(/^<|>$/g, ''))
    .filter((s) => s.includes('@'));
}

interface ContactSuggestion {
  email: string;
  name: string;
  frequency: number;
}

function EmailChipInput({
  emails,
  onChange,
  placeholder,
  inputRef,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const internalRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || internalRef;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const addEmails = useCallback((raw: string) => {
    const newEmails = parseEmails(raw);
    if (newEmails.length > 0) {
      const merged = [...emails];
      for (const e of newEmails) {
        if (!merged.some((m) => m.toLowerCase() === e.toLowerCase())) {
          merged.push(e);
        }
      }
      onChange(merged);
    }
    setInput('');
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIdx(0);
  }, [emails, onChange]);

  const selectSuggestion = useCallback((suggestion: ContactSuggestion) => {
    const email = suggestion.email;
    if (!emails.some((e) => e.toLowerCase() === email.toLowerCase())) {
      onChange([...emails, email]);
    }
    setInput('');
    setSuggestions([]);
    setShowSuggestions(false);
    setSelectedIdx(0);
    // Re-focus input after selection
    setTimeout(() => (ref as React.RefObject<HTMLInputElement>).current?.focus(), 0);
  }, [emails, onChange, ref]);

  const removeEmail = useCallback((idx: number) => {
    onChange(emails.filter((_, i) => i !== idx));
  }, [emails, onChange]);

  // Fetch suggestions when input changes (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (input.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const results = await window.kenaz.suggestContacts(input.trim(), 8);
        // Filter out emails already added as chips
        const existing = new Set(emails.map((e) => e.toLowerCase()));
        const filtered = results.filter((r) => !existing.has(r.email.toLowerCase()));
        setSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
        setSelectedIdx(0);
      } catch {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 150);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input, emails]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Autocomplete navigation
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectSuggestion(suggestions[selectedIdx]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSuggestions(false);
        return;
      }
    }

    // Normal chip behavior
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      if (input.trim()) {
        if (e.key !== 'Tab') {
          e.preventDefault();
        }
        addEmails(input);
      }
    } else if (e.key === 'Backspace' && !input && emails.length > 0) {
      removeEmail(emails.length - 1);
    }
  }, [input, emails, addEmails, removeEmail, showSuggestions, suggestions, selectedIdx, selectSuggestion]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    addEmails(pasted);
  }, [addEmails]);

  const handleBlur = useCallback(() => {
    // Delay to allow click on suggestion to fire first
    setTimeout(() => {
      if (input.trim()) addEmails(input);
      setShowSuggestions(false);
    }, 150);
  }, [input, addEmails]);

  const handleFocus = useCallback(() => {
    // Re-show suggestions if we have them and input is long enough
    if (suggestions.length > 0 && input.trim().length >= 2) {
      setShowSuggestions(true);
    }
  }, [suggestions, input]);

  // Highlight matching portion in a string
  const highlightMatch = (text: string, query: string) => {
    if (!text || !query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="text-accent-primary font-semibold">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    );
  };

  return (
    <div className="flex-1 relative" ref={containerRef}>
      <div
        className="flex flex-wrap items-center gap-1 bg-bg-primary border border-border-subtle rounded px-2 py-1 min-h-[28px] cursor-text focus-within:border-accent-primary"
        onClick={() => (ref as React.RefObject<HTMLInputElement>).current?.focus()}
      >
        {emails.map((email, i) => (
          <span
            key={`${email}-${i}`}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent-primary/15 text-accent-primary text-[11px] font-medium max-w-[200px]"
          >
            <span className="truncate">{email}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeEmail(i); }}
              className="flex-shrink-0 hover:text-accent-danger transition-colors"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={handleBlur}
          onFocus={handleFocus}
          className="flex-1 min-w-[120px] bg-transparent text-xs text-text-primary outline-none"
          placeholder={emails.length === 0 ? placeholder : ''}
          autoComplete="off"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-bg-tertiary border border-border-subtle rounded-lg shadow-xl overflow-hidden"
        >
          {suggestions.map((s, i) => (
            <div
              key={s.email}
              className={`px-3 py-2 cursor-pointer transition-colors ${
                i === selectedIdx
                  ? 'bg-accent-primary/15'
                  : 'hover:bg-bg-hover'
              }`}
              onMouseDown={(e) => {
                e.preventDefault(); // Prevent blur from firing before click
                selectSuggestion(s);
              }}
              onMouseEnter={() => setSelectedIdx(i)}
            >
              {s.name && s.name !== s.email ? (
                <>
                  <div className="text-xs text-text-primary leading-tight">
                    {highlightMatch(s.name, input.trim())}
                  </div>
                  <div className="text-[11px] text-text-muted leading-tight">
                    {highlightMatch(s.email, input.trim())}
                  </div>
                </>
              ) : (
                <div className="text-xs text-text-primary leading-tight">
                  {highlightMatch(s.email, input.trim())}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Compose Bar ─────────────────────────────────────────────

interface Props {
  initialData: Partial<ComposeData> | null;
  onClose: () => void;
  onSent: (payload: SendEmailPayload, draftId?: string) => void;
  autoBccEnabled?: boolean;
  composeMode?: 'html' | 'markdown';
}

export function ComposeBar({ initialData, onClose, onSent, autoBccEnabled = false, composeMode = 'html' }: Props) {
  const [to, setTo] = useState<string[]>(() => initialData?.to ? parseEmails(initialData.to) : []);
  const [cc, setCc] = useState<string[]>(() => initialData?.cc ? parseEmails(initialData.cc) : []);
  const [bcc, setBcc] = useState<string[]>(() => initialData?.bcc ? parseEmails(initialData.bcc) : []);
  const [subject, setSubject] = useState(initialData?.subject || '');
  // For HTML mode, initialize from bodyHtml if available, else bodyMarkdown
  const initialBodyHtml = initialData?.bodyHtml || initialData?.bodyMarkdown || '';
  const initialBodyMarkdown = initialData?.bodyMarkdown || '';

  const [bodyMarkdown, setBodyMarkdown] = useState(initialBodyMarkdown);
  const [bodyHtml, setBodyHtml] = useState(initialBodyHtml);
  const [showCcBcc, setShowCcBcc] = useState(() => (initialData?.cc || initialData?.bcc) ? true : false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useAutoBcc, setUseAutoBcc] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const [attachments, setAttachments] = useState<EmailAttachment[]>(initialData?.attachments || []);
  const [dragging, setDragging] = useState(false);
  const sentRef = useRef(false); // track if we sent successfully
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCountRef = useRef(0);

  // Snapshot the initial state so we can detect real changes
  const initialSnapshot = useRef({
    to: initialData?.to ? parseEmails(initialData.to).sort().join(',') : '',
    cc: initialData?.cc ? parseEmails(initialData.cc).sort().join(',') : '',
    bcc: initialData?.bcc ? parseEmails(initialData.bcc).sort().join(',') : '',
    subject: initialData?.subject || '',
    bodyMarkdown: initialBodyMarkdown,
    bodyHtml: initialBodyHtml,
  });

  // Auto-focus: TO field for new compose, body for replies (markdown only — TipTap handles its own autofocus)
  useEffect(() => {
    if (composeMode === 'markdown' && initialData?.replyToThreadId && bodyRef.current) {
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(0, 0);
      bodyRef.current.scrollTop = 0;
    } else if (!initialData?.replyToThreadId && toRef.current) {
      toRef.current.focus();
    }
  }, []);

  const hasChanges = (() => {
    const snap = initialSnapshot.current;
    const bodyChanged = composeMode === 'html'
      ? bodyHtml !== snap.bodyHtml
      : bodyMarkdown !== snap.bodyMarkdown;
    return (
      [...to].sort().join(',') !== snap.to ||
      [...cc].sort().join(',') !== snap.cc ||
      [...bcc].sort().join(',') !== snap.bcc ||
      subject !== snap.subject ||
      bodyChanged ||
      attachments.length > 0
    );
  })();

  // Add files as attachments (via drag & drop or file picker)
  const addFiles = useCallback(async (filePaths: string[]) => {
    for (const filePath of filePaths) {
      try {
        const result = await window.kenaz.readFileBase64(filePath);
        setAttachments((prev) => {
          // Skip duplicates by filename
          if (prev.some((a) => a.filename === result.filename)) return prev;
          return [...prev, {
            filename: result.filename,
            mimeType: result.mimeType,
            base64: result.base64,
            size: result.size,
          }];
        });
      } catch (e) {
        console.error('Failed to read file:', e);
      }
    }
  }, []);

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current++;
    if (dragCountRef.current === 1) setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current--;
    if (dragCountRef.current === 0) setDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCountRef.current = 0;
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // In Electron, dropped files have a `path` property
      const paths = files.map((f) => (f as any).path).filter(Boolean);
      if (paths.length > 0) addFiles(paths);
    }
  }, [addFiles]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const paths = files.map((f) => (f as any).path).filter(Boolean);
    if (paths.length > 0) addFiles(paths);
    // Reset input so the same file can be selected again
    e.target.value = '';
  }, [addFiles]);

  const handleSend = useCallback(async () => {
    if (to.length === 0 || !subject) {
      setError('To and Subject are required');
      return;
    }

    const payload: SendEmailPayload = {
      to: to.join(', '),
      cc: cc.length > 0 ? cc.join(', ') : undefined,
      bcc: bcc.length > 0 ? bcc.join(', ') : undefined,
      subject,
      body_markdown: composeMode === 'markdown' ? bodyMarkdown : '',
      body_html: composeMode === 'html' ? bodyHtml : undefined,
      reply_to_thread_id: initialData?.replyToThreadId,
      reply_to_message_id: initialData?.replyToMessageId,
      signature: true,
      skip_auto_bcc: autoBccEnabled ? !useAutoBcc : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    sentRef.current = true;
    onSent(payload, initialData?.draftId);
  }, [to, cc, bcc, subject, bodyMarkdown, bodyHtml, composeMode, initialData, onSent, autoBccEnabled, useAutoBcc, attachments]);

  const handleSaveDraft = useCallback(async () => {
    setSavingDraft(true);
    try {
      const draftBody = composeMode === 'html' ? bodyHtml : bodyMarkdown;
      await window.kenaz.createDraft({
        to: to.length > 0 ? to.join(', ') : undefined,
        cc: cc.length > 0 ? cc.join(', ') : undefined,
        bcc: bcc.length > 0 ? bcc.join(', ') : undefined,
        subject: subject || undefined,
        body_markdown: draftBody || undefined,
        reply_to_thread_id: initialData?.replyToThreadId,
      });
      if (initialData?.draftId) {
        try { await window.kenaz.deleteDraft(initialData.draftId); } catch {}
      }
    } catch (e) {
      console.error('Failed to save draft:', e);
    } finally {
      setSavingDraft(false);
      onClose();
    }
  }, [to, cc, bcc, subject, bodyMarkdown, bodyHtml, composeMode, initialData, onClose]);

  const handleDiscard = useCallback(async () => {
    // Delete the draft if this was a draft
    if (initialData?.draftId) {
      try { await window.kenaz.deleteDraft(initialData.draftId); } catch (e) {
        console.error('Failed to delete draft:', e);
      }
    }
    onClose();
  }, [initialData, onClose]);

  // Escape key → save draft if changes, otherwise just close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (hasChanges && !sentRef.current) {
          handleSaveDraft();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasChanges, handleSaveDraft, onClose]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalAttachmentSize = attachments.reduce((sum, a) => sum + a.size, 0);

  return (
    <div
      className={`flex flex-col h-full bg-bg-secondary relative ${dragging ? 'ring-2 ring-accent-primary ring-inset' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-accent-primary/10 border-2 border-dashed border-accent-primary rounded pointer-events-none">
          <span className="text-sm font-medium text-accent-primary">Drop files to attach</span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle flex-shrink-0">
        <span className="text-xs font-semibold text-text-secondary">
          {initialData?.draftId ? 'Draft' : initialData?.replyToThreadId ? 'Reply' : 'New Email'}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleSend}
            disabled={sending || savingDraft}
            className="px-3 py-1 bg-accent-primary hover:bg-accent-primary/80 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
            title="Send (Cmd+Enter)"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={sending || savingDraft}
            className="px-3 py-1 bg-bg-hover hover:bg-border-subtle disabled:opacity-50 text-text-secondary text-xs rounded font-medium transition-colors"
            title="Save as draft (Esc)"
          >
            {savingDraft ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={handleDiscard}
            disabled={sending || savingDraft}
            className="px-3 py-1 bg-bg-hover hover:bg-red-500/20 hover:text-red-400 disabled:opacity-50 text-text-muted text-xs rounded font-medium transition-colors"
            title="Discard"
          >
            Discard
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-1.5 bg-accent-danger/10 text-accent-danger text-xs flex-shrink-0">{error}</div>
      )}

      {/* Fields */}
      <div className="px-4 py-2 space-y-1.5 flex-shrink-0">
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted w-12">To</label>
          <EmailChipInput
            emails={to}
            onChange={setTo}
            placeholder="recipient@example.com"
            inputRef={toRef as React.RefObject<HTMLInputElement>}
          />
          <button
            onClick={() => setShowCcBcc(!showCcBcc)}
            className="text-[10px] text-text-muted hover:text-text-secondary flex-shrink-0"
          >
            Cc/Bcc
          </button>
        </div>

        {showCcBcc && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted w-12">Cc</label>
              <EmailChipInput emails={cc} onChange={setCc} placeholder="cc@example.com" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted w-12">Bcc</label>
              <EmailChipInput emails={bcc} onChange={setBcc} placeholder="bcc@example.com" />
            </div>
          </>
        )}

        <div className="flex items-center gap-2">
          <label className="text-xs text-text-muted w-12">Subject</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
            placeholder="Subject"
          />
        </div>
      </div>

      {/* Editor area — fills remaining space */}
      {composeMode === 'html' ? (
        <RichTextEditor
          content={bodyHtml}
          onChange={setBodyHtml}
          placeholder="Write your email..."
          autoFocus={!!initialData?.replyToThreadId}
          onCmdEnter={handleSend}
        />
      ) : (
        <div className="flex-1 flex flex-col px-4 pb-3 overflow-hidden">
          <textarea
            ref={bodyRef}
            value={bodyMarkdown}
            onChange={(e) => setBodyMarkdown(e.target.value)}
            className="flex-1 w-full bg-bg-primary border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary resize-none font-mono selectable"
            placeholder="Write in markdown..."
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSend();
              }
            }}
          />
        </div>
      )}

      {/* Footer: Attachments + info bar */}
      <div className="flex-shrink-0 px-4 py-2 border-t border-border-subtle">
        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {attachments.map((att, i) => (
              <span
                key={`${att.filename}-${i}`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-bg-hover border border-border-subtle text-[11px] text-text-secondary max-w-[220px] group"
              >
                <svg className="w-3 h-3 flex-shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="truncate">{att.filename}</span>
                <span className="text-text-muted text-[9px] flex-shrink-0">({formatSize(att.size)})</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="flex-shrink-0 text-text-muted hover:text-accent-danger transition-colors opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
              </span>
            ))}
            {totalAttachmentSize > 20 * 1024 * 1024 && (
              <span className="text-[10px] text-accent-danger self-center ml-1">
                Total size exceeds 20 MB — email may fail
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
              title="Attach files"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
            <span className="text-[10px] text-text-muted">
              {composeMode === 'html' ? 'Rich text' : 'Markdown'} · Cmd+Enter to send
            </span>
          </div>
          <div className="flex items-center gap-3">
            {autoBccEnabled && (
              <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Automatically BCC your CRM logging address">
                <input
                  type="checkbox"
                  checked={useAutoBcc}
                  onChange={(e) => setUseAutoBcc(e.target.checked)}
                  className="w-3 h-3 rounded border-border-subtle accent-accent-primary cursor-pointer"
                />
                <span className="text-[10px] text-text-muted">Auto BCC</span>
              </label>
            )}
            <span className="text-[10px] text-text-muted">Signature will be appended</span>
          </div>
        </div>
      </div>
    </div>
  );
}
