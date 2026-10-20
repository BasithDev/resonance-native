import type { Db } from '../db/types';
import { listSongs } from '../library/repo';
import type { Song } from '../library/types';

const DAY = 86_400_000;

export type MostPlayed = Song & { playCount: number; listenedSec: number };
export type Stats = {
  todaySec: number;
  weekSec: number;
  monthSec: number;
  yearSec: number;
  lifetimeSec: number;
  mostPlayed: MostPlayed[];
  songOfTheDay: Song | null;
};

/** Local `YYYY-MM-DD`. */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The web backend's day hash; same date string, same song. */
function dayHash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function pickSongOfTheDay(songsNewestFirst: Song[], now: number): Song | null {
  if (songsNewestFirst.length === 0) return null;
  return songsNewestFirst[Math.abs(dayHash(localDateKey(now))) % songsNewestFirst.length];
}

export async function getStats(db: Db, now: number): Promise<Stats> {
  const d = new Date(now);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const row = await db.first<{ today: number; week: number; month: number; year: number; life: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN played_at >= ? THEN duration_sec END), 0) AS today,
       COALESCE(SUM(CASE WHEN played_at >= ? THEN duration_sec END), 0) AS week,
       COALESCE(SUM(CASE WHEN played_at >= ? THEN duration_sec END), 0) AS month,
       COALESCE(SUM(CASE WHEN played_at >= ? THEN duration_sec END), 0) AS year,
       COALESCE(SUM(duration_sec), 0) AS life
     FROM listens`,
    [midnight, now - 7 * DAY, now - 30 * DAY, now - 365 * DAY],
  );

  // Songs only exist while in the library, so a deleted song drops out of the join.
  // A play is one listen session; its first chunk carries play_start = 1.
  const top = await db.all<{ youtube_id: string; listened: number; plays: number }>(
    `SELECT l.youtube_id, SUM(l.duration_sec) AS listened, SUM(l.play_start) AS plays
     FROM listens l JOIN songs s ON s.youtube_id = l.youtube_id
     GROUP BY l.youtube_id
     ORDER BY plays DESC, listened DESC, l.youtube_id
     LIMIT 5`,
  );

  const songs = await listSongs(db);
  const byId = new Map(songs.map((s) => [s.youtubeId, s]));
  return {
    todaySec: row?.today ?? 0,
    weekSec: row?.week ?? 0,
    monthSec: row?.month ?? 0,
    yearSec: row?.year ?? 0,
    lifetimeSec: row?.life ?? 0,
    mostPlayed: top.flatMap((t) => {
      const song = byId.get(t.youtube_id);
      return song ? [{ ...song, playCount: t.plays, listenedSec: t.listened }] : [];
    }),
    songOfTheDay: pickSongOfTheDay(songs, now),
  };
}
