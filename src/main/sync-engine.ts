import { BrowserWindow } from 'electron';
import type { GmailService } from './gmail';
import type { CacheStore } from './cache-store';
import type { ConnectivityMonitor } from './connectivity';
import type { ConfigStore } from './config';

/**
 * SyncEngine manages background synchronization between Gmail API and the local cache.
 *
 * - On startup: loads lastHistoryId and performs incremental sync (or full sync on first run)
 * - While online: periodic incremental sync every 60s
 * - Background cache population: gradually fetches full message bodies for recent threads
 */
export class SyncEngine {
  private gmail: GmailService;
  private cache: CacheStore;
  private connectivity: ConnectivityMonitor;
  private config: ConfigStore;
  private mainWindow: BrowserWindow | null = null;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private populateTimer: ReturnType<typeof setTimeout> | null = null;
  private isSyncing = false;
  private started = false;

  constructor(gmail: GmailService, cache: CacheStore, connectivity: ConnectivityMonitor, config: ConfigStore) {
    this.gmail = gmail;
    this.cache = cache;
    this.connectivity = connectivity;
    this.config = config;

    // Listen for connectivity changes
    this.connectivity.on('online', () => {
      console.log('[SyncEngine] Back online — starting sync');
      this.sync();
    });
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    console.log('[SyncEngine] Starting...');

    // Initial sync
    await this.sync();

    // Schedule periodic sync
    this.scheduleSyncPoll();

    // Start background cache population
    this.schedulePopulate();
  }

  stop(): void {
    this.started = false;
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.populateTimer) {
      clearTimeout(this.populateTimer);
      this.populateTimer = null;
    }
  }

  /**
   * Main sync method — performs incremental or full sync.
   */
  async sync(): Promise<void> {
    if (this.isSyncing || !this.connectivity.isOnline) return;
    this.isSyncing = true;

    try {
      const lastHistoryId = this.cache.getLastHistoryId();

      if (lastHistoryId) {
        await this.incrementalSync(lastHistoryId);
      } else {
        await this.fullSync();
      }

      this.cache.setLastSyncedAt(new Date().toISOString());

      // Prune if needed
      const appConfig = this.config.get();
      if (appConfig.cacheEnabled) {
        const maxBytes = (appConfig.cacheMaxSizeMB || 500) * 1024 * 1024;
        this.cache.prune(maxBytes);
      }
    } catch (e: any) {
      console.error('[SyncEngine] Sync failed:', e.message);
      if (this.isNetworkError(e)) {
        this.connectivity.reportOffline();
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Incremental sync using Gmail History API.
   */
  private async incrementalSync(startHistoryId: string): Promise<void> {
    try {
      const { history, historyId } = await this.gmail.getHistory(startHistoryId);

      if (history.length === 0) {
        // No changes — just update history ID
        this.cache.setLastHistoryId(historyId);
        return;
      }

      console.log(`[SyncEngine] Incremental sync: ${history.length} history records`);

      // Collect affected thread IDs
      const affectedThreadIds = new Set<string>();
      const deletedMessageIds = new Set<string>();

      // ── Nudge detection ──────────────────────────────────
      // Gmail nudges work by re-adding the INBOX label to a thread without
      // adding any new messages. We detect this pattern by comparing:
      //   threadIds where INBOX was added  vs  threadIds with new messages
      const inboxAddedThreadIds = new Set<string>();
      const newMessageThreadIds = new Set<string>();
      const inboxRemovedThreadIds = new Set<string>();

      for (const record of history) {
        // Messages added
        if (record.messagesAdded) {
          for (const msg of record.messagesAdded) {
            if (msg.message?.threadId) {
              affectedThreadIds.add(msg.message.threadId);
              newMessageThreadIds.add(msg.message.threadId);
            }
          }
        }

        // Messages deleted
        if (record.messagesDeleted) {
          for (const msg of record.messagesDeleted) {
            if (msg.message?.id) {
              deletedMessageIds.add(msg.message.id);
            }
            if (msg.message?.threadId) {
              affectedThreadIds.add(msg.message.threadId);
            }
          }
        }

        // Labels added — also detect INBOX re-addition (nudge signal)
        if (record.labelsAdded) {
          for (const item of record.labelsAdded) {
            if (item.message?.threadId) {
              affectedThreadIds.add(item.message.threadId);
              // Check if INBOX was among the labels added
              if (item.labelIds?.includes('INBOX')) {
                inboxAddedThreadIds.add(item.message.threadId);
              }
            }
          }
        }

        // Labels removed — detect INBOX removal (clears nudge)
        if (record.labelsRemoved) {
          for (const item of record.labelsRemoved) {
            if (item.message?.threadId) {
              affectedThreadIds.add(item.message.threadId);
              if (item.labelIds?.includes('INBOX')) {
                inboxRemovedThreadIds.add(item.message.threadId);
              }
            }
          }
        }
      }

      // ── Identify nudged threads ──────────────────────────
      // INBOX was added but NO new messages arrived → Gmail nudge
      const nudgeCandidateIds = new Set<string>();
      for (const threadId of inboxAddedThreadIds) {
        if (!newMessageThreadIds.has(threadId)) {
          nudgeCandidateIds.add(threadId);
        }
      }

      if (nudgeCandidateIds.size > 0) {
        console.log(`[SyncEngine] Detected ${nudgeCandidateIds.size} potential Gmail nudge(s): ${Array.from(nudgeCandidateIds).map(id => id.slice(0, 8)).join(', ')}`);
      }

      // Clear nudges for threads that got new messages or had INBOX removed
      const nudgeClearIds = [
        ...Array.from(newMessageThreadIds),
        ...Array.from(inboxRemovedThreadIds),
      ];
      if (nudgeClearIds.length > 0) {
        this.cache.clearNudges(nudgeClearIds);
      }

      // Re-fetch affected threads and update cache
      if (affectedThreadIds.size > 0) {
        const threadIds = Array.from(affectedThreadIds);
        console.log(`[SyncEngine] Refreshing ${threadIds.length} affected threads`);

        // Fetch in batches of 20
        for (let i = 0; i < threadIds.length; i += 20) {
          const batch = threadIds.slice(i, i + 20);
          const threads = await Promise.all(
            batch.map(async (id) => {
              try {
                // Check if we had full bodies cached — if so, fetch full; otherwise metadata
                const hadFull = this.cache.hasFullThread(id);
                if (hadFull) {
                  return this.gmail.fetchThread(id);
                } else {
                  // Just fetch metadata — the list view version
                  const result = await this.gmail.fetchThreads(`rfc822msgid:${id}`, 1);
                  return result.threads[0] || null;
                }
              } catch (e: any) {
                // Thread may have been deleted
                if (e.code === 404 || e.message?.includes('404')) {
                  this.cache.deleteThread(id);
                }
                return null;
              }
            })
          );

          const validThreads = threads.filter(Boolean);
          for (const thread of validThreads) {
            if (thread) {
              this.cache.upsertFullThread(thread);

              // Set nudge type on confirmed nudge candidates
              if (nudgeCandidateIds.has(thread.id)) {
                const lastMsg = thread.messages[thread.messages.length - 1];
                const userEmail = this.gmail.getUserEmail().toLowerCase();
                const isFromMe = lastMsg?.from.email.toLowerCase() === userEmail;
                const nudgeType = isFromMe ? 'follow_up' : 'reply';
                this.cache.setNudge(thread.id, nudgeType);
                console.log(`[SyncEngine] Nudge: "${thread.subject?.slice(0, 40)}" → ${nudgeType}`);
              }
            }
          }
        }

        // Notify renderer
        this.notifyThreadsUpdated();
      }

      this.cache.setLastHistoryId(historyId);
    } catch (e: any) {
      // If history is too old (404/410), fall back to full sync
      if (e.code === 404 || e.code === 410 ||
          e.message?.includes('404') || e.message?.includes('410') ||
          e.message?.includes('notFound')) {
        console.log('[SyncEngine] History expired — falling back to full sync');
        this.cache.clearCache();
        await this.fullSync();
      } else {
        throw e;
      }
    }
  }

  /**
   * Full sync — fetch the most recent threads and populate cache.
   */
  private async fullSync(): Promise<void> {
    console.log('[SyncEngine] Performing full sync...');

    try {
      // Get current history ID
      const profile = await this.gmail.getProfile();
      const historyId = profile.historyId;

      // Fetch recent threads from inbox and other key views
      const queries = ['in:inbox', 'label:PENDING', 'label:TODO', 'is:starred', 'in:sent'];

      for (const query of queries) {
        try {
          const result = await this.gmail.fetchThreads(query, 100);
          if (result.threads.length > 0) {
            this.cache.upsertThreads(result.threads);
            // Cache message metadata from the threads
            for (const thread of result.threads) {
              if (thread.messages.length > 0) {
                this.cache.upsertMessages(thread.messages);
              }
            }
          }
        } catch (e) {
          console.error(`[SyncEngine] Failed to sync query "${query}":`, e);
        }
      }

      this.cache.setLastHistoryId(historyId);
      this.notifyThreadsUpdated();
      console.log('[SyncEngine] Full sync complete');
    } catch (e) {
      console.error('[SyncEngine] Full sync failed:', e);
      throw e;
    }
  }

  /**
   * Background population: gradually fetch full message bodies for threads
   * that only have metadata cached. Most recent first.
   */
  private async populateFullBodies(): Promise<void> {
    if (!this.connectivity.isOnline || this.isSyncing) return;

    const appConfig = this.config.get();
    if (!appConfig.cacheEnabled) return;

    // Check cache size
    const maxBytes = (appConfig.cacheMaxSizeMB || 500) * 1024 * 1024;
    const stats = this.cache.getStats();
    if (stats.sizeBytes >= maxBytes * 0.95) return; // Near limit, stop populating

    try {
      // Find threads without full message bodies (get 10 at a time)
      const threads = this.cache.getThreadsByLabels([], 10);
      let populated = 0;

      for (const thread of threads) {
        if (!this.connectivity.isOnline || this.isSyncing) break;
        if (this.cache.hasFullThread(thread.id)) continue;

        try {
          const fullThread = await this.gmail.fetchThread(thread.id);
          if (fullThread) {
            this.cache.upsertFullThread(fullThread);
            populated++;
          }
        } catch (e: any) {
          if (this.isNetworkError(e)) {
            this.connectivity.reportOffline();
            break;
          }
          // Skip this thread if it's a 404 etc.
        }

        // Small delay to avoid hammering the API
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      if (populated > 0) {
        console.log(`[SyncEngine] Populated ${populated} full thread bodies`);
      }
    } catch (e) {
      console.error('[SyncEngine] Background population failed:', e);
    }
  }

  private scheduleSyncPoll(): void {
    if (!this.started) return;
    this.syncTimer = setTimeout(async () => {
      if (this.connectivity.isOnline) {
        await this.sync();
      }
      this.scheduleSyncPoll();
    }, 60000); // Every 60 seconds
  }

  private schedulePopulate(): void {
    if (!this.started) return;
    this.populateTimer = setTimeout(async () => {
      await this.populateFullBodies();
      this.schedulePopulate();
    }, 120000); // Every 2 minutes
  }

  private notifyThreadsUpdated(): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('threads:updated', { source: 'sync' });
      }
    } catch {}
  }

  private isNetworkError(e: any): boolean {
    const msg = (e.message || '').toLowerCase();
    return msg.includes('enotfound') || msg.includes('enetunreach') ||
           msg.includes('econnrefused') || msg.includes('etimedout') ||
           msg.includes('err_network') || msg.includes('fetch failed');
  }
}
