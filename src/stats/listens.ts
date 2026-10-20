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

/** SQLite caps a statement's bound variables (32,766), so ids go in chunks. */
const MARK_CHUNK = 500;

export async function markSynced(db: Db, ids: number[]): Promise<void> {
  for (let i = 0; i < ids.length; i += MARK_CHUNK) {
    const chunk = ids.slice(i, i + MARK_CHUNK);
    await db.run(`UPDATE listens SET synced = 1 WHERE id IN (${chunk.map(() => '?').join(',')})`, chunk);
  }
}
