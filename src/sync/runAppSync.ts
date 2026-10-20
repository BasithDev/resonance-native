import { getDb } from '../db/instance';
import type { Db } from '../db/types';
import { downloads } from '../downloads/manager';
import { libraryEvents } from '../library/events';
import { listSongs } from '../library/repo';
import type { Song } from '../library/types';
import * as listens from '../stats/listens';
import { runSync } from './client';
import type { SyncPayload } from './qr';
import type { SyncSummary } from './types';

export type AppSyncResult = {
  summary: SyncSummary;
  /** Songs the phone didn't have before this sync (offered for download). */
  newSongs: Song[];
};

export type AppSyncDeps = {
  getDb: () => Promise<Db>;
  fetch?: typeof fetch;
  removeDownload: (youtubeId: string) => Promise<void>;
  emit: () => void;
  now?: () => number;
};

/** Wires `runSync` to the app's listens and downloads, and reports which songs are new to the phone. */
export function createAppSync(deps: AppSyncDeps) {
  return async (payload: SyncPayload): Promise<AppSyncResult> => {
    const db = await deps.getDb();
    const before = new Set((await listSongs(db)).map((s) => s.youtubeId));
    const summary = await runSync(db, payload, {
      fetch: deps.fetch,
      now: deps.now,
      removeDownload: deps.removeDownload,
      collectListens: async () => {
        const rows = await listens.unsynced(db);
        return {
          ids: rows.map((r) => r.id),
          listens: rows.map(({ youtubeId, durationSec, playedAt }) => ({ youtubeId, durationSec, playedAt })),
        };
      },
      markListensSynced: (ids) => listens.markSynced(db, ids),
    });
    const newSongs = (await listSongs(db)).filter((s) => !before.has(s.youtubeId));
    deps.emit();
    return { summary, newSongs };
  };
}

export const runAppSync = createAppSync({
  getDb,
  removeDownload: (id) => downloads.removeDownload(id),
  emit: () => libraryEvents.emit(),
});
