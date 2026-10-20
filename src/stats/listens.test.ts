import { createTestDb } from '../../test/sqliteAdapter';
import { migrate } from '../library/repo';
import * as listens from './listens';

describe('listens', () => {
  it('unsynced/markSynced round trip', async () => {
    const db = createTestDb();
    await migrate(db);
    await listens.log(db, 'a', 10, 1000);
    await listens.log(db, 'b', 7, 2000);
    const rows = await listens.unsynced(db);
    expect(rows).toEqual([
      { id: expect.any(Number), youtubeId: 'a', durationSec: 10, playedAt: 1000 },
      { id: expect.any(Number), youtubeId: 'b', durationSec: 7, playedAt: 2000 },
    ]);
    await listens.markSynced(db, [rows[0].id]);
    expect((await listens.unsynced(db)).map((r) => r.youtubeId)).toEqual(['b']);
    await listens.markSynced(db, []);
    await listens.markSynced(db, [rows[1].id]);
    expect(await listens.unsynced(db)).toEqual([]);
  });

  it('markSynced handles more ids than SQLite allows variables in one statement', async () => {
    const db = createTestDb();
    await migrate(db);
    const n = 40_000;
    await db.tx(async () => {
      for (let i = 0; i < n; i++) await listens.log(db, 'a', 1, i);
    });
    await listens.log(db, 'later', 1, n);
    const rows = await listens.unsynced(db);
    const sent = rows.slice(0, n).map((r) => r.id);
    await listens.markSynced(db, sent);
    expect((await listens.unsynced(db)).map((r) => r.youtubeId)).toEqual(['later']);
  });
});
