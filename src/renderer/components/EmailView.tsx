import React, { useRef, useEffect } from 'react';
import type { EmailThread, Email } from '@shared/types';
import { formatFullDate } from '../lib/utils';

interface Props {
  thread: EmailThread | null;
  onReply: () => void;
  onArchive: () => void;
  onLabel: (label: string) => void;
}

export function EmailView({ thread, onReply, onArchive, onLabel }: Props) {
  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-text-muted">
          <div className="text-4xl mb-3 opacity-30">📧</div>
          <div className="text-sm">Select an email to read</div>
          <div className="text-xs mt-2 space-x-2">
            <kbd className="shortcut-key">J</kbd>
            <kbd className="shortcut-key">K</kbd>
            <span>to navigate</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Thread header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border-subtle">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-text-primary leading-tight">
            {thread.subject || '(no subject)'}
          </h2>
          <div className="flex items-center gap-1 flex-shrink-0">
            <ActionButton
              label="Archive"
              shortcut="E"
              onClick={onArchive}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
            />
            <ActionButton
              label="Pending"
              shortcut="P"
              onClick={() => onLabel('PENDING')}
              color="text-accent-pending"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            />
            <ActionButton
              label="Follow Up"
              shortcut="F"
              onClick={() => onLabel('FOLLOWUP')}
              color="text-accent-followup"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              }
            />
            <ActionButton
              label="Reply"
              shortcut="R"
              onClick={onReply}
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              }
            />
          </div>
        </div>
        <div className="text-xs text-text-muted mt-1">
          {thread.messages.length} message{thread.messages.length !== 1 ? 's' : ''} · {thread.participants.length} participant{thread.participants.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4 space-y-4">
        {thread.messages.map((message, idx) => (
          <MessageBubble key={message.id} message={message} isLast={idx === thread.messages.length - 1} />
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message, isLast }: { message: Email; isLast: boolean }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current) return;

    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #e2e8f0;
            background: transparent;
            margin: 0;
            padding: 0;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          a { color: #4361ee; }
          img { max-width: 100%; height: auto; }
          blockquote {
            border-left: 3px solid #334155;
            margin: 8px 0;
            padding-left: 12px;
            color: #94a3b8;
          }
          pre, code {
            background: #1e293b;
            border-radius: 4px;
            padding: 2px 4px;
            font-size: 13px;
          }
          pre { padding: 12px; overflow-x: auto; }
        </style>
      </head>
      <body>${message.body}</body>
      </html>
    `);
    doc.close();

    // Auto-resize iframe to content
    const resize = () => {
      if (iframeRef.current && doc.body) {
        iframeRef.current.style.height = doc.body.scrollHeight + 'px';
      }
    };

    // Resize after images load
    const images = doc.querySelectorAll('img');
    let loaded = 0;
    if (images.length === 0) {
      resize();
    } else {
      images.forEach((img) => {
        img.addEventListener('load', () => {
          loaded++;
          if (loaded >= images.length) resize();
        });
        img.addEventListener('error', () => {
          loaded++;
          if (loaded >= images.length) resize();
        });
      });
      // Fallback resize
      setTimeout(resize, 500);
    }

    resize();
  }, [message.body]);

  return (
    <div className={`rounded-lg bg-bg-secondary border border-border-subtle ${isLast ? '' : 'opacity-80'}`}>
      {/* Message header */}
      <div className="px-4 py-3 border-b border-border-subtle flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-bg-tertiary flex items-center justify-center text-xs font-semibold text-text-secondary flex-shrink-0">
            {(message.from.name || message.from.email)[0]?.toUpperCase()}
          </div>
          <div>
            <div className="text-sm font-medium text-text-primary">
              {message.from.name || message.from.email}
            </div>
            <div className="text-xs text-text-muted">
              to {message.to.map((t) => t.name || t.email).join(', ')}
              {message.cc.length > 0 && (
                <span> · cc: {message.cc.map((c) => c.name || c.email).join(', ')}</span>
              )}
            </div>
          </div>
        </div>
        <div className="text-xs text-text-muted">
          {formatFullDate(message.date)}
        </div>
      </div>

      {/* Message body - sandboxed iframe */}
      <div className="px-4 py-3 selectable">
        <iframe
          ref={iframeRef}
          className="w-full border-0"
          sandbox="allow-same-origin"
          style={{ minHeight: '60px', background: 'transparent' }}
          title={`Email from ${message.from.email}`}
        />
      </div>

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-border-subtle">
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-primary text-xs text-text-secondary hover:text-text-primary cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span>{att.filename}</span>
                <span className="text-text-muted">({formatBytes(att.size)})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  shortcut,
  onClick,
  icon,
  color,
}: {
  label: string;
  shortcut: string;
  onClick: () => void;
  icon: React.ReactNode;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2 py-1.5 rounded text-xs transition-colors hover:bg-bg-hover ${color || 'text-text-secondary hover:text-text-primary'}`}
      title={`${label} (${shortcut})`}
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
