const mockForgetSongs = jest.fn(async (_ids: string[]) => {});
const mockEnqueue = jest.fn(async (_ids: string[]) => {});
jest.mock('../downloads/manager', () => ({
  downloads: { forgetSongs: (ids: string[]) => mockForgetSongs(ids), enqueue: (ids: string[]) => mockEnqueue(ids) },
}));
const mockSettings = { autoDownloadLiked: true };
jest.mock('../settings/store', () => ({
  useSettings: { getState: () => mockSettings },
  settingsReady: () => Promise.resolve(),
}));
const mockOnSongRemoved = jest.fn();
jest.mock('../player/store', () => ({ usePlayer: { getState: () => ({ onSongRemoved: mockOnSongRemoved }) } }));
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
let forgotten: string[][];
let removedFromPlayer: string[];
let emits: number;
let enqueued: string[][];
let autoDownloadLiked: boolean;
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
    forgetSongs: async (ids) => { forgotten.push(ids); },
    onSongRemoved: (id) => { removedFromPlayer.push(id); },
    emit: () => { emits++; },
    autoDownloadLiked: () => autoDownloadLiked,
    enqueueDownloads: async (ids) => { enqueued.push(ids); },
    now: () => 1000,
  });

beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
  forgotten = [];
  removedFromPlayer = [];
  emits = 0;
  enqueued = [];
  autoDownloadLiked = true;
  body = undefined;
});

describe('createAppSync', () => {
  it('sends unsynced listens, marks them synced, drops removed songs from downloads and the player, emits once and reports new songs', async () => {
    await addSong(db, { youtubeId: 'keep', title: 'keep', channel: null, durationSec: 1, thumbnailUrl: 'x' });
    await addSong(db, { youtubeId: 'gone', title: 'gone', channel: null, durationSec: 1, thumbnailUrl: 'x' });
    await addSong(db, { youtubeId: 'gone2', title: 'gone2', channel: null, durationSec: 1, thumbnailUrl: 'x' });
    await listens.log(db, 'keep', 30, 500);
    const res: SyncResponse = {
      serverTime: 5000, songs: [ssong('keep'), ssong('n1'), ssong('n2', null)], playlists: [], summary,
    };

    const out = await mk(fakeFetch(200, res))(payload);

    expect(body.listens).toEqual([{ youtubeId: 'keep', durationSec: 30, playedAt: 500 }]);
    expect(await listens.unsynced(db)).toEqual([]);
    expect(forgotten).toEqual([['gone', 'gone2']]);
    expect(removedFromPlayer).toEqual(['gone', 'gone2']);
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

  it('cleans up removed songs even when a later step fails', async () => {
    await addSong(db, { youtubeId: 'gone', title: 'gone', channel: null, durationSec: 1, thumbnailUrl: 'x' });
    const res: SyncResponse = { serverTime: 5000, songs: [], playlists: [], summary };
    const sync = createAppSync({
      getDb: async () => ({ ...db, run: async (sql: string, p?: unknown[]) => {
        if (sql.includes('UPDATE listens')) throw new Error('disk I/O');
        return db.run(sql, p);
      } }) as Db,
      fetch: fakeFetch(200, res),
      forgetSongs: async (ids) => { forgotten.push(ids); },
      onSongRemoved: (id) => { removedFromPlayer.push(id); },
      emit: () => { emits++; },
      autoDownloadLiked: () => true,
      enqueueDownloads: async (ids) => { enqueued.push(ids); },
    });
    await listens.log(db, 'gone', 5, 1);
    await expect(sync(payload)).rejects.toThrow('disk I/O');
    expect(forgotten).toEqual([['gone']]);
    expect(removedFromPlayer).toEqual(['gone']);
    expect(emits).toBe(1);
  });

  it('runAppSync uses the app database, the download manager, the player and library events', async () => {
    mockDb = db;
    await addSong(db, { youtubeId: 'gone', title: 'gone', channel: null, durationSec: 1, thumbnailUrl: 'x' });
    const onEmit = jest.fn();
    const unsub = libraryEvents.subscribe(onEmit);
    const f = fakeFetch(200, {
      serverTime: 5000,
      songs: [ssong('n1')],
      playlists: [{ id: 'liked', name: 'Liked', kind: 'liked', updatedAt: 9, songs: ['n1'] }],
      summary,
    });
    const orig = globalThis.fetch;
    globalThis.fetch = f;
    try {
      const out = await runAppSync(payload);
      expect(out.newSongs.map((s) => s.youtubeId)).toEqual(['n1']);
    } finally {
      globalThis.fetch = orig;
      unsub();
    }
    expect(mockForgetSongs).toHaveBeenCalledWith(['gone']);
    expect(mockOnSongRemoved).toHaveBeenCalledWith('gone');
    expect(onEmit).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(['n1']);
  });

  const likedRes = (): SyncResponse => ({
    serverTime: 5000,
    songs: [ssong('mine'), ssong('webLiked'), ssong('other')],
    playlists: [{ id: 'liked', name: 'Liked', kind: 'liked', updatedAt: 9, songs: ['webLiked', 'mine'] }],
    summary,
  });

  it('after a successful sync, queues every Liked song for download when auto-download of liked songs is on', async () => {
    await mk(fakeFetch(200, likedRes()))(payload);
    expect(enqueued).toEqual([['webLiked', 'mine']]);
  });

  it('does not queue Liked songs when auto-download of liked songs is off', async () => {
    autoDownloadLiked = false;
    await mk(fakeFetch(200, likedRes()))(payload);
    expect(enqueued).toEqual([]);
  });

  it('does not queue anything when the sync fails', async () => {
    await expect(mk(fakeFetch(401, {}))(payload)).rejects.toMatchObject({ kind: 'expired' });
    expect(enqueued).toEqual([]);
  });

  it('a failing enqueue does not fail the sync', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const sync = createAppSync({
      getDb: async () => db,
      fetch: fakeFetch(200, likedRes()),
      forgetSongs: async () => {},
      onSongRemoved: () => {},
      emit: () => {},
      autoDownloadLiked: () => true,
      enqueueDownloads: async () => { throw new Error('boom'); },
    });
    await expect(sync(payload)).resolves.toMatchObject({ summary });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
