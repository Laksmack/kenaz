import type { BrowserWindow } from 'electron';
import { EventEmitter } from 'events';
import { IPC } from '../shared/types';

// isOnlineNative() under Electron; under the sidecar (Node/Bun) there's no
// electron.net — assume online and let the Google API probes flip us offline
// on real failures.
function isOnlineNative(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('electron').net.isOnline();
  } catch {
    return true;
  }
}

/**
 * Layered connectivity monitor:
 * 1. Electron net.online — OS-level connectivity
 * 2. Google Calendar API probe — confirms actual API access
 * 3. Failure detection — API call failures flip to offline
 */
export class ConnectivityMonitor extends EventEmitter {
  private _isOnline: boolean = true;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingState: boolean | null = null;
  private mainWindow: BrowserWindow | null = null;

  get isOnline(): boolean {
    return this._isOnline;
  }

  setMainWindow(win: BrowserWindow | null): void {
    this.mainWindow = win;
  }

  start(): void {
    this._isOnline = isOnlineNative();
    this.startPolling();
  }

  stop(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  async checkNow(): Promise<boolean> {
    const online = isOnlineNative();
    this.updateState(online);
    return online;
  }

  reportOffline(): void {
    this.updateState(false);
  }

  reportOnline(): void {
    this.updateState(true);
  }

  private startPolling(): void {
    const getInterval = () => this._isOnline ? 30000 : 10000;

    const schedulePoll = () => {
      this.pollTimer = setTimeout(async () => {
        const online = isOnlineNative();
        this.updateState(online);
        schedulePoll();
      }, getInterval());
    };

    schedulePoll();
  }

  private updateState(online: boolean): void {
    if (online === this._isOnline) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = null;
        this.pendingState = null;
      }
      return;
    }

    if (this.pendingState === online) return;

    this.pendingState = online;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.pendingState = null;

      if (online !== this._isOnline) {
        this._isOnline = online;
        console.log(`[Dagaz Connectivity] State changed: ${online ? 'ONLINE' : 'OFFLINE'}`);
        this.emit(online ? 'online' : 'offline');
        this.emit('changed', online);
        this.notifyRenderer(online);
      }
    }, 3000);
  }

  private notifyRenderer(online: boolean): void {
    try {
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send(IPC.CONNECTIVITY_CHANGED, online);
      }
    } catch (e) {
      console.error('[Dagaz Connectivity] Failed to notify renderer:', e);
    }
  }
}
