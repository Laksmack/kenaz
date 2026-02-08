import React, { useRef, useEffect } from 'react';
import type { EmailThread, Email } from '@shared/types';
import { formatFullDate } from '../lib/utils';

interface Props {
  thread: EmailThread | null;
  onReply: () => void;
  onArchive: () => void;
  onLabel: (label: string) => void;
  onStar: () => void;
}

export function EmailView({ thread, onReply, onArchive, onLabel, onStar }: Props) {
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
              label="Done"
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
              label="Todo"
              shortcut="T"
              onClick={() => onLabel('FOLLOWUP')}
              color="text-accent-followup"
              icon={
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              }
            />
            <ActionButton
              label={thread.labels.includes('STARRED') ? 'Unstar' : 'Star'}
              shortcut="S"
              onClick={onStar}
              color={thread.labels.includes('STARRED') ? 'text-yellow-400' : undefined}
              icon={
                <svg className="w-4 h-4" fill={thread.labels.includes('STARRED') ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
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
          html {
            color-scheme: dark;
          }
          html, body {
            font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
            font-size: 14px;
            line-height: 1.5;
            color: #e2e8f0 !important;
            background: transparent !important;
            margin: 0;
            padding: 0;
            word-wrap: break-word;
            overflow-wrap: break-word;
            overflow: hidden;
          }
          /* Force dark-friendly colors on all elements */
          * {
            color: inherit !important;
            border-color: #334155 !important;
          }
          /* Kill white/light backgrounds everywhere */
          div, td, th, table, tr, tbody, thead,
          p, span, li, ul, ol, h1, h2, h3, h4, h5, h6,
          section, article, header, footer, main, aside, nav {
            background-color: transparent !important;
            background-image: none !important;
          }
          /* Keep images visible */
          img { max-width: 100%; height: auto; }
          /* Links stay blue */
          a, a * { color: #5b8def !important; }
          /* Buttons and styled elements get a subtle dark treatment */
          a[style*="background"], a[style*="padding"],
          td[style*="background-color"] a {
            background-color: #1e293b !important;
            color: #5b8def !important;
            border-radius: 4px;
          }
          table { max-width: 100% !important; width: auto !important; }
          div, td, th { max-width: 100% !important; }
          blockquote {
            border-left: 3px solid #334155 !important;
            margin: 8px 0;
            padding-left: 12px;
            color: #94a3b8 !important;
          }
          pre, code {
            background: #1e293b !important;
            border-radius: 4px;
            padding: 2px 4px;
            font-size: 13px;
          }
          pre { padding: 12px; overflow-x: auto; }
          /* Horizontal rules */
          hr { border-color: #334155 !important; }
        </style>
      </head>
      <body>${message.body}</body>
      </html>
    `);
    doc.close();

    // Open links in default browser instead of inside the iframe
    doc.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      if (anchor && anchor.href && !anchor.href.startsWith('about:')) {
        e.preventDefault();
        window.open(anchor.href, '_blank');
      }
    });

    // Auto-resize iframe to content
    const resize = () => {
      if (iframeRef.current && doc.body) {
        const height = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
        iframeRef.current.style.height = height + 'px';
      }
    };

    // Resize after images load
    const images = doc.querySelectorAll('img');
    let loaded = 0;
    const onAssetReady = () => {
      loaded++;
      if (loaded >= images.length) resize();
    };
    images.forEach((img) => {
      img.addEventListener('load', onAssetReady);
      img.addEventListener('error', onAssetReady);
    });

    // Use ResizeObserver for dynamic content changes
    let resizeObserver: ResizeObserver | null = null;
    if (doc.body && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => resize());
      resizeObserver.observe(doc.body);
    }

    // Multiple resize passes to catch late-rendering content
    resize();
    const t1 = setTimeout(resize, 100);
    const t2 = setTimeout(resize, 500);
    const t3 = setTimeout(resize, 1500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      if (resizeObserver) resizeObserver.disconnect();
    };
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
          scrolling="no"
          style={{ minHeight: '60px', background: 'transparent', overflow: 'hidden' }}
          title={`Email from ${message.from.email}`}
        />
      </div>

      {/* Attachments */}
      {message.attachments.length > 0 && (
        <div className="px-4 py-2 border-t border-border-subtle">
          <div className="flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <button
                key={att.id}
                onClick={() => window.kenaz.downloadAttachment(message.id, att.id, att.filename)}
                className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-primary text-xs text-text-secondary hover:text-text-primary hover:bg-bg-hover cursor-pointer transition-colors"
                title={`Download ${att.filename}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>{att.filename}</span>
                <span className="text-text-muted">({formatBytes(att.size)})</span>
              </button>
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
