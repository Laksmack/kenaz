// Tiny runtime-switchable SQLite adapter.
//
// Under Node/Electron, use better-sqlite3 (the native module shipped with the
// Electron app).
//
// Under Bun, use bun:sqlite (built into the Bun runtime — avoids the
// better-sqlite3 ABI mismatch between Electron 39 and Bun, since both want
// different NODE_MODULE_VERSIONs of the same .node binary).
//
// The exposed API is the better-sqlite3 subset that vault-store actually
// uses: { new Database(path), exec, pragma, prepare, transaction, close }
// plus the Statement methods { run, get, all }. bun:sqlite already aliases
// `prepare` to `query`, so we mostly just thin-wrap.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isBun = typeof (globalThis as any).Bun !== 'undefined';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let DatabaseImpl: any;
if (isBun) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseImpl = require('bun:sqlite').Database;
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DatabaseImpl = require('better-sqlite3');
}

export class Database {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private inner: any;

  constructor(path: string) {
    this.inner = new DatabaseImpl(path);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prepare(sql: string): any {
    return this.inner.prepare(sql);
  }

  exec(sql: string): void {
    this.inner.exec(sql);
  }

  // bun:sqlite has no `.pragma()`. Translate to `run('PRAGMA ...')`.
  // better-sqlite3 pragma returns rows; we don't read the return value
  // anywhere in vault-store, so void is fine.
  pragma(stmt: string): void {
    if (isBun) {
      this.inner.run(`PRAGMA ${stmt}`);
    } else {
      this.inner.pragma(stmt);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction(fn: any): any {
    return this.inner.transaction(fn);
  }

  close(): void {
    this.inner.close();
  }
}
