// Tiny runtime-switchable SQLite adapter (see Laguz's db.ts for the rationale).
//
// Node/Electron → better-sqlite3 (native module). Bun → bun:sqlite (built in,
// no native module, sidesteps the cross-runtime ABI conflict).
//
// Exposes the better-sqlite3 subset task-store uses. Note: unlike Laguz,
// Raidō calls pragma() as a value-returning query (e.g. table_info), so
// pragma() returns the result here.

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

  // better-sqlite3 returns rows for query-pragmas (table_info, etc.) and the
  // new value for setters. bun:sqlite has no .pragma(); run it as a query and
  // return the rows so both behave the same.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pragma(stmt: string): any {
    if (isBun) {
      return this.inner.query(`PRAGMA ${stmt}`).all();
    }
    return this.inner.pragma(stmt);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction(fn: any): any {
    return this.inner.transaction(fn);
  }

  close(): void {
    this.inner.close();
  }
}
