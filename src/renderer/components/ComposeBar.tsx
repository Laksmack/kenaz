import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { ComposeData, SendEmailPayload } from '@shared/types';

interface Props {
  initialData: Partial<ComposeData> | null;
  onClose: () => void;
  onSent: () => void;
  autoBccEnabled?: boolean;
}

export function ComposeBar({ initialData, onClose, onSent, autoBccEnabled = false }: Props) {
  const [to, setTo] = useState(initialData?.to || '');
  const [cc, setCc] = useState(initialData?.cc || '');
  const [bcc, setBcc] = useState(initialData?.bcc || '');
  const [subject, setSubject] = useState(initialData?.subject || '');
  const [body, setBody] = useState(initialData?.bodyMarkdown || '');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useAutoBcc, setUseAutoBcc] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);
  const sentRef = useRef(false); // track if we sent successfully
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Place cursor at the top of the body (before quoted text)
  useEffect(() => {
    if (bodyRef.current && initialData?.replyToThreadId) {
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(0, 0);
      bodyRef.current.scrollTop = 0;
    }
  }, []);

  const hasContent = Boolean(to || subject || body.trim());

  const handleSend = useCallback(async () => {
    if (!to || !subject) {
      setError('To and Subject are required');
      return;
    }

    setSending(true);
    setError(null);

    try {
      const payload: SendEmailPayload = {
        to,
        cc: cc || undefined,
        bcc: bcc || undefined,
        subject,
        body_markdown: body,
        reply_to_thread_id: initialData?.replyToThreadId,
        reply_to_message_id: initialData?.replyToMessageId,
        signature: true,
        skip_auto_bcc: autoBccEnabled ? !useAutoBcc : undefined,
      };

      await window.kenaz.sendEmail(payload);

      // If we were editing a draft, delete it after sending
      if (initialData?.draftId) {
        try { await window.kenaz.deleteDraft(initialData.draftId); } catch {}
      }

      sentRef.current = true;
      onSent();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }, [to, cc, bcc, subject, body, initialData, onSent, autoBccEnabled, useAutoBcc]);

  const handleClose = useCallback(async () => {
    if (sentRef.current || !hasContent) {
      onClose();
      return;
    }

    // Auto-save as draft
    setSavingDraft(true);
    try {
      await window.kenaz.createDraft({
        to: to || undefined,
        cc: cc || undefined,
        bcc: bcc || undefined,
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
  }, [to, cc, bcc, subject, body, initialData, hasContent, onClose]);

  return (
    <div className="border-t border-border-subtle bg-bg-secondary">
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
            title={hasContent ? 'Close & save as draft' : 'Close'}
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
          <input
            type="text"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
            placeholder="recipient@example.com"
          />
          <button
            onClick={() => setShowCcBcc(!showCcBcc)}
            className="text-[10px] text-text-muted hover:text-text-secondary"
          >
            Cc/Bcc
          </button>
        </div>

        {showCcBcc && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted w-12">Cc</label>
              <input
                type="text"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="flex-1 bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted w-12">Bcc</label>
              <input
                type="text"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                className="flex-1 bg-bg-primary border border-border-subtle rounded px-2 py-1 text-xs text-text-primary outline-none focus:border-accent-primary"
              />
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
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-text-muted">Markdown supported · Cmd+Enter to send</span>
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
