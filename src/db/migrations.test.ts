import { createTestDb } from '../../test/sqliteAdapter';
import { MIGRATIONS, runMigrations } from './migrations';

describe('migrations', () => {
  it('runs every step from scratch and is a no-op when re-run', async () => {
    const db = createTestDb();
    await runMigrations(db);
    await runMigrations(db);
    const row = await db.first<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(MIGRATIONS.length);
  });

  it('indexes listens by youtube_id', async () => {
    const db = createTestDb();
    await runMigrations(db);
    const indexes = await db.all<{ name: string }>("PRAGMA index_list('listens')");
    const columns = await Promise.all(
      indexes.map((i) => db.all<{ name: string }>(`PRAGMA index_info('${i.name}')`)),
    );
    expect(columns.some((cols) => cols.length === 1 && cols[0].name === 'youtube_id')).toBe(true);
  });

  it('upgrades a database left at the previous schema version', async () => {
    const db = createTestDb();
    for (let v = 0; v < MIGRATIONS.length - 1; v++) await db.exec(MIGRATIONS[v]);
    await db.exec(`PRAGMA user_version = ${MIGRATIONS.length - 1}`);
    await db.run("INSERT INTO listens (youtube_id, duration_sec, played_at) VALUES ('a', 10, 1)");
    await runMigrations(db);
    const row = await db.first<{ user_version: number }>('PRAGMA user_version');
    expect(row?.user_version).toBe(MIGRATIONS.length);
    expect(await db.all('SELECT youtube_id FROM listens')).toEqual([{ youtube_id: 'a' }]);
  });
});
