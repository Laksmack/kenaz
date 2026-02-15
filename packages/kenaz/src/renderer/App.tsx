import React, { useState, useEffect, useCallback, useRef } from 'react';
import { EmailList } from './components/EmailList';
import { EmailView } from './components/EmailView';
import { Sidebar } from './components/Sidebar';
import { ComposeBar } from './components/ComposeBar';
import { ViewNav } from './components/ViewNav';
import { SearchBar } from './components/SearchBar';
import { AuthScreen } from './components/AuthScreen';
import { SettingsModal } from './components/SettingsModal';
import { AdvancedSearch } from './components/AdvancedSearch';
import { UndoToast } from './components/UndoToast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useEmails } from './hooks/useEmails';
import { useConnectivity } from './hooks/useConnectivity';
import { ErrorBoundary } from './components/ErrorBoundary';
import type { ViewType, ComposeData, SendEmailPayload, EmailThread, AppConfig, View, Rule } from '@shared/types';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [currentView, setCurrentView] = useState<ViewType>('inbox');
  const [selectedThread, setSelectedThread] = useState<EmailThread | null>(null);
  const [threadUpdateAvailable, setThreadUpdateAvailable] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeData, setComposeData] = useState<Partial<ComposeData> | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined);
  const [prefillRule, setPrefillRule] = useState<Partial<Rule> | undefined>(undefined);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [userEmail, setUserEmail] = useState('');
  const [views, setViews] = useState<View[]>([]);
  const [undoActions, setUndoActions] = useState<import('./components/UndoToast').UndoAction[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [snoozeMode, setSnoozeMode] = useState(false);
  const pendingSendsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Connectivity / offline state
  const { isOnline, pendingActions, outboxCount } = useConnectivity();

  // Check auth on mount, load config, user email, and views
  useEffect(() => {
    window.kenaz.gmailAuthStatus()
      .then((status: boolean) => {
        setAuthenticated(status);
        if (status) {
          window.kenaz.getUserEmail().then(setUserEmail);
        }
      })
      .catch(() => setAuthenticated(false));
    window.kenaz.getConfig().then(setAppConfig);
    window.kenaz.listViews().then(setViews);
  }, []);

  // ── Theme: apply data-theme attribute based on config ──
  useEffect(() => {
    const themePref = appConfig?.theme || 'dark';

    const apply = (resolved: 'dark' | 'light') => {
      document.documentElement.dataset.theme = resolved;
    };

    if (themePref === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches ? 'dark' : 'light');
      const handler = (e: MediaQueryListEvent) => apply(e.matches ? 'dark' : 'light');
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    } else {
      apply(themePref);
    }
  }, [appConfig?.theme]);

  const {
    threads,
    loading,
    loadingMore,
    hasMore,
    refresh,
    loadMore,
    archiveThread,
    labelThread,
    markRead,
  } = useEmails(currentView, searchQuery, authenticated === true, views);

  // ── View counts (background fetch) ──────────────────────
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const prevUnreadIds = useRef<Set<string>>(new Set());

  const prevCountsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (authenticated !== true || views.length === 0) return;

    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        views
          .filter((v) => v.id !== 'all' && v.id !== 'sent')
          .map(async (v) => {
            try {
              const result = await window.kenaz.fetchThreads(v.query || 'in:inbox', 50);
              counts[v.id] = result.threads.length;
            } catch {
              counts[v.id] = 0;
            }
          })
      );
      setViewCounts(counts);

      // Dock badge: unread inbox count
      const inboxCount = counts['inbox'] || 0;
      window.kenaz.setBadge(inboxCount);

      // Auto-refresh current view if its count changed (new mail arrived or was removed)
      const prevCount = prevCountsRef.current[currentView];
      const newCount = counts[currentView];
      if (prevCount !== undefined && newCount !== undefined && prevCount !== newCount) {
        refresh();
      }
      prevCountsRef.current = counts;
    };

    fetchCounts();
    // Poll every 30 seconds when online, 120s when offline (rely on cache)
    const interval = setInterval(fetchCounts, isOnline ? 30000 : 120000);
    return () => clearInterval(interval);
  }, [authenticated, views, currentView, refresh, isOnline]);

  // ── Notifications for new unread mail ──────────────────
  useEffect(() => {
    if (currentView !== 'inbox') return;
    const unreadThreads = threads.filter((t) => t.isUnread);
    const currentIds = new Set(unreadThreads.map((t) => t.id));

    // Find genuinely new unread threads
    const newThreads = unreadThreads.filter((t) => !prevUnreadIds.current.has(t.id));

    // Only notify if we had a previous baseline (skip first load)
    if (prevUnreadIds.current.size > 0 && newThreads.length > 0) {
      const myEmail = userEmail.toLowerCase();
      for (const t of newThreads.slice(0, 3)) { // cap at 3 notifications
        // Skip notifications for threads where the latest message is from ourselves
        const lastMsg = t.messages[t.messages.length - 1];
        if (lastMsg && lastMsg.from.email.toLowerCase() === myEmail) continue;

        window.kenaz.notify(
          t.from.name || t.from.email,
          t.subject || t.snippet || 'New email'
        );
      }
    }

    prevUnreadIds.current = currentIds;
  }, [threads, currentView, userEmail]);

  // Refresh when rules finish processing in the background
  useEffect(() => {
    const cleanup = window.kenaz.onRulesApplied(() => {
      console.log(`[RULES-APPLIED] triggering refresh, pendingId=${pendingSelectIdRef.current?.slice(0,8) ?? 'null'}, selected="${selectedThread?.subject?.slice(0,30) ?? 'null'}"`);
      refresh();
    });
    return cleanup;
  }, [refresh]);

  // Also update counts when threads change (user actions)
  useEffect(() => {
    if (currentView && currentView !== 'search' && currentView !== 'all') {
      setViewCounts((prev) => ({ ...prev, [currentView]: threads.length }));
    }
    // Update dock badge for inbox
    if (currentView === 'inbox') {
      window.kenaz.setBadge(threads.length);
    }
  }, [threads, currentView]);

  // After archive/label, we stash the desired-next thread ID here.
  // The threads useEffect consumes it once to pick the right selection.
  const pendingSelectIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (threads.length === 0) return;

    // 1. If an archive/label action told us what to select next, honour it
    const pendingId = pendingSelectIdRef.current;
    if (pendingId) {
      pendingSelectIdRef.current = null; // consume once
      const pending = threads.find((t) => t.id === pendingId);
      if (pending) {
        console.log(`[SELECT] pendingId=${pendingId} → found "${pending.subject?.slice(0,30)}"`);
        setSelectedThread(pending);
        return;
      }
      console.log(`[SELECT] pendingId=${pendingId} → NOT FOUND in ${threads.length} threads, falling through`);
      // Thread was removed (e.g. by rules) — fall through to sync logic
    }

    // 2. Keep selected thread metadata in sync after list refreshes,
    //    but preserve full message bodies if we already fetched them.
    if (selectedThread) {
      const match = threads.find((t) => t.id === selectedThread.id);
      if (match && match !== selectedThread) {
        // Check if selectedThread already has full bodies loaded
        const lastMsg = selectedThread.messages[selectedThread.messages.length - 1];
        const hasBodies = lastMsg && lastMsg.body;
        if (hasBodies) {
          // Detect new messages in thread (e.g. someone replied)
          if (match.messages.length !== selectedThread.messages.length ||
              match.snippet !== selectedThread.snippet) {
            console.log(`[SELECT] thread "${match.subject?.slice(0,30)}" has update (${selectedThread.messages.length} → ${match.messages.length} msgs)`);
            setThreadUpdateAvailable(true);
          }
          // Merge updated metadata (labels, isUnread) but keep full messages
          const updated = {
            ...selectedThread,
            labels: match.labels,
            isUnread: match.isUnread,
          };
          // Only update if something actually changed
          if (selectedThread.labels.join(',') !== match.labels.join(',') ||
              selectedThread.isUnread !== match.isUnread) {
            console.log(`[SELECT] merging metadata for "${match.subject?.slice(0,30)}" (preserving bodies)`);
            setSelectedThread(updated);
          }
        } else {
          // No bodies yet — safe to replace with list version (will trigger full fetch)
          console.log(`[SELECT] syncing ref for "${match.subject?.slice(0,30)}" (same id=${match.id.slice(0,8)})`);
          setSelectedThread(match);
        }
      } else if (!match) {
        console.log(`[SELECT] selectedThread "${selectedThread.subject?.slice(0,30)}" (${selectedThread.id.slice(0,8)}) NOT in threads — keeping stale ref`);
      }
      // If !match the thread was removed — don't auto-jump to threads[0],
      // the archive handler already set pendingSelectIdRef for the next render.
      return;
    }

    // 3. Nothing selected at all — pick first thread (initial load / view change)
    console.log(`[SELECT] no selection, picking threads[0] "${threads[0].subject?.slice(0,30)}"`);
    setSelectedThread(threads[0]);
  }, [threads]);

  // Open a draft in the composer (used by Enter/R in drafts view, or double-click)
  const openDraftInComposer = useCallback(async (thread: EmailThread) => {
    try {
      const drafts = await window.kenaz.listDrafts();
      const draft = drafts.find((d: any) => d.threadId === thread.id);
      if (draft) {
        const draftDetail = await window.kenaz.getDraft(draft.id);
        setComposeData({
          to: draftDetail.to,
          cc: draftDetail.cc,
          bcc: draftDetail.bcc,
          subject: draftDetail.subject,
          bodyMarkdown: draftDetail.body,
          bodyHtml: draftDetail.body, // Draft body is HTML — feed to rich editor too
          replyToThreadId: draftDetail.threadId || undefined,
          draftId: draftDetail.id,
        });
        setComposeOpen(true);
      }
    } catch (e) {
      console.error('Failed to load draft:', e);
    }
  }, []);

  const handleSelectThread = useCallback(async (thread: EmailThread) => {
    // If re-clicking the already-selected thread, don't overwrite with metadata-only version
    setSelectedThread((current) => {
      if (current?.id === thread.id) {
        // Already selected — keep existing (possibly full) content
        return current;
      }
      return thread;
    });
    if (thread.isUnread) {
      markRead(thread.id);
    }
  }, [markRead, currentView]);

  // Clear thread-update banner when switching to a different thread
  useEffect(() => {
    setThreadUpdateAvailable(false);
  }, [selectedThread?.id]);

  // Refresh the currently selected thread (re-fetch full content)
  const refreshSelectedThread = useCallback(async () => {
    if (!selectedThread) return;
    try {
      const full = await window.kenaz.fetchThread(selectedThread.id);
      if (full) {
        setSelectedThread((current) =>
          current?.id === full.id ? full : current
        );
      }
      setThreadUpdateAvailable(false);
    } catch (e) {
      console.error('Failed to refresh thread:', e);
    }
  }, [selectedThread?.id]);

  // Auto-fetch full thread content whenever selectedThread changes and has no body
  // This covers: clicks, archive-next, keyboard nav, pending select, initial load
  useEffect(() => {
    if (!selectedThread) return;
    // Check if the thread is metadata-only (body is empty on last message)
    const lastMsg = selectedThread.messages[selectedThread.messages.length - 1];
    if (lastMsg && lastMsg.body) return; // Already has full content

    let cancelled = false;
    (async () => {
      try {
        const full = await window.kenaz.fetchThread(selectedThread.id);
        if (!cancelled && full) {
          setSelectedThread((current) =>
            current?.id === full.id ? full : current
          );
        }
      } catch (e) {
        console.error('Failed to fetch full thread:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedThread?.id]);

  // Collect all label names that back a view (e.g. PENDING, TODO, custom)
  const getManagedLabels = useCallback(() => {
    return views
      .map((v) => v.query.match(/^label:(\S+)$/))
      .filter(Boolean)
      .map((m) => m![1]);
  }, [views]);

  // Helper: find the next thread to select after removing targets from the list.
  // Prefers the thread just ABOVE (idx - 1), falls back to just BELOW (idx + 1).
  const findNextThread = useCallback((idx: number, excludeIds: Set<string> | string[]) => {
    const excluded = excludeIds instanceof Set ? excludeIds : new Set(excludeIds);
    // Try the closest thread above (backwards from idx)
    for (let i = idx - 1; i >= 0; i--) {
      if (!excluded.has(threads[i].id)) return threads[i];
    }
    // Fall back to the thread just below
    const after = threads.find((t, i) => i > idx && !excluded.has(t.id));
    if (after) return after;
    return null;
  }, [threads]);

  const handleDeleteDraft = useCallback(async (thread: EmailThread) => {
    try {
      const drafts = await window.kenaz.listDrafts();
      const draft = drafts.find((d: any) => d.threadId === thread.id);
      if (draft) {
        await window.kenaz.deleteDraft(draft.id);
      }
      // Move selection to next thread
      const idx = threads.findIndex((t) => t.id === thread.id);
      const next = findNextThread(idx, [thread.id]);
      if (next) {
        pendingSelectIdRef.current = next.id;
        setSelectedThread(next);
      } else {
        setSelectedThread(null);
      }
      refresh();
    } catch (e) {
      console.error('Failed to delete draft:', e);
    }
  }, [threads, findNextThread, refresh]);

  // ── Undo infrastructure ──────────────────────────────────
  const addUndo = useCallback((message: string, onUndo: () => void, duration = 5000) => {
    const id = Date.now().toString();
    setUndoActions((prev) => [...prev, { id, message, onUndo, duration }]);
  }, []);

  const removeUndo = useCallback((id: string) => {
    setUndoActions((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Helper: get target thread IDs (multi-select takes precedence)
  const getTargetThreads = useCallback((): EmailThread[] => {
    if (selectedIds.size > 0) {
      return threads.filter((t) => selectedIds.has(t.id));
    }
    return selectedThread ? [selectedThread] : [];
  }, [selectedIds, selectedThread, threads]);

  const handleArchive = useCallback(async () => {
    const targets = getTargetThreads();
    if (targets.length === 0) return;

    // In drafts view, delete the draft instead of archiving
    if (currentView === 'drafts') {
      try {
        const drafts = await window.kenaz.listDrafts();
        for (const t of targets) {
          const draft = drafts.find((d: any) => d.threadId === t.id);
          if (draft) await window.kenaz.deleteDraft(draft.id);
        }
      } catch (e) {
        console.error('Failed to delete draft:', e);
      }
      setSelectedThread(null);
      setSelectedIds(new Set());
      setTimeout(() => refresh(), 500);
      return;
    }

    // Snapshot for undo
    const targetIds = targets.map((t) => t.id);
    const viewAtArchive = currentView;
    const managedLabels = getManagedLabels();

    // Compute next selection BEFORE removing threads
    if (selectedThread && targetIds.includes(selectedThread.id)) {
      const idx = threads.findIndex((t) => t.id === selectedThread.id);
      const nextThread = findNextThread(idx, targetIds);
      console.log(`[ARCHIVE] current="${selectedThread.subject?.slice(0,30)}" idx=${idx} total=${threads.length}`);
      console.log(`[ARCHIVE] next="${nextThread?.subject?.slice(0,30) ?? 'NULL'}" nextId=${nextThread?.id?.slice(0,8) ?? 'null'}`);
      pendingSelectIdRef.current = nextThread?.id ?? null;
      setSelectedThread(nextThread);
    }
    setSelectedIds(new Set());

    // Remove managed labels + archive for all targets
    for (const t of targets) {
      for (const label of managedLabels) {
        labelThread(t.id, null, label);
      }
      archiveThread(t.id);
    }

    // Offer undo
    const undoMsg = targets.length === 1
      ? `"${targets[0].subject.slice(0, 40)}${targets[0].subject.length > 40 ? '…' : ''}" archived`
      : `${targets.length} conversations archived`;
    addUndo(undoMsg, () => {
      for (const id of targetIds) {
        labelThread(id, 'INBOX', null);
        const viewDef = views.find((v) => v.id === viewAtArchive);
        const labelMatch = viewDef?.query.match(/^label:(\S+)$/);
        if (labelMatch) {
          labelThread(id, labelMatch[1], null);
        }
      }
      setTimeout(() => refresh(), 500);
    });
  }, [getTargetThreads, threads, archiveThread, labelThread, currentView, views, refresh, getManagedLabels, addUndo, selectedThread]);

  const handleLabel = useCallback(async (label: string) => {
    const targets = getTargetThreads();
    if (targets.length === 0) return;

    // For single thread, toggle; for multi, always add
    if (targets.length === 1 && targets[0].labels.some((l) => l === label)) {
      labelThread(targets[0].id, null, label);
    } else {
      // Move selection past the targets
      if (selectedThread && targets.some((t) => t.id === selectedThread.id)) {
        const idx = threads.findIndex((t) => t.id === selectedThread.id);
        const targetIds = new Set(targets.map((t) => t.id));
        const next = findNextThread(idx, targetIds);
        pendingSelectIdRef.current = next?.id ?? null;
        setSelectedThread(next);
      }
      for (const t of targets) {
        for (const managed of getManagedLabels()) {
          if (managed !== label) {
            labelThread(t.id, null, managed);
          }
        }
        labelThread(t.id, label, null);
        archiveThread(t.id);
      }
    }
    setSelectedIds(new Set());
    setTimeout(() => refresh(), 2000);
  }, [getTargetThreads, selectedThread, threads, labelThread, archiveThread, getManagedLabels, refresh]);

  const handleStar = useCallback(async () => {
    const targets = getTargetThreads();
    if (targets.length === 0) return;
    for (const t of targets) {
      const isStarred = t.labels.includes('STARRED');
      if (isStarred) {
        await labelThread(t.id, null, 'STARRED');
      } else {
        await labelThread(t.id, 'STARRED', null);
      }
    }
    setSelectedIds(new Set());
    refresh();
  }, [selectedThread, labelThread, refresh]);

  const handleSnooze = useCallback(async (days: number) => {
    if (!selectedThread) return;

    const threadId = selectedThread.id;
    const subject = selectedThread.subject;

    // Move to next thread
    const idx = threads.findIndex((t) => t.id === threadId);
    const next = findNextThread(idx, [threadId]);
    pendingSelectIdRef.current = next?.id ?? null;
    setSelectedThread(next);

    try {
      const result = await window.kenaz.snoozeThread(threadId, days);
      const wakeDate = new Date(result.snoozeUntil);
      const label = days === 1 ? 'tomorrow' : `${days} days`;

      addUndo(
        `"${subject.slice(0, 35)}${subject.length > 35 ? '…' : ''}" snoozed until ${label}`,
        async () => {
          await window.kenaz.cancelSnooze(threadId);
          setTimeout(() => refresh(), 500);
        }
      );
    } catch (e) {
      console.error('Failed to snooze:', e);
    }

    setTimeout(() => refresh(), 500);
  }, [selectedThread, threads, findNextThread, addUndo, refresh]);

  const handleCompose = useCallback((data?: Partial<ComposeData>) => {
    setComposeData(data || {});
    setComposeOpen(true);
  }, []);

  // Deferred send with undo window
  const handleSent = useCallback((payload: SendEmailPayload, draftId?: string) => {
    setComposeOpen(false);

    const sendId = Date.now().toString();
    let cancelled = false;

    // Capture the reply thread ID and current config for archive-on-reply
    const replyThreadId = payload.reply_to_thread_id;
    const shouldArchive = appConfig?.archiveOnReply && replyThreadId;

    // Schedule actual send after 5 seconds
    const timer = setTimeout(async () => {
      pendingSendsRef.current.delete(sendId);
      if (cancelled) return;
      try {
        const result = await window.kenaz.sendEmail(payload);
        if (draftId) {
          try { await window.kenaz.deleteDraft(draftId); } catch {}
        }

        // Handle queued (offline) response
        if (result?.queued) {
          addUndo(`Email queued — will send when online`, () => {
            window.kenaz.cancelOutbox(result.outboxId);
          });
          return;
        }

        // Auto-archive the thread if this was a reply and the setting is on
        if (shouldArchive) {
          const managedLabels = getManagedLabels();
          const removedLabels = [...managedLabels];
          for (const label of managedLabels) {
            labelThread(replyThreadId, null, label);
          }
          await archiveThread(replyThreadId);
          // Give user a chance to undo just the archive (send already happened)
          addUndo('Reply sent — thread archived', () => {
            labelThread(replyThreadId, 'INBOX', null);
            for (const label of removedLabels) {
              labelThread(replyThreadId, label, null);
            }
            refresh();
          });
        }
        refresh();
      } catch (e: any) {
        console.error('Failed to send email:', e);
      }
    }, 5000);

    pendingSendsRef.current.set(sendId, timer);

    const undoMsg = isOnline
      ? `Sending to ${payload.to.split(',')[0].trim()}…`
      : `Queuing email to ${payload.to.split(',')[0].trim()}…`;

    addUndo(undoMsg, () => {
      cancelled = true;
      clearTimeout(timer);
      pendingSendsRef.current.delete(sendId);
      // Re-open compose with the same data
      setComposeData({
        to: payload.to,
        cc: payload.cc,
        bcc: payload.bcc,
        subject: payload.subject,
        bodyMarkdown: payload.body_markdown,
        bodyHtml: payload.body_html,
        replyToThreadId: payload.reply_to_thread_id,
        replyToMessageId: payload.reply_to_message_id,
        draftId,
        attachments: payload.attachments,
      });
      setComposeOpen(true);
    });
  }, [addUndo, refresh, appConfig?.archiveOnReply, getManagedLabels, archiveThread, labelThread, isOnline]);

  const handleReply = useCallback(() => {
    if (!selectedThread) return;
    const lastMsg = selectedThread.messages[selectedThread.messages.length - 1];
    const dateStr = new Date(lastMsg.date).toLocaleString();
    const senderStr = lastMsg.from.name
      ? `${lastMsg.from.name} <${lastMsg.from.email}>`
      : lastMsg.from.email;
    // Quote the original plain text, prefixing each line with >
    const quotedBody = (lastMsg.bodyText || '')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');

    // Reply All: collect all recipients, excluding self
    const me = userEmail.toLowerCase();
    const allTo = new Set<string>();
    const allCc = new Set<string>();

    // The original sender goes in To (unless it's us)
    if (lastMsg.from.email.toLowerCase() !== me) {
      allTo.add(lastMsg.from.email);
    }
    // Other To recipients (excluding self) go in To
    for (const t of lastMsg.to) {
      if (t.email.toLowerCase() !== me) allTo.add(t.email);
    }
    // CC recipients (excluding self) stay in CC
    for (const c of lastMsg.cc) {
      if (c.email.toLowerCase() !== me) allCc.add(c.email);
    }

    // Build HTML quoted content for rich editor
    // Build HTML quoted content for rich editor
    const quotedHtml = `<br/><br/><div style="color:#666;border-left:2px solid #ccc;padding-left:8px;margin-left:4px;">On ${dateStr}, ${senderStr} wrote:<br/>${lastMsg.body || lastMsg.bodyText?.replace(/\n/g, '<br/>') || ''}</div>`;

    handleCompose({
      to: Array.from(allTo).join(', '),
      cc: Array.from(allCc).join(', '),
      subject: selectedThread.subject.startsWith('Re:')
        ? selectedThread.subject
        : `Re: ${selectedThread.subject}`,
      replyToThreadId: selectedThread.id,
      replyToMessageId: lastMsg.id,
      bodyMarkdown: `\n\nOn ${dateStr}, ${senderStr} wrote:\n${quotedBody}`,
      bodyHtml: quotedHtml,
    });
  }, [selectedThread, handleCompose, userEmail]);

  const handleForward = useCallback(async () => {
    if (!selectedThread) return;
    const lastMsg = selectedThread.messages[selectedThread.messages.length - 1];

    // Fetch attachments from the original message
    let forwardedAttachments: import('../shared/types').EmailAttachment[] = [];
    if (lastMsg.attachments && lastMsg.attachments.length > 0) {
      try {
        const fetched = await Promise.all(
          lastMsg.attachments.map(async (att) => {
            const base64 = await window.kenaz.getAttachmentBase64(lastMsg.id, att.id);
            return {
              filename: att.filename,
              mimeType: att.mimeType,
              base64,
              size: att.size,
            };
          })
        );
        forwardedAttachments = fetched;
      } catch (e) {
        console.error('Failed to fetch attachments for forward:', e);
      }
    }

    const fwdHeader = `---------- Forwarded message ----------<br/>From: ${lastMsg.from.name || lastMsg.from.email} &lt;${lastMsg.from.email}&gt;<br/>Date: ${new Date(lastMsg.date).toLocaleString()}<br/>Subject: ${selectedThread.subject}<br/>To: ${lastMsg.to.map(t => t.email).join(', ')}`;
    const fwdBodyHtml = `<br/><br/><div style="color:#666;">${fwdHeader}<br/><br/>${lastMsg.body || lastMsg.bodyText?.replace(/\n/g, '<br/>') || ''}</div>`;

    handleCompose({
      to: '',
      subject: selectedThread.subject.startsWith('Fwd:')
        ? selectedThread.subject
        : `Fwd: ${selectedThread.subject}`,
      bodyMarkdown: `\n\n---------- Forwarded message ----------\nFrom: ${lastMsg.from.name || lastMsg.from.email} <${lastMsg.from.email}>\nDate: ${new Date(lastMsg.date).toLocaleString()}\nSubject: ${selectedThread.subject}\nTo: ${lastMsg.to.map(t => t.email).join(', ')}\n\n${lastMsg.bodyText || ''}`,
      bodyHtml: fwdBodyHtml,
      attachments: forwardedAttachments.length > 0 ? forwardedAttachments : undefined,
    });
  }, [selectedThread, handleCompose]);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (query) {
      setCurrentView('search');
    }
  }, []);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    setCurrentView('inbox');
    setSelectedThread(null);
  }, []);

  const handleViewChange = useCallback((view: ViewType) => {
    setCurrentView(view);
    setSelectedThread(null);
    setSelectedIds(new Set());
    setSearchQuery('');
  }, []);

  // ── Context menu handlers ───────────────────────────────

  const handleContextArchive = useCallback(async (threadId: string) => {
    // Remove all managed labels, same as keyboard Done
    for (const label of getManagedLabels()) {
      labelThread(threadId, null, label);
    }
    // Compute next BEFORE archiving
    if (selectedThread?.id === threadId) {
      const idx = threads.findIndex((t) => t.id === threadId);
      const next = findNextThread(idx, [threadId]);
      pendingSelectIdRef.current = next?.id ?? null;
      setSelectedThread(next);
    }
    await archiveThread(threadId);
  }, [archiveThread, labelThread, getManagedLabels, selectedThread, threads, findNextThread]);

  const handleContextLabel = useCallback(async (threadId: string, label: string) => {
    // Remove all OTHER managed labels first (e.g. moving from Pending to Todo
    // should remove PENDING before adding TODO)
    for (const managed of getManagedLabels()) {
      if (managed !== label) {
        labelThread(threadId, null, managed);
      }
    }
    // Add the target label
    await labelThread(threadId, label, null);
    // Compute next BEFORE archiving
    if (selectedThread?.id === threadId) {
      const idx = threads.findIndex((t) => t.id === threadId);
      const next = findNextThread(idx, [threadId]);
      pendingSelectIdRef.current = next?.id ?? null;
      setSelectedThread(next);
    }
    // Archive (remove from inbox) since we're moving to a specific view
    await archiveThread(threadId);
    refresh();
  }, [labelThread, archiveThread, getManagedLabels, selectedThread, threads, refresh, findNextThread]);

  const handleContextStar = useCallback(async (threadId: string) => {
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return;
    const isStarred = thread.labels.includes('STARRED');
    if (isStarred) {
      await labelThread(threadId, null, 'STARRED');
    } else {
      await labelThread(threadId, 'STARRED', null);
    }
    refresh();
  }, [threads, labelThread, refresh]);

  const handleCreateRule = useCallback((senderEmail: string, senderName: string) => {
    setPrefillRule({
      id: `rule_${Date.now()}`,
      name: `Filter: ${senderName}`,
      enabled: true,
      conditions: [{ field: 'sender', operator: 'contains', value: senderEmail }],
      actions: [{ type: 'archive' }],
    });
    setSettingsTab('rules');
    setSettingsOpen(true);
  }, []);

  // Navigate thread list
  const navigateList = useCallback((direction: 'up' | 'down') => {
    if (!selectedThread || threads.length === 0) return;
    const idx = threads.findIndex((t) => t.id === selectedThread.id);
    const nextIdx = direction === 'down' ? Math.min(idx + 1, threads.length - 1) : Math.max(idx - 1, 0);
    handleSelectThread(threads[nextIdx]);
  }, [selectedThread, threads, handleSelectThread]);

  useKeyboardShortcuts({
    onArchive: handleArchive,
    onPending: () => handleLabel('PENDING'),
    onTodo: () => handleLabel('TODO'),
    onStar: handleStar,
    onCompose: () => handleCompose(),
    onReply: () => {
      if (currentView === 'drafts' && selectedThread) {
        openDraftInComposer(selectedThread);
      } else {
        handleReply();
      }
    },
    onForward: handleForward,
    onNavigateUp: () => navigateList('up'),
    onNavigateDown: () => navigateList('down'),
    onSearch: () => setAdvancedSearchOpen(true),
    onEscape: () => {
      if (settingsOpen) setSettingsOpen(false);
      else if (advancedSearchOpen) setAdvancedSearchOpen(false);
      // ComposeBar handles its own Escape (saves draft if changes)
      else if (composeOpen) { /* handled by ComposeBar */ }
      else setSelectedThread(null);
    },
    onSnooze: handleSnooze,
    onSnoozeMode: setSnoozeMode,
    onRefresh: refresh,
    onSettings: () => setSettingsOpen(!settingsOpen),
    enabled: !composeOpen && !advancedSearchOpen || settingsOpen,
  });

  // Auth screen
  if (authenticated === false) {
    return <AuthScreen onAuthenticated={() => setAuthenticated(true)} />;
  }

  if (authenticated === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-primary">
        <div className="text-text-secondary text-lg">Loading...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
    <div className="h-screen flex flex-col bg-bg-primary">
      {/* Title bar drag region */}
      <div className="titlebar-drag h-12 flex items-center pl-20 pr-3 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
        <div className="titlebar-no-drag">
          <ViewNav currentView={currentView} onViewChange={handleViewChange} views={views} counts={viewCounts} />
        </div>
        <div className="flex-1" /> {/* This space IS draggable */}
        <div className="titlebar-no-drag flex items-center gap-2">
          {!isOnline && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent-danger/15 text-accent-danger text-[10px] font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-accent-danger animate-pulse" />
              Offline
              {(pendingActions > 0 || outboxCount > 0) && (
                <span className="text-accent-danger/70">
                  ({pendingActions + outboxCount} pending)
                </span>
              )}
            </div>
          )}
          <button
            onClick={() => handleCompose()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors text-white hover:opacity-90 shadow-sm ${
              isOnline
                ? 'bg-gradient-to-r from-[#C43E0C] to-[#F7A94B]'
                : 'bg-gradient-to-r from-[#DC2626] to-[#C43E0C]'
            }`}
            title={isOnline ? 'Compose (C)' : 'Compose (C) — will queue offline'}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 512 512" fill="none">
              <path d="M332.8 112.6L189.4 256L332.8 399.4" stroke="currentColor" strokeWidth="52" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
            Compose
          </button>
          <SearchBar
            query={searchQuery}
            onSearch={handleSearch}
            onAdvancedSearch={() => setAdvancedSearchOpen(true)}
            onClear={handleClearSearch}
          />
          <button
            onClick={refresh}
            className={`p-1.5 rounded hover:bg-bg-hover transition-colors ${
              isOnline ? 'text-text-secondary hover:text-text-primary' : 'text-text-muted cursor-default'
            }`}
            title={isOnline ? 'Refresh (Cmd+Shift+R)' : 'Offline — using cached data'}
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded hover:bg-bg-hover text-text-secondary hover:text-text-primary transition-colors"
            title="Settings (⌥,)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        {/* Kenaz rune — far right */}
        <div className="ml-3 flex items-center" title="Kenaz ᚲ">
          <svg className="w-5 h-5" viewBox="0 0 512 512" fill="none">
            <defs>
              <linearGradient id="kenaz-rune" x1="51.2" y1="460.8" x2="460.8" y2="51.2" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#C43E0C"/>
                <stop offset="1" stopColor="#F7A94B"/>
              </linearGradient>
            </defs>
            <rect x="25.6" y="25.6" width="460.8" height="460.8" rx="102.4" fill="url(#kenaz-rune)"/>
            <path d="M332.8 112.6L189.4 256L332.8 399.4" stroke="#FFF8F0" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          </svg>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Email List */}
        <div className="w-1/4 min-w-[280px] max-w-[400px] border-r border-border-subtle flex flex-col overflow-hidden">
          <EmailList
            threads={threads}
            selectedId={selectedThread?.id || null}
            selectedIds={selectedIds}
            loading={loading}
            loadingMore={loadingMore}
            hasMore={hasMore}
            onSelect={handleSelectThread}
            onMultiSelect={setSelectedIds}
            onLoadMore={loadMore}
            currentView={currentView}
            userEmail={userEmail}
            userDisplayName={appConfig?.displayName}
            views={views}
            onArchive={handleContextArchive}
            onLabel={handleContextLabel}
            onStar={handleContextStar}
            onCreateRule={handleCreateRule}
            onDoubleClick={currentView === 'drafts' ? openDraftInComposer : undefined}
          />
        </div>

        {/* Email Body / Compose */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {composeOpen ? (
            <ComposeBar
              initialData={composeData}
              onClose={() => setComposeOpen(false)}
              onSent={handleSent}
              autoBccEnabled={appConfig?.autoBccEnabled}
              composeMode={appConfig?.composeMode || 'html'}
            />
          ) : (
            <EmailView
              key={selectedThread?.id || 'none'}
              thread={selectedThread}
              onReply={currentView === 'drafts' && selectedThread ? () => openDraftInComposer(selectedThread) : handleReply}
              onArchive={handleArchive}
              onLabel={handleLabel}
              onStar={handleStar}
              onDeleteDraft={currentView === 'drafts' ? handleDeleteDraft : undefined}
              threadUpdateAvailable={threadUpdateAvailable}
              onRefreshThread={refreshSelectedThread}
              userEmail={userEmail}
              currentView={currentView}
            />
          )}
        </div>

        {/* HubSpot Sidebar */}
        <div className="w-1/4 min-w-[260px] max-w-[360px] border-l border-border-subtle overflow-hidden">
          <Sidebar
            thread={selectedThread}
            hubspotEnabled={appConfig?.hubspotEnabled}
            hubspotPortalId={appConfig?.hubspotPortalId}
          />
        </div>
      </div>

      {/* Snooze Mode Overlay */}
      {snoozeMode && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-bg-secondary border border-border-subtle rounded-xl px-6 py-4 shadow-2xl flex flex-col items-center gap-2">
            <div className="text-sm font-semibold text-text-primary">Snooze</div>
            <div className="text-xs text-text-secondary">Press <kbd className="px-1.5 py-0.5 bg-bg-hover rounded text-text-primary font-mono">1</kbd>–<kbd className="px-1.5 py-0.5 bg-bg-hover rounded text-text-primary font-mono">9</kbd> for days</div>
            <div className="flex gap-1 mt-1">
              {[1,2,3,4,5,6,7].map(n => (
                <button
                  key={n}
                  onClick={() => { setSnoozeMode(false); handleSnooze(n); }}
                  className="w-7 h-7 rounded-md bg-bg-hover hover:bg-accent-primary/20 text-text-primary text-xs font-semibold transition-colors"
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-text-muted mt-1">Esc to cancel • 5s timeout</div>
            <div className="w-full h-0.5 bg-bg-hover rounded-full overflow-hidden mt-1">
              <div className="h-full bg-accent-primary rounded-full animate-snooze-countdown" />
            </div>
          </div>
        </div>
      )}

      {/* Undo Toast */}
      <UndoToast actions={undoActions} onExpire={removeUndo} />

      {/* Advanced Search Modal */}
      {advancedSearchOpen && (
        <AdvancedSearch
          onSearch={(query) => { handleSearch(query); setAdvancedSearchOpen(false); }}
          onClose={() => setAdvancedSearchOpen(false)}
        />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <SettingsModal
          onClose={() => { setSettingsOpen(false); setSettingsTab(undefined); setPrefillRule(undefined); }}
          onViewsChanged={(v) => setViews(v)}
          initialTab={settingsTab as any}
          prefillRule={prefillRule}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}
