/**
 * App settings, persisted in the `kv` table as `settings.<key>` = 'true' | 'false'.
 * The store starts with the defaults and loads the saved values once on creation.
 */
import { create } from 'zustand';

import { getDb } from '../db/instance';
import type { Db } from '../db/types';

export type Settings = {
  /** Download over mobile data too (default: Wi-Fi only). */
  downloadOnCellular: boolean;
  /** Liking a song queues it for download. */
  autoDownloadLiked: boolean;
};

export type SettingsState = Settings & {
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
};

export const DEFAULT_SETTINGS: Settings = { downloadOnCellular: false, autoDownloadLiked: true };

const KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[];
const kvKey = (k: keyof Settings) => `settings.${k}`;

export function createSettingsStore(openDb: () => Promise<Db>) {
  const changed = new Set<keyof Settings>(); // set before the saved values arrived: those win
  const store = create<SettingsState>()((set) => ({
    ...DEFAULT_SETTINGS,
    set(key, value) {
      changed.add(key);
      set({ [key]: value } as Partial<Settings>);
      openDb()
        .then((db) => db.run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [kvKey(key), String(value)]))
        .catch(() => {});
    },
  }));

  const ready: Promise<void> = openDb()
    .then(async (db) => {
      const rows = await db.all<{ key: string; value: string | null }>(
        `SELECT key, value FROM kv WHERE key IN (${KEYS.map(() => '?').join(', ')})`,
        KEYS.map(kvKey),
      );
      const saved: Partial<Settings> = {};
      for (const k of KEYS) {
        const r = rows.find((x) => x.key === kvKey(k));
        if (r && !changed.has(k)) saved[k] = r.value === 'true';
      }
      store.setState(saved);
    })
    .catch(() => {}); // keep the defaults

  return { store, ready: () => ready };
}

const instance = createSettingsStore(getDb);

export const useSettings = instance.store;
/** Resolves once the saved settings have been loaded (or failed to load). */
export const settingsReady = instance.ready;
