import { BrowserWindow } from 'electron';
import { GoogleCalendarService } from './google-calendar';
import { CacheStore } from './cache-store';
import { ConnectivityMonitor } from './connectivity';
import type { SyncStatus, CalendarEvent, Attendee } from '../shared/types';

export class SyncEngine {
  private google: GoogleCalendarService;
  private cache: CacheStore;
  private connectivity: ConnectivityMonitor;
  private mainWindow: BrowserWindow | null = null;

  private _status: SyncStatus = 'synced';
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private fullSyncInterval: ReturnType<typeof setInterval> | null = null;
  private isRunning: boolean = false;
  private lastSync: string | null = null;

  constructor(google: GoogleCalendarService, cache: CacheStore, connectivity: ConnectivityMonitor) {
    this.google = google;
    this.cache = cache;
    this.connectivity = connectivity;
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  // ── Lifecycle ─────────────────────────────────────────────

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial full sync
    this.fullSync().catch(e => console.error('[Dagaz Sync] Initial sync failed:', e));

    // Incremental sync every 60 seconds
    this.syncInterval = setInterval(() => {
      if (this.connectivity.isOnline) {
        this.incrementalSync().catch(e => console.error('[Dagaz Sync] Incremental sync failed:', e));
      }
    }, 60000);

    // Full sync every 8 hours to reconcile stale/deleted events
    const FULL_SYNC_INTERVAL = 8 * 60 * 60 * 1000;
    this.fullSyncInterval = setInterval(() => {
      if (this.connectivity.isOnline) {
        console.log('[Dagaz Sync] Periodic full sync (8h)');
        this.fullSync().catch(e => console.error('[Dagaz Sync] Periodic full sync failed:', e));
      }
    }, FULL_SYNC_INTERVAL);

    // Process offline queue when coming online
    this.connectivity.on('online', () => {
      this.processQueue().catch(e => console.error('[Dagaz Sync] Queue processing failed:', e));
      this.incrementalSync().catch(e => console.error('[Dagaz Sync] Post-reconnect sync failed:', e));
    });
  }

  stop(): void {
    this.isRunning = false;
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.fullSyncInterval) {
      clearInterval(this.fullSyncInterval);
      this.fullSyncInterval = null;
    }
  }

  getStatus(): SyncStatus {
    return this._status;
  }

  getLastSync(): string | null {
    return this.lastSync;
  }

  getPendingCount(): number {
    return this.cache.getSyncQueueCount();
  }

  // ── Full Sync ─────────────────────────────────────────────

  async fullSync(): Promise<void> {
    if (!this.google.isAuthorized()) return;
    if (!this.connectivity.isOnline) {
      this._status = 'offline';
      this.notifyRenderer();
      return;
    }

    this._status = 'syncing';
    this.notifyRenderer();

    try {
      // Sync calendar list
      const calendars = await this.google.listCalendars();
      for (const cal of calendars) {
        this.cache.upsertCalendar(cal);
      }

      // Sync events for each visible calendar
      const visibleCalendars = this.cache.getVisibleCalendars();
      const now = new Date();
      const timeMin = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const timeMax = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();

      for (const cal of visibleCalendars) {
        try {
          const { events, nextSyncToken } = await this.google.listEvents(cal.id, {
            timeMin,
            timeMax,
            singleEvents: true,
          });

          const liveGoogleIds = new Set<string>();

          for (const event of events) {
            try {
              if (event.status === 'cancelled') {
                this.cache.deleteCancelledEvent(event.google_id);
                continue;
              }
              liveGoogleIds.add(event.google_id);
              const localId = this.cache.upsertEvent(event);
              if (event.attendees) {
                this.cache.upsertAttendees(localId, event.attendees.map(a => ({ ...a, event_id: localId })));
              }
            } catch (eventErr: any) {
              console.warn(`[Dagaz Sync] Failed to sync event ${event.google_id}:`, eventErr.message);
            }
          }

          // Remove local events that no longer exist on Google
          this.cache.reconcileCalendarEvents(cal.id, liveGoogleIds, timeMin, timeMax);

          if (nextSyncToken) {
            this.cache.updateCalendarSyncToken(cal.id, nextSyncToken);
          }
        } catch (e: any) {
          console.error(`[Dagaz Sync] Failed to sync calendar ${cal.summary}:`, e.message);
        }
      }

      this._status = 'synced';
      this.lastSync = new Date().toISOString();
      this.connectivity.reportOnline();
    } catch (e: any) {
      console.error('[Dagaz Sync] Full sync error:', e.message);
      this._status = this.connectivity.isOnline ? 'error' : 'offline';

      const msg = (e.message || '').toLowerCase();
      if (msg.includes('enotfound') || msg.includes('enetunreach') ||
          msg.includes('econnrefused') || msg.includes('etimedout')) {
        this.connectivity.reportOffline();
      }
    }

    this.notifyRenderer();
  }

  // ── Incremental Sync ──────────────────────────────────────

  async incrementalSync(): Promise<void> {
    if (!this.google.isAuthorized() || !this.connectivity.isOnline) return;

    this._status = 'syncing';
    this.notifyRenderer();

    try {
      const calendars = this.cache.getVisibleCalendars();
      let hasChanges = false;

      for (const cal of calendars) {
        if (!cal.sync_token) continue;

        try {
          const { events, nextSyncToken } = await this.google.listEvents(cal.id, {
            syncToken: cal.sync_token,
            singleEvents: true,
          });

          for (const event of events) {
            try {
              if (event.status === 'cancelled') {
                console.log(`[Dagaz Sync] Removing cancelled event: ${event.google_id}`);
                this.cache.deleteCancelledEvent(event.google_id);
                hasChanges = true;
                continue;
              }
              const localId = this.cache.upsertEvent(event);
              if (event.attendees) {
                this.cache.upsertAttendees(localId, event.attendees.map(a => ({ ...a, event_id: localId })));
              }
              hasChanges = true;
            } catch (eventErr: any) {
              console.warn(`[Dagaz Sync] Failed to sync event ${event.google_id}:`, eventErr.message);
              hasChanges = true;
            }
          }

          if (nextSyncToken) {
            this.cache.updateCalendarSyncToken(cal.id, nextSyncToken);
          }
        } catch (e: any) {
          console.error(`[Dagaz Sync] Incremental sync failed for ${cal.summary}:`, e.message);
        }
      }

      this._status = 'synced';
      this.lastSync = new Date().toISOString();
      this.connectivity.reportOnline();

      if (hasChanges) {
        this.notifyRenderer();
      }
    } catch (e: any) {
      console.error('[Dagaz Sync] Incremental sync error:', e.message);
      this._status = this.connectivity.isOnline ? 'error' : 'offline';
    }

    this.notifyRenderer();
  }

  // ── Process Offline Queue ─────────────────────────────────

  async processQueue(): Promise<{ succeeded: number; failed: number }> {
    if (!this.google.isAuthorized() || !this.connectivity.isOnline) {
      return { succeeded: 0, failed: 0 };
    }

    const queue = this.cache.getSyncQueue();
    let succeeded = 0;
    let failed = 0;

    for (const item of queue) {
      try {
        const payload = JSON.parse(item.payload);

        switch (item.action) {
          case 'create': {
            const result = await this.google.createEvent(item.calendar_id, payload);
            this.cache.markEventSynced(item.event_id, result.google_id, result.etag || null);
            break;
          }
          case 'update': {
            const event = this.cache.getEventByGoogleId(item.event_id);
            if (event?.google_id) {
              await this.google.updateEvent(item.calendar_id, event.google_id, payload);
            }
            break;
          }
          case 'delete': {
            await this.google.deleteEvent(item.calendar_id, item.event_id);
            break;
          }
          case 'rsvp': {
            await this.google.rsvpEvent(item.calendar_id, item.event_id, payload.response);
            break;
          }
        }

        this.cache.markQueueItemDone(item.id);
        succeeded++;
      } catch (e: any) {
        console.error(`[Dagaz Sync] Queue item ${item.id} failed:`, e.message);
        this.cache.markQueueItemFailed(item.id, e.message);
        failed++;
      }
    }

    // Also process events with pending_action
    const pendingEvents = this.cache.getPendingEvents();
    for (const event of pendingEvents) {
      try {
        if (event.pending_action === 'create' && event.pending_payload) {
          const payload = JSON.parse(event.pending_payload);
          const result = await this.google.createEvent(event.calendar_id, payload);
          this.cache.markEventSynced(event.id, result.google_id, result.etag || null);
          succeeded++;
        } else if (event.pending_action === 'delete' && event.google_id) {
          await this.google.deleteEvent(event.calendar_id, event.google_id);
          this.cache.deleteEvent(event.id);
          succeeded++;
        }
      } catch (e: any) {
        console.error(`[Dagaz Sync] Pending event ${event.id} failed:`, e.message);
        failed++;
      }
    }

    return { succeeded, failed };
  }

  // ── Notify Renderer ───────────────────────────────────────

  private notifyRenderer(): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('sync:changed', {
          status: this._status,
          lastSync: this.lastSync,
          pendingCount: this.getPendingCount(),
        });
      }
    } catch (e) {
      console.error('[Dagaz Sync] Failed to notify renderer:', e);
    }
  }
}
