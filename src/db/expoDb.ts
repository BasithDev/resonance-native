import * as SQLite from 'expo-sqlite';

import type { Db } from './types';

/**
 * Production Db backed by expo-sqlite. `tx` mirrors the test adapter: raw
 * BEGIN/COMMIT/ROLLBACK on the single connection (not nestable). We avoid
 * withExclusiveTransactionAsync because it runs on a separate connection and
 * statements issued through this Db would not take part in the transaction.
 * Transactions are serialised so concurrent callers never interleave BEGINs.
 */
export async function openDb(name = 'resonance.db'): Promise<Db> {
  const raw = await SQLite.openDatabaseAsync(name);
  await raw.execAsync('PRAGMA journal_mode = WAL');
  let chain: Promise<unknown> = Promise.resolve();
  return {
    exec: (sql) => raw.execAsync(sql),
    async run(sql, p = []) {
      await raw.runAsync(sql, p as SQLite.SQLiteBindParams);
    },
    all: <T>(sql: string, p: unknown[] = []) => raw.getAllAsync<T>(sql, p as SQLite.SQLiteBindParams),
    async first<T>(sql: string, p: unknown[] = []) {
      return (await raw.getFirstAsync<T>(sql, p as SQLite.SQLiteBindParams)) ?? null;
    },
    tx(fn) {
      const result = chain.then(async () => {
        await raw.execAsync('BEGIN');
        try {
          await fn();
          await raw.execAsync('COMMIT');
        } catch (e) {
          await raw.execAsync('ROLLBACK');
          throw e;
        }
      });
      chain = result.catch(() => undefined);
      return result;
    },
  };
}
