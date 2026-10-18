import Database from 'better-sqlite3';

import type { Db } from '../src/db/types';

/** Jest-only Db backed by better-sqlite3 (in-memory by default). */
export function createTestDb(filename = ':memory:'): Db {
  const raw = new Database(filename);
  return {
    async exec(sql) {
      raw.exec(sql);
    },
    async run(sql, p = []) {
      raw.prepare(sql).run(...(p as never[]));
    },
    async all<T>(sql: string, p: unknown[] = []) {
      return raw.prepare(sql).all(...(p as never[])) as T[];
    },
    async first<T>(sql: string, p: unknown[] = []) {
      return (raw.prepare(sql).get(...(p as never[])) as T | undefined) ?? null;
    },
    async tx(fn) {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
