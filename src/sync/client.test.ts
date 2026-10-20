import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import {
  addSong, getLastSyncAt, listSongs, listTombstones, migrate, removeSong,
} from '../library/repo';
import { runSync, type SyncDeps } from './client';
import { SyncError } from './types';
import type { SyncResponse } from './types';

const summary = {
  toPhone: { songs: 0, playlists: 0 },
  fromPhone: { songs: 0, playlists: 0 },
  removed: { songs: 0, playlists: 0 },
};
const payload = { urls: ['http://bridge/api', 'http://lan/api'], code: 'ABCD2345' };
const json = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;

let db: Db;
let removed: string[];
let marked: number[][];
const mkDeps = (f: typeof fetch, now = () => 1000): SyncDeps => ({
  fetch: f,
  removeDownload: async (id) => { removed.push(id); },
  collectListens: async () => ({ ids: [1, 2], listens: [{ youtubeId: 'a', durationSec: 5, playedAt: 1 }] }),
  markListensSynced: async (ids) => { marked.push(ids); },
  now,
});
const okResponse = (over: Partial<SyncResponse> = {}): SyncResponse => ({
  serverTime: 5000, songs: [], playlists: [], summary, ...over,
});

beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
  removed = [];
  marked = [];
  jest.spyOn(Date, 'now').mockReturnValue(100);
});
afterEach(() => jest.restoreAllMocks());

describe('runSync', () => {
  it('on 401 throws expired and leaves tombstones intact', async () => {
    await addSong(db, { youtubeId: 'a', title: 't', channel: null, durationSec: null, thumbnailUrl: 'x' });
    await removeSong(db, 'a');
    const f = jest.fn(async (url: string) =>
      url.endsWith('/health') ? json(200, {}) : json(401, { error: { message: 'Sync code expired or already used' } }),
    );
    const err = await runSync(db, payload, mkDeps(f as never)).catch((e) => e);
    expect(err).toBeInstanceOf(SyncError);
    expect(err).toMatchObject({
      kind: 'expired',
      message: 'This code has expired — tap Sync on the web again',
    });
    expect(await listTombstones(db)).toHaveLength(1);
    expect(marked).toEqual([]);
  });

  it('on network failure for all urls throws unreachable', async () => {
    const f = jest.fn(async () => { throw new TypeError('Network request failed'); });
    await expect(runSync(db, payload, mkDeps(f as never))).rejects.toMatchObject({
      kind: 'unreachable',
      message: "Can't reach your computer — check both are on the same Wi-Fi",
    });
  });

  it('uses the first url whose /health answers and surfaces server error messages', async () => {
    const calls: string[] = [];
    const f = jest.fn(async (url: string) => {
      calls.push(url);
      if (url === 'http://bridge/api/health') throw new TypeError('nope');
      if (url.endsWith('/health')) return json(200, {});
      return json(422, { error: { message: 'bad body' } });
    });
    await expect(runSync(db, payload, mkDeps(f as never))).rejects.toMatchObject({
      kind: 'server', message: 'bad body',
    });
    expect(calls).toContain('http://lan/api/sync');
    expect(calls).not.toContain('http://bridge/api/sync');
  });

  it('success clears tombstones created before the request, keeps newer ones, stores lastSyncAt', async () => {
    const t = jest.spyOn(Date, 'now');
    for (const id of ['a', 'b', 'c']) {
      t.mockReturnValue(100);
      await addSong(db, { youtubeId: id, title: id, channel: null, durationSec: null, thumbnailUrl: 'x' });
    }
    t.mockReturnValue(500);
    await removeSong(db, 'a');
    t.mockReturnValue(2000);
    await removeSong(db, 'b'); // made after the request time (1000), e.g. during the sync

    let body: any;
    const f = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/health')) return json(200, {});
      body = JSON.parse(init!.body as string);
      expect((init!.headers as Record<string, string>)['X-Sync-Code']).toBe('ABCD2345');
      return json(200, okResponse({
        songs: [{ youtubeId: 'c', title: 'c', channel: null, durationSec: null, thumbnailUrl: null, addedAt: 1 },
                { youtubeId: 'z', title: 'z', channel: null, durationSec: null, thumbnailUrl: null, addedAt: 1 }],
      }));
    });
    const s = await runSync(db, payload, mkDeps(f as never, () => 1000));

    expect(s).toEqual(summary);
    expect(body).toMatchObject({ v: 1, lastSyncAt: null });
    expect(body.listens).toHaveLength(1);
    expect(body.deletions.map((d: any) => d.key)).toContain('a');
    expect((await listTombstones(db)).map((x) => x.key)).toEqual(['b']);
    expect(await getLastSyncAt(db)).toBe(5000);
    expect((await listSongs(db)).map((x) => x.youtubeId).sort()).toEqual(['c', 'z']);
    expect(marked).toEqual([[1, 2]]);
  });

  it('calls removeDownload for songs the server dropped and sends the stored lastSyncAt', async () => {
    await addSong(db, { youtubeId: 'a', title: 'a', channel: null, durationSec: null, thumbnailUrl: 'x' });
    await db.run("INSERT INTO kv (key, value) VALUES ('lastSyncAt', '777')");
    let body: any;
    const f = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/health')) return json(200, {});
      body = JSON.parse(init!.body as string);
      return json(200, okResponse());
    });
    await runSync(db, payload, mkDeps(f as never));
    expect(body.lastSyncAt).toBe(777);
    expect(removed).toEqual(['a']);
  });
});
