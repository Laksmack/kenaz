import { watch, type FSWatcher } from 'chokidar';
import { config } from './config';
import type { VaultStore } from './vault-store';

export class VaultWatcher {
  private watcher: FSWatcher | null = null;
  private store: VaultStore;
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(store: VaultStore) {
    this.store = store;
  }

  async start(): Promise<void> {
    if (this.store.isEmpty()) {
      this.store.rebuildIndex();
    }

    this.watcher = watch(config.vaultPath, {
      ignored: /(^|[/\\])\./,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
    });

    this.watcher
      .on('add', (filePath) => this.debounce(filePath, () => this.store.indexNote(filePath)))
      .on('change', (filePath) => this.debounce(filePath, () => this.store.indexNote(filePath)))
      .on('unlink', (filePath) => this.debounce(filePath, () => this.store.removeNote(filePath)));

    console.log(`[Laguz] Watching vault: ${config.vaultPath}`);
  }

  private debounce(filePath: string, fn: () => void): void {
    if (!filePath.endsWith('.md')) return;
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(filePath, setTimeout(() => {
      this.debounceTimers.delete(filePath);
      fn();
    }, 100));
  }

  stop(): void {
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
