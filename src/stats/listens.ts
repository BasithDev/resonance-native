import type { Db } from '../db/types';

export type Listen = { id: number; youtubeId: string; durationSec: number; playedAt: number };

/**
 * Records `durationSec` of playback that ended at `playedAt` (epoch ms).
 * `playStart` marks the first chunk of a play (one load/replay of a track): it is what counts as a play.
 */
export async function log(
  db: Db,
  youtubeId: string,
  durationSec: number,
  playedAt: number,
  playStart = false,
): Promise<void> {
  await db.run('INSERT INTO listens (youtube_id, duration_sec, played_at, play_start) VALUES (?, ?, ?, ?)', [
    youtubeId,
    durationSec,
    playedAt,
    playStart ? 1 : 0,
  ]);
}

export async function unsynced(db: Db): Promise<Listen[]> {
  const rows = await db.all<{ id: number; youtube_id: string; duration_sec: number; played_at: number }>(
    'SELECT id, youtube_id, duration_sec, played_at FROM listens WHERE synced = 0 ORDER BY id',
  );
  return rows.map((r) => ({ id: r.id, youtubeId: r.youtube_id, durationSec: r.duration_sec, playedAt: r.played_at }));
}

export async function markSynced(db: Db, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await db.run(`UPDATE listens SET synced = 1 WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
}
