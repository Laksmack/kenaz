import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ComposeData, SendEmailPayload, EmailAttachment } from '@shared/types';

// ── Email Chip Input ────────────────────────────────────────
// Renders emails as removable chips. Type and press Enter/Tab/comma to add.

function parseEmails(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().replace(/^<|>$/g, ''))
    .filter((s) => s.includes('@'));
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
  const internalRef = useRef<HTMLInputElement>(null);
  const ref = inputRef || internalRef;

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
  }, [emails, onChange]);

  const removeEmail = useCallback((idx: number) => {
    onChange(emails.filter((_, i) => i !== idx));
  }, [emails, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') {
      if (input.trim()) {
        e.preventDefault();
        addEmails(input);
      }
    } else if (e.key === 'Backspace' && !input && emails.length > 0) {
      removeEmail(emails.length - 1);
    }
  }, [input, emails, addEmails, removeEmail]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    addEmails(pasted);
  }, [addEmails]);

  const handleBlur = useCallback(() => {
    if (input.trim()) addEmails(input);
  }, [input, addEmails]);

  return (
    <div
      className="flex-1 flex flex-wrap items-center gap-1 bg-bg-primary border border-border-subtle rounded px-2 py-1 min-h-[28px] cursor-text focus-within:border-accent-primary"
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
        className="flex-1 min-w-[120px] bg-transparent text-xs text-text-primary outline-none"
        placeholder={emails.length === 0 ? placeholder : ''}
      />
    </div>
  );
}

// ── Compose Bar ─────────────────────────────────────────────

interface Props {
  initialData: Partial<ComposeData> | null;
  onClose: () => void;
  onSent: (payload: SendEmailPayload, draftId?: string) => void;
  autoBccEnabled?: boolean;
}

export function ComposeBar({ initialData, onClose, onSent, autoBccEnabled = false }: Props) {
  const [to, setTo] = useState<string[]>(() => initialData?.to ? parseEmails(initialData.to) : []);
  const [cc, setCc] = useState<string[]>(() => initialData?.cc ? parseEmails(initialData.cc) : []);
  const [bcc, setBcc] = useState<string[]>(() => initialData?.bcc ? parseEmails(initialData.bcc) : []);
  const [subject, setSubject] = useState(initialData?.subject || '');
  const [body, setBody] = useState(initialData?.bodyMarkdown || '');
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
    body: initialData?.bodyMarkdown || '',
  });

  // Auto-focus: TO field for new compose, body for replies
  useEffect(() => {
    if (initialData?.replyToThreadId && bodyRef.current) {
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(0, 0);
      bodyRef.current.scrollTop = 0;
    } else if (toRef.current) {
      toRef.current.focus();
    }
  }, []);

  const hasChanges = (() => {
    const snap = initialSnapshot.current;
    return (
      [...to].sort().join(',') !== snap.to ||
      [...cc].sort().join(',') !== snap.cc ||
      [...bcc].sort().join(',') !== snap.bcc ||
      subject !== snap.subject ||
      body !== snap.body ||
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
      body_markdown: body,
      reply_to_thread_id: initialData?.replyToThreadId,
      reply_to_message_id: initialData?.replyToMessageId,
      signature: true,
      skip_auto_bcc: autoBccEnabled ? !useAutoBcc : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    };

    sentRef.current = true;
    onSent(payload, initialData?.draftId);
  }, [to, cc, bcc, subject, body, initialData, onSent, autoBccEnabled, useAutoBcc]);

  const handleClose = useCallback(async () => {
    if (sentRef.current || !hasChanges) {
      onClose();
      return;
    }

    // Auto-save as draft
    setSavingDraft(true);
    try {
      await window.kenaz.createDraft({
        to: to.length > 0 ? to.join(', ') : undefined,
        cc: cc.length > 0 ? cc.join(', ') : undefined,
        bcc: bcc.length > 0 ? bcc.join(', ') : undefined,
        subject: subject || undefined,
        body_markdown: body || undefined,
        reply_to_thread_id: initialData?.replyToThreadId,
      });

      // If we resumed from an existing draft, delete the old one
      if (initialData?.draftId) {
        try { await window.kenaz.deleteDraft(initialData.draftId); } catch {}
      }
    } catch (e) {
      console.error('Failed to save draft:', e);
    } finally {
      setSavingDraft(false);
      onClose();
    }
  }, [to, cc, bcc, subject, body, initialData, hasChanges, onClose]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalAttachmentSize = attachments.reduce((sum, a) => sum + a.size, 0);

  return (
    <div
      className={`border-t border-border-subtle bg-bg-secondary relative ${dragging ? 'ring-2 ring-accent-primary ring-inset' : ''}`}
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
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <span className="text-xs font-semibold text-text-secondary">
          {initialData?.draftId ? 'Draft' : initialData?.replyToThreadId ? 'Reply' : 'New Email'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSend}
            disabled={sending || savingDraft}
            className="px-3 py-1 bg-accent-primary hover:bg-accent-primary/80 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
          <button
            onClick={handleClose}
            disabled={savingDraft}
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
            title={hasChanges ? 'Close & save as draft' : 'Close'}
          >
            {savingDraft ? (
              <span className="text-[10px] text-text-muted px-1">Saving...</span>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-1.5 bg-accent-danger/10 text-accent-danger text-xs">{error}</div>
      )}

      {/* Fields */}
      <div className="px-4 py-2 space-y-1.5">
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

      {/* Body - markdown editor */}
      <div className="px-4 pb-3">
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full h-32 bg-bg-primary border border-border-subtle rounded px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary resize-y font-mono selectable"
          placeholder="Write in markdown..."
          onKeyDown={(e) => {
            // Cmd+Enter to send
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
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

        <div className="flex items-center justify-between mt-1">
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
            <span className="text-[10px] text-text-muted">Markdown supported · Cmd+Enter to send</span>
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
