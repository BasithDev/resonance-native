import { getDb } from '../db/instance';
import type { Db } from '../db/types';
import { downloads } from '../downloads/manager';
import { libraryEvents } from '../library/events';
import { getPlaylistSongs, listSongs } from '../library/repo';
import type { Song } from '../library/types';
import { usePlayer } from '../player/store';
import { settingsReady, useSettings } from '../settings/store';
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
  /** Cancels downloads of and deletes files for songs the sync removed (their rows are gone). */
  forgetSongs: (youtubeIds: string[]) => Promise<void>;
  /** Drops a removed song from the play queue. */
  onSongRemoved: (youtubeId: string) => void;
  emit: () => void;
  /** Whether liked songs are auto-downloaded (setting). */
  autoDownloadLiked: () => boolean | Promise<boolean>;
  /** Queues downloads; songs already on the phone or queued are skipped. */
  enqueueDownloads: (youtubeIds: string[]) => Promise<void>;
  now?: () => number;
};

/** Wires `runSync` to the app's listens and downloads, and reports which songs are new to the phone. */
export function createAppSync(deps: AppSyncDeps) {
  return async (payload: SyncPayload): Promise<AppSyncResult> => {
    const db = await deps.getDb();
    const before = new Set((await listSongs(db)).map((s) => s.youtubeId));
    const removed: string[] = [];
    let summary: SyncSummary | null = null;
    try {
      summary = await runSync(db, payload, {
        fetch: deps.fetch,
        now: deps.now,
        // Collected and cleaned up together below, so N removals cause one refresh, not N.
        removeDownload: async (id) => {
          removed.push(id);
        },
        collectListens: async () => {
          const rows = await listens.unsynced(db);
          return {
            ids: rows.map((r) => r.id),
            listens: rows.map(({ youtubeId, durationSec, playedAt }) => ({ youtubeId, durationSec, playedAt })),
          };
        },
        markListensSynced: (ids) => listens.markSynced(db, ids),
      });
    } finally {
      // Runs on failure too: the library may already be replaced when a later step fails.
      if (removed.length > 0) {
        await deps.forgetSongs(removed).catch((e) => console.warn('[sync] deleting removed downloads failed', e));
        removed.forEach((id) => deps.onSongRemoved(id));
      }
      if (summary !== null || removed.length > 0) deps.emit();
    }
    // Songs liked on the web arrive without a download; queue them like a local ♥ would.
    try {
      if (await deps.autoDownloadLiked()) {
        const liked = await getPlaylistSongs(db, 'liked');
        if (liked.length > 0) await deps.enqueueDownloads(liked.map((s) => s.youtubeId));
      }
    } catch (e) {
      console.warn('[sync] queueing liked downloads failed', e);
    }
    const newSongs = (await listSongs(db)).filter((s) => !before.has(s.youtubeId));
    return { summary, newSongs };
  };
}

export const runAppSync = createAppSync({
  getDb,
  forgetSongs: (ids) => downloads.forgetSongs(ids),
  onSongRemoved: (id) => usePlayer.getState().onSongRemoved(id),
  emit: () => libraryEvents.emit(),
  autoDownloadLiked: async () => {
    await settingsReady();
    return useSettings.getState().autoDownloadLiked;
  },
  enqueueDownloads: (ids) => downloads.enqueue(ids),
});
