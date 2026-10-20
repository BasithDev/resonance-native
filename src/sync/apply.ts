import type { Db } from '../db/types';
import * as repo from '../library/repo';
import type { SyncResponse } from './types';

export type ApplyDeps = {
  removeDownload: (youtubeId: string) => Promise<void>;
};

/**
 * Adopts the server's library, deletes downloads of songs that are gone, then
 * clears the tombstones that were part of the request and records lastSyncAt.
 */
export async function applyResponse(
  db: Db,
  res: SyncResponse,
  requestTime: number,
  deps: ApplyDeps,
): Promise<void> {
  const { removedSongIds } = await repo.replaceLibrary(db, res.songs, res.playlists);
  for (const id of removedSongIds) {
    try {
      await deps.removeDownload(id);
    } catch {
      // A leftover file must not fail a sync whose library was already adopted.
    }
  }
  await repo.clearTombstones(db, requestTime);
  await repo.setLastSyncAt(db, res.serverTime);
}
