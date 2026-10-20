import { migrate } from '../library/repo';
import { openDb } from './expoDb';
import type { Db } from './types';

let pending: Promise<Db> | null = null;

/** The app-wide database, opened and migrated once on first use. */
export function getDb(): Promise<Db> {
  if (!pending) {
    pending = openDb()
      .then(async (db) => {
        await migrate(db);
        return db;
      })
      .catch((e) => {
        pending = null;
        throw e;
      });
  }
  return pending;
}
