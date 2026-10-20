const mockRemoveDownload = jest.fn(async (_id: string) => {});
jest.mock('../downloads/manager', () => ({ downloads: { removeDownload: (id: string) => mockRemoveDownload(id) } }));
let mockDb: Db;
jest.mock('../db/instance', () => ({ getDb: () => Promise.resolve(mockDb) }));

import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import { libraryEvents } from '../library/events';
import { addSong, migrate } from '../library/repo';
import * as listens from '../stats/listens';
import { createAppSync, runAppSync } from './runAppSync';
import type { SyncResponse, SyncSong } from './types';

const summary = {
  toPhone: { songs: 2, playlists: 0 },
  fromPhone: { songs: 0, playlists: 0 },
  removed: { songs: 0, playlists: 0 },
};
const payload = { urls: ['http://lan/api'], code: 'ABCD2345' };
const json = (status: number, body: unknown) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => body }) as Response;
const ssong = (id: string, durationSec: number | null = 60): SyncSong => ({
  youtubeId: id, title: id, channel: null, durationSec, thumbnailUrl: null, addedAt: 1,
});

let db: Db;
let removed: string[];
let emits: number;
let body: any;
const fakeFetch = (status: number, res: unknown) =>
  jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/health')) return json(200, {});
    body = JSON.parse(init!.body as string);
    return json(status, res);
  }) as unknown as typeof fetch;
const mk = (f: typeof fetch) =>
  createAppSync({
    getDb: async () => db,
    fetch: f,
    removeDownload: async (id) => { removed.push(id); },
    emit: () => { emits++; },
    now: () => 1000,
  });

beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
  removed = [];
  emits = 0;
  body = undefined;
});

describe('createAppSync', () => {
  it('sends unsynced listens, marks them synced, removes dropped downloads, emits once and reports new songs', async () => {
    await addSong(db, { youtubeId: 'keep', title: 'keep', channel: null, durationSec: 1, thumbnailUrl: 'x' });
    await addSong(db, { youtubeId: 'gone', title: 'gone', channel: null, durationSec: 1, thumbnailUrl: 'x' });
    await listens.log(db, 'keep', 30, 500);
    const res: SyncResponse = {
      serverTime: 5000, songs: [ssong('keep'), ssong('n1'), ssong('n2', null)], playlists: [], summary,
    };

    const out = await mk(fakeFetch(200, res))(payload);

    expect(body.listens).toEqual([{ youtubeId: 'keep', durationSec: 30, playedAt: 500 }]);
    expect(await listens.unsynced(db)).toEqual([]);
    expect(removed).toEqual(['gone']);
    expect(emits).toBe(1);
    expect(out.summary).toEqual(summary);
    expect(out.newSongs.map((s) => s.youtubeId).sort()).toEqual(['n1', 'n2']);
  });

  it('on failure leaves listens unsynced, does not emit and rethrows the SyncError', async () => {
    await listens.log(db, 'a', 30, 500);
    const err = await mk(fakeFetch(401, {}))(payload).catch((e) => e);
    expect(err).toMatchObject({ kind: 'expired' });
    expect(await listens.unsynced(db)).toHaveLength(1);
    expect(emits).toBe(0);
  });

  it('runAppSync uses the app database, the download manager and library events', async () => {
    mockDb = db;
    await addSong(db, { youtubeId: 'gone', title: 'gone', channel: null, durationSec: 1, thumbnailUrl: 'x' });
    const onEmit = jest.fn();
    const unsub = libraryEvents.subscribe(onEmit);
    const f = fakeFetch(200, { serverTime: 5000, songs: [ssong('n1')], playlists: [], summary });
    const orig = globalThis.fetch;
    globalThis.fetch = f;
    try {
      const out = await runAppSync(payload);
      expect(out.newSongs.map((s) => s.youtubeId)).toEqual(['n1']);
    } finally {
      globalThis.fetch = orig;
      unsub();
    }
    expect(mockRemoveDownload).toHaveBeenCalledWith('gone');
    expect(onEmit).toHaveBeenCalledTimes(1);
  });
});
