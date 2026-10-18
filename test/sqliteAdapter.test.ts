import { createTestDb } from './sqliteAdapter';

describe('test sqlite adapter', () => {
  it('supports exec/run/all/first', async () => {
    const db = createTestDb();
    await db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await db.run('INSERT INTO t (name) VALUES (?)', ['a']);
    await db.run('INSERT INTO t (name) VALUES (?)', ['b']);
    expect((await db.all<{ name: string }>('SELECT name FROM t ORDER BY id')).map((r) => r.name)).toEqual(['a', 'b']);
    expect(await db.first<{ name: string }>('SELECT name FROM t WHERE id = ?', [2])).toEqual({ name: 'b' });
    expect(await db.first('SELECT * FROM t WHERE id = ?', [99])).toBeNull();
  });

  it('commits on success and rolls back on throw', async () => {
    const db = createTestDb();
    await db.exec('CREATE TABLE t (n INTEGER)');
    await db.tx(async () => db.run('INSERT INTO t VALUES (1)'));
    await expect(
      db.tx(async () => {
        await db.run('INSERT INTO t VALUES (2)');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await db.all<{ n: number }>('SELECT n FROM t')).map((r) => r.n)).toEqual([1]);
  });
});
