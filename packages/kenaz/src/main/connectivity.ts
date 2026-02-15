import { net, BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import type { GmailService } from './gmail';

/**
 * Layered connectivity monitor:
 * 1. Electron net.online — OS-level connectivity
 * 2. Gmail API probe — confirms actual API access
 * 3. Failure detection — API call failures flip to offline
 */
export class ConnectivityMonitor extends EventEmitter {
  private _isOnline: boolean = true;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private gmail: GmailService | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingState: boolean | null = null;
  private mainWindow: BrowserWindow | null = null;

  get isOnline(): boolean {
    return this._isOnline;
  }

  setGmail(gmail: GmailService): void {
    this.gmail = gmail;
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  start(): void {
    // Initial state from OS
    this._isOnline = net.isOnline();

    // Listen to OS-level connectivity changes
    // Note: net.online/net.offline events are available as properties, not events
    // We'll rely on polling instead for reliability

    this.startPolling();
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Force an immediate check and return the result.
   */
  async checkNow(): Promise<boolean> {
    const online = await this.probe();
    this.updateState(online);
    return online;
  }

  /**
   * Called by other services when they detect an API failure that looks like
   * a connectivity issue (network errors, ENOTFOUND, etc.)
   */
  reportOffline(): void {
    this.updateState(false);
  }

  /**
   * Called when an API call succeeds, confirming we're online.
   */
  reportOnline(): void {
    this.updateState(true);
  }

  private startPolling(): void {
    const poll = async () => {
      const online = await this.probe();
      this.updateState(online);
    };

    // Poll more frequently when offline (faster reconnect detection)
    const getInterval = () => this._isOnline ? 30000 : 10000;

    const schedulePoll = () => {
      this.pollTimer = setTimeout(async () => {
        await poll();
        schedulePoll();
      }, getInterval());
    };

    schedulePoll();
  }

  private async probe(): Promise<boolean> {
    // Layer 1: OS-level check
    if (!net.isOnline()) {
      return false;
    }

    // Layer 2: If we have a gmail service, try a lightweight API call
    if (this.gmail) {
      try {
        await this.gmail.getProfile();
        return true;
      } catch (e: any) {
        // Network errors indicate offline
        const msg = e.message || '';
        if (msg.includes('ENOTFOUND') || msg.includes('ENETUNREACH') ||
            msg.includes('ECONNREFUSED') || msg.includes('ETIMEDOUT') ||
            msg.includes('ERR_NETWORK') || msg.includes('fetch failed')) {
          return false;
        }
        // Auth errors (401, 403) or "Not authenticated" — we're online but token is bad
        // Still count as online for connectivity purposes
        return true;
      }
    }

    // No gmail service — rely on OS check
    return true;
  }

  private updateState(online: boolean): void {
    if (online === this._isOnline) {
      // State unchanged — clear any pending debounce
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
        this.pendingState = null;
      }
      return;
    }

    // Debounce: state must be stable for 3 seconds before we emit
    if (this.pendingState === online) return; // Already debouncing this state

    this.pendingState = online;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.pendingState = null;

      if (online !== this._isOnline) {
        this._isOnline = online;
        console.log(`[Connectivity] State changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
        this.emit(online ? 'online' : 'offline');
        this.emit('changed', online);

        // Notify renderer
        this.notifyRenderer(online);
      }
    }, 3000);
  }

  private notifyRenderer(online: boolean): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('connectivity:changed', online);
      }
    } catch (e) {
      console.error('[Connectivity] Failed to notify renderer:', e);
    }
  }
}
