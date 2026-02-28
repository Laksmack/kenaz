import { watch, type FSWatcher } from 'chokidar';
import { config } from './config';
import type { VaultStore } from './vault-store';
import type { CabinetService } from './cabinet-service';

export class VaultWatcher {
  private watcher: FSWatcher | null = null;
  private store: VaultStore;
  private cabinetService: CabinetService | null = null;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;

  constructor(store: VaultStore) {
    this.store = store;
  }

  setCabinetService(service: CabinetService): void {
    this.cabinetService = service;
  }

  async start(): Promise<void> {
    if (this.store.isEmpty()) {
      this.store.rebuildIndex();
    } else {
      this.store.reconcile();
    }

    this.watcher = watch(config.vaultPath, {
      ignored: /(^|[/\\])\./,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    this.watcher
      .on('add', (filePath) => this.debounce(filePath, () => this.handleAdd(filePath)))
      .on('change', (filePath) => this.debounce(filePath, () => this.handleAdd(filePath)))
      .on('unlink', (filePath) => this.debounce(filePath, () => this.handleRemove(filePath)));

    this.reconcileTimer = setInterval(() => this.store.reconcile(), 5 * 60 * 1000);

    console.log(`[Laguz] Watching vault: ${config.vaultPath}`);
  }

  private handleAdd(filePath: string): void {
    if (this.cabinetService?.isCabinetPath(filePath) && this.cabinetService.isSupportedExt(filePath)) {
      this.cabinetService.indexDocument(filePath);
      return;
    }

    if (filePath.endsWith('.md')) {
      this.store.indexNote(filePath);
    } else if (filePath.endsWith('.pdf')) {
      this.store.indexFile(filePath);
    }
  }

  private handleRemove(filePath: string): void {
    if (this.cabinetService?.isCabinetPath(filePath)) {
      this.cabinetService.removeDocument(filePath);
      return;
    }

    if (filePath.endsWith('.md')) {
      this.store.removeNote(filePath);
    } else if (filePath.endsWith('.pdf')) {
      this.store.removeFile(filePath);
    }
  }

  private debounce(filePath: string, fn: () => void): void {
    const isCabinet = this.cabinetService?.isCabinetPath(filePath) && this.cabinetService.isSupportedExt(filePath);
    if (!isCabinet && !filePath.endsWith('.md') && !filePath.endsWith('.pdf')) return;

    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(filePath, setTimeout(() => {
      this.debounceTimers.delete(filePath);
      fn();
    }, 100));
  }

  stop(): void {
    if (this.reconcileTimer) {
      clearInterval(this.reconcileTimer);
      this.reconcileTimer = null;
    }
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }
}
