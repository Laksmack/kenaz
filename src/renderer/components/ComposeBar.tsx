import React, { useState, useCallback } from 'react';
import type { ComposeData, SendEmailPayload } from '@shared/types';

interface Props {
  initialData: Partial<ComposeData> | null;
  onClose: () => void;
  onSent: () => void;
}

export function ComposeBar({ initialData, onClose, onSent }: Props) {
  const [to, setTo] = useState(initialData?.to || '');
  const [cc, setCc] = useState(initialData?.cc || '');
  const [bcc, setBcc] = useState(initialData?.bcc || '');
  const [subject, setSubject] = useState(initialData?.subject || '');
  const [body, setBody] = useState(initialData?.bodyMarkdown || '');
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = useCallback(async () => {
    if (!to || !subject || !body) {
      setError('To, Subject, and Body are required');
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
      };

      await window.kenaz.sendEmail(payload);
      onSent();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }, [to, cc, bcc, subject, body, initialData, onSent]);

  return (
    <div className="border-t border-border-subtle bg-bg-secondary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
        <span className="text-xs font-semibold text-text-secondary">
          {initialData?.replyToThreadId ? 'Reply' : 'New Email'}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-3 py-1 bg-accent-primary hover:bg-accent-primary/80 disabled:opacity-50 text-white text-xs rounded font-medium transition-colors"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text-secondary transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
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
          <span className="text-[10px] text-text-muted">Signature will be appended</span>
        </div>
      </div>
    </div>
  );
}
