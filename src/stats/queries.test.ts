import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import { addSong, migrate, removeSong } from '../library/repo';
import * as listens from './listens';
import { getStats } from './queries';

const DAY = 86_400_000;
const at = (y: number, m: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s).getTime();

async function setup(): Promise<Db> {
  const db = createTestDb();
  await migrate(db);
  return db;
}
const track = (id: string, durationSec = 100) => ({
  youtubeId: id, title: `T ${id}`, channel: 'C', durationSec, thumbnailUrl: 'https://img/x.jpg',
});

describe('getStats', () => {
  it('today counts only chunks since local midnight', async () => {
    const db = await setup();
    const now = at(2026, 10, 18, 12);
    await listens.log(db, 'a', 10, at(2026, 10, 17, 23, 59, 55));
    await listens.log(db, 'a', 10, at(2026, 10, 18, 0, 0, 5));
    await listens.log(db, 'a', 10, at(2026, 10, 18, 9));
    const s = await getStats(db, now);
    expect(s.todaySec).toBe(20);
    expect(s.weekSec).toBe(30);
  });

  it('week/month/year/lifetime windows', async () => {
    const db = await setup();
    const now = at(2026, 10, 18, 12);
    await listens.log(db, 'a', 1, now - 6 * DAY);
    await listens.log(db, 'a', 10, now - 8 * DAY);
    await listens.log(db, 'a', 100, now - 29 * DAY);
    await listens.log(db, 'a', 1000, now - 31 * DAY);
    await listens.log(db, 'a', 10000, now - 364 * DAY);
    await listens.log(db, 'a', 100000, now - 366 * DAY);
    const s = await getStats(db, now);
    expect(s.todaySec).toBe(0);
    expect(s.weekSec).toBe(1);
    expect(s.monthSec).toBe(111);
    expect(s.yearSec).toBe(11111);
    expect(s.lifetimeSec).toBe(111111);
  });

  it('mostPlayed top 5 by playCount then listenedSec; excludes deleted songs; lifetime still counts their time', async () => {
    const db = await setup();
    const now = at(2026, 10, 18, 12);
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'gone']) await addSong(db, track(id));
    // A play = one session; only its first chunk has playStart.
    const plays: Record<string, [sessions: number, secPerSession: number]> = {
      a: [10, 10], b: [3, 100], c: [3, 70], d: [1, 1000], e: [1, 60], f: [1, 40], gone: [20, 10],
    };
    let at0 = now - 1000;
    for (const [id, [sessions, secEach]] of Object.entries(plays)) {
      for (let k = 0; k < sessions; k++) {
        for (let t = 0; t < secEach; t += 10) await listens.log(db, id, 10, at0--, t === 0);
      }
    }
    await removeSong(db, 'gone');
    const s = await getStats(db, now);
    expect(s.mostPlayed.map((m) => [m.youtubeId, m.playCount, m.listenedSec])).toEqual([
      ['a', 10, 100],
      ['b', 3, 300],
      ['c', 3, 210],
      ['d', 1, 1000],
      ['e', 1, 60],
    ]);
    expect(s.mostPlayed[0]).toMatchObject({ title: 'T a', addedAt: expect.any(Number) });
    expect(s.lifetimeSec).toBe(100 + 300 + 210 + 1000 + 60 + 40 + 200);
  });

  it("songOfTheDay is stable for the same date and matches the web hash for '2026-10-18'", async () => {
    const db = await setup();
    expect((await getStats(db, at(2026, 10, 18, 8))).songOfTheDay).toBeNull();
    for (let i = 0; i < 7; i++) {
      await addSong(db, track(`s${i}`));
      await db.run('UPDATE songs SET added_at = ? WHERE youtube_id = ?', [1000 + i, `s${i}`]);
    }
    // Web algorithm on '2026-10-18' gives hash 1162559498; 1162559498 % 7 = 2.
    let hash = 0;
    for (const c of '2026-10-18') {
      hash = (hash << 5) - hash + c.charCodeAt(0);
      hash |= 0;
    }
    expect(hash).toBe(1162559498);
    const morning = await getStats(db, at(2026, 10, 18, 8));
    const night = await getStats(db, at(2026, 10, 18, 23, 59));
    const ordered = ['s6', 's5', 's4', 's3', 's2', 's1', 's0'];
    const expected = ordered[Math.abs(hash) % ordered.length];
    expect(morning.songOfTheDay?.youtubeId).toBe(expected);
    expect(night.songOfTheDay?.youtubeId).toBe(expected);
  });
});
