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
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'gone'];
    for (const id of ids) await addSong(db, track(id));
    // playCount = listened seconds / song length, at least 1
    const listened: Record<string, number> = { a: 300, b: 200, c: 210, d: 100, e: 60, f: 40, gone: 900 };
    for (const [id, sec] of Object.entries(listened)) {
      for (let t = 0; t < sec; t += 10) await listens.log(db, id, 10, now - 1000 - t);
    }
    await removeSong(db, 'gone');
    const s = await getStats(db, now);
    expect(s.mostPlayed.map((m) => [m.youtubeId, m.playCount, m.listenedSec])).toEqual([
      ['a', 3, 300],
      ['c', 2, 210],
      ['b', 2, 200],
      ['d', 1, 100],
      ['e', 1, 60],
    ]);
    expect(s.mostPlayed[0]).toMatchObject({ title: 'T a', addedAt: expect.any(Number) });
    expect(s.lifetimeSec).toBe(1810 + 0);
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
    // songs ordered by addedAt desc: s6, s5, ..., s0 -> index 2 is s4
    const morning = await getStats(db, at(2026, 10, 18, 8));
    const night = await getStats(db, at(2026, 10, 18, 23, 59));
    expect(morning.songOfTheDay?.youtubeId).toBe('s4');
    expect(night.songOfTheDay?.youtubeId).toBe('s4');
  });
});
