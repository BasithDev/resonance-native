// The default `downloads` instance wires native modules; each test builds its own manager with fakes.
jest.mock('../../modules/ytdlp/src/YtdlpModule', () => ({ __esModule: true, default: {} }));
jest.mock('expo-file-system', () => ({}));
jest.mock('../player/store', () => ({ usePlayer: { getState: () => ({}) } }));
jest.mock('../net/connectivity', () => ({ getConnectivity: () => ({ online: true, wifi: true }), subscribeConnectivity: () => () => {} }));
jest.mock('../db/instance', () => ({ getDb: jest.fn() }));
jest.mock('../settings/store', () => ({ useSettings: { getState: () => ({}), subscribe: () => () => {} }, settingsReady: () => Promise.resolve() }));

import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import { addSong, getSong, migrate, removeSong, setDownload } from '../library/repo';
import type { Song } from '../library/types';
import type { Connectivity } from '../net/connectivity';
import { YoutubeError } from '../youtube/client';
import { createDownloadManager, type DownloadFs } from './manager';

type Job = { jobId: string; youtubeId: string; resolve: () => void; reject: (e: unknown) => void };

async function waitFor(cond: () => boolean | Promise<boolean>, what = 'condition') {
  for (let i = 0; i < 200; i++) {
    if (await cond()) return;
    await new Promise((r) => setImmediate(r));
  }
  throw new Error(`timed out waiting for ${what}`);
}

type Timer = { cb: () => void; ms: number; cancelled: boolean };

async function setup(opts: { connectivity?: Connectivity; cellular?: boolean; autoLiked?: boolean } = {}) {
  const raw: Db = createTestDb();
  await migrate(raw);
  // Hooks to hit narrow windows: run something right after a queued-songs query, or fail a write.
  let afterQueuedList: (() => Promise<void>) | null = null;
  let failWrite: ((sql: string, p: unknown[]) => boolean) | null = null;
  const db: Db = {
    ...raw,
    async all<T>(sql: string, p: unknown[] = []) {
      const rows = await raw.all<T>(sql, p);
      if (afterQueuedList && sql.includes('download IN') && p[0] === 'queued') {
        const cb = afterQueuedList;
        afterQueuedList = null;
        await cb();
      }
      return rows;
    },
    async run(sql: string, p: unknown[] = []) {
      if (failWrite?.(sql, p)) {
        failWrite = null;
        throw new Error('disk I/O error');
      }
      return raw.run(sql, p);
    },
  };
  const timers: Timer[] = [];

  // Fake app storage: paths relative to /docs.
  const files = new Set<string>();
  const removeMatching = (dir: string, id: string) => {
    for (const f of [...files]) if (f.startsWith(`${dir}/${id}.`)) files.delete(f);
  };
  const order: string[] = [];
  const fs: DownloadFs = {
    ensureDirs: jest.fn(),
    audioDir: () => '/docs/audio',
    deleteAudio: jest.fn((id: string) => removeMatching('audio', id)),
    deleteArt: jest.fn((id: string) => removeMatching('art', id)),
    downloadArt: jest.fn(async (_url: string, id: string) => {
      order.push(`art:${id}`);
      files.add(`art/${id}.jpg`);
      return `/docs/art/${id}.jpg`;
    }),
  };

  // Fake yt-dlp: each download stays pending until the test settles it.
  const jobs: Job[] = [];
  let progressCb: ((e: { jobId: string; percent: number; etaSec: number }) => void) | null = null;
  let cancelIsLost = false;
  const yt = {
    download: jest.fn((jobId: string, youtubeId: string, destDir: string) => {
      expect(destDir).toBe('/docs/audio');
      files.add(`audio/${youtubeId}.webm.part`);
      return new Promise<{ path: string; sizeBytes: number }>((res, rej) => {
        jobs.push({
          jobId,
          youtubeId,
          resolve: () => {
            files.delete(`audio/${youtubeId}.webm.part`);
            files.add(`audio/${youtubeId}.webm`);
            order.push(`audio:${youtubeId}`);
            res({ path: `/docs/audio/${youtubeId}.webm`, sizeBytes: 3_100_000 });
          },
          reject: (e) => {
            removeMatching('audio', youtubeId); // the native failure cleanup
            rej(e);
          },
        });
      });
    }),
    cancel: jest.fn((jobId: string) => {
      if (cancelIsLost) return;
      jobs.find((j) => j.jobId === jobId)?.reject(new YoutubeError('cancelled'));
    }),
    addProgressListener: jest.fn((cb: typeof progressCb) => {
      progressCb = cb;
      return { remove: jest.fn() };
    }),
  };

  let conn: Connectivity = opts.connectivity ?? { online: true, wifi: true };
  const connSubs = new Set<() => void>();
  const settingsState = { downloadOnCellular: opts.cellular ?? false, autoDownloadLiked: opts.autoLiked ?? true };
  const player = { onSongRemoved: jest.fn(), onSongUpdated: jest.fn() };
  const emit = jest.fn();

  let clock = 1_000;
  const m = createDownloadManager({
    getDb: async () => db,
    yt,
    fs,
    connectivity: {
      get: () => conn,
      subscribe: (cb) => {
        connSubs.add(cb);
        return () => connSubs.delete(cb);
      },
    },
    settings: { get: () => settingsState, subscribe: () => () => {}, ready: async () => {} },
    player,
    emit,
    now: () => ++clock,
    schedule: (cb, ms) => {
      const t: Timer = { cb, ms, cancelled: false };
      timers.push(t);
      return () => {
        t.cancelled = true;
      };
    },
  });

  const add = async (id: string) =>
    addSong(db, { youtubeId: id, title: `Title ${id}`, channel: 'Chan', durationSec: 100, thumbnailUrl: `https://img/${id}.jpg` });
  const state = async (id: string) => (await getSong(db, id))?.download;
  const active = (id: string) => jobs.filter((j) => j.youtubeId === id).at(-1)!;
  const setConnectivity = (c: Connectivity) => {
    conn = c;
    connSubs.forEach((cb) => cb());
  };

  return {
    db, m, fs, yt, jobs, files, order, player, emit, add, state, active, setConnectivity,
    progress: (jobId: string, percent: number) => progressCb?.({ jobId, percent, etaSec: 1 }),
    loseCancels: () => {
      cancelIsLost = true;
    },
    timers,
    pendingTimers: () => timers.filter((x) => !x.cancelled),
    fireTimers: () => {
      for (const x of timers.filter((y) => !y.cancelled)) {
        x.cancelled = true;
        x.cb();
      }
    },
    onNextQueuedList: (cb: () => Promise<void>) => {
      afterQueuedList = cb;
    },
    failNextWrite: (match: (sql: string, p: unknown[]) => boolean) => {
      failWrite = match;
    },
  };
}

describe('download manager', () => {
  it('downloads audio then artwork and marks done with sizeBytes', async () => {
    const t = await setup();
    await t.add('a');
    await t.m.enqueue(['a']);
    await waitFor(() => t.jobs.length === 1, 'download start');
    expect(await t.state('a')).toBe('downloading');

    t.progress(t.jobs[0].jobId, 42);
    expect(t.m.store.getState().active).toEqual({ youtubeId: 'a', percent: 42 });

    t.jobs[0].resolve();
    await waitFor(async () => (await t.state('a')) === 'done', 'done');

    expect(t.order).toEqual(['audio:a', 'art:a']);
    expect(t.fs.downloadArt).toHaveBeenCalledWith('https://img/a.jpg', 'a');
    expect(await getSong(t.db, 'a')).toMatchObject({
      download: 'done',
      filePath: '/docs/audio/a.webm',
      artPath: '/docs/art/a.jpg',
      sizeBytes: 3_100_000,
      downloadError: null,
    });
    expect(t.player.onSongUpdated).toHaveBeenLastCalledWith(expect.objectContaining({ youtubeId: 'a', download: 'done' }));
    expect(t.emit).toHaveBeenCalled();
    await waitFor(() => t.m.store.getState().active === null, 'idle');
    expect(t.m.store.getState()).toMatchObject({ queuedCount: 0, paused: false });
  });

  it('one failing song is marked failed with the update message and the next song still downloads', async () => {
    const t = await setup();
    await t.add('a');
    await t.add('b');
    await t.m.enqueue(['a', 'b']);
    await waitFor(() => t.jobs.length === 1, 'first download');
    expect(t.m.store.getState().queuedCount).toBe(1);

    t.jobs[0].reject(new YoutubeError('extraction', new Error('HTTP Error 403')));
    await waitFor(() => t.jobs.length === 2, 'second download');
    expect(t.jobs[1].youtubeId).toBe('b');
    t.jobs[1].resolve();
    await waitFor(async () => (await t.state('b')) === 'done', 'b done');

    expect(await getSong(t.db, 'a')).toMatchObject({
      download: 'failed',
      downloadError: 'YouTube changed something — update yt-dlp in Settings',
      filePath: null,
    });
  });

  it('onStartup resets interrupted downloads to queued and deletes partial files', async () => {
    const t = await setup({ connectivity: { online: false, wifi: false } });
    await t.add('a');
    await t.add('b');
    await setDownload(t.db, 'a', { download: 'downloading' });
    await setDownload(t.db, 'b', { download: 'done', filePath: '/docs/audio/b.webm', artPath: '/docs/art/b.jpg' });
    t.files.add('audio/a.webm.part');
    t.files.add('audio/b.webm');
    t.files.add('art/b.jpg');

    await t.m.onStartup();

    expect(await t.state('a')).toBe('queued');
    expect(await t.state('b')).toBe('done');
    expect([...t.files].sort()).toEqual(['art/b.jpg', 'audio/b.webm']);
    expect(t.fs.ensureDirs).toHaveBeenCalled();
    expect(t.yt.download).not.toHaveBeenCalled(); // offline: it waits
    expect(t.m.store.getState()).toMatchObject({ queuedCount: 1, paused: true });

    t.setConnectivity({ online: true, wifi: true });
    await waitFor(() => t.jobs.length === 1, 'resumed download');
    expect(t.jobs[0].youtubeId).toBe('a');
  });

  it('removeSongCompletely during an active download cancels the job and deletes both files', async () => {
    const t = await setup();
    await t.add('a');
    t.files.add('art/a.jpg'); // left from an earlier attempt
    await t.m.enqueue(['a']);
    await waitFor(() => t.jobs.length === 1, 'download start');
    const { jobId } = t.jobs[0];

    await t.m.removeSongCompletely('a');

    expect(t.yt.cancel).toHaveBeenCalledWith(jobId);
    expect(t.files.size).toBe(0);
    expect(await getSong(t.db, 'a')).toBeNull();
    expect(t.player.onSongRemoved).toHaveBeenCalledWith('a');
    expect(t.emit).toHaveBeenCalled();
    await waitFor(() => t.m.store.getState().active === null, 'idle');
    expect(await getSong(t.db, 'a')).toBeNull();
    expect(t.fs.downloadArt).not.toHaveBeenCalled();
  });

  it('forgetSongs (rows already removed by a sync) cancels the download and deletes files without per-song events', async () => {
    const t = await setup();
    await t.add('a');
    await t.add('b');
    t.files.add('audio/b.webm');
    t.files.add('art/b.jpg');
    await t.m.enqueue(['a']);
    await waitFor(() => t.jobs.length === 1, 'download start');
    const { jobId } = t.jobs[0];
    await removeSong(t.db, 'a');
    await removeSong(t.db, 'b');
    t.emit.mockClear();
    t.player.onSongUpdated.mockClear();

    await t.m.forgetSongs(['a', 'b']);

    expect(t.yt.cancel).toHaveBeenCalledWith(jobId);
    expect(t.files.size).toBe(0);
    expect(t.emit).not.toHaveBeenCalled();
    expect(t.player.onSongRemoved).not.toHaveBeenCalled();
    expect(t.player.onSongUpdated).not.toHaveBeenCalled();
    await waitFor(() => t.m.store.getState().active === null, 'idle');
    expect(t.files.size).toBe(0);
  });

  it('a download that finishes after its cancel was lost is discarded', async () => {
    const t = await setup();
    await t.add('a');
    await t.m.enqueue(['a']);
    await waitFor(() => t.jobs.length === 1, 'download start');
    t.loseCancels();

    await t.m.removeSongCompletely('a');
    t.jobs[0].resolve(); // yt-dlp never saw the cancel and wrote the whole file
    await waitFor(() => t.m.store.getState().active === null, 'idle');

    expect(t.files.size).toBe(0);
    expect(await getSong(t.db, 'a')).toBeNull();
  });

  it('pauses when connectivity becomes disallowed and resumes when allowed', async () => {
    const t = await setup();
    await t.add('a');
    await t.m.enqueue(['a']);
    await waitFor(() => t.jobs.length === 1, 'download start');
    const first = t.jobs[0].jobId;

    t.setConnectivity({ online: true, wifi: false }); // mobile data, not allowed by default
    await waitFor(async () => (await t.state('a')) === 'queued', 'requeued');
    expect(t.yt.cancel).toHaveBeenCalledWith(first);
    await waitFor(() => t.m.store.getState().active === null, 'stopped');
    expect(t.m.store.getState()).toMatchObject({ paused: true, queuedCount: 1 });
    expect(t.files.size).toBe(0);

    t.setConnectivity({ online: true, wifi: true });
    await waitFor(() => t.jobs.length === 2, 'restarted');
    expect(t.jobs[1].jobId).not.toBe(first);
    expect(t.m.store.getState().paused).toBe(false);
    t.jobs[1].resolve();
    await waitFor(async () => (await t.state('a')) === 'done', 'done');
  });

  it('downloads on mobile data when the setting allows it', async () => {
    const t = await setup({ connectivity: { online: true, wifi: false }, cellular: true });
    await t.add('a');
    await t.m.enqueue(['a']);
    await waitFor(() => t.jobs.length === 1, 'download start');
  });

  it('cancel stops the active download and returns the song to not downloaded', async () => {
    const t = await setup();
    await t.add('a');
    await t.m.enqueue(['a']);
    await waitFor(() => t.jobs.length === 1, 'download start');

    await t.m.cancel('a');
    await waitFor(() => t.m.store.getState().active === null, 'stopped');

    expect(await getSong(t.db, 'a')).toMatchObject({ download: 'none', downloadError: null });
    expect(t.files.size).toBe(0);
  });

  it('user pause stops the queue until resume', async () => {
    const t = await setup();
    await t.add('a');
    await t.m.enqueue(['a']);
    await waitFor(() => t.jobs.length === 1, 'download start');

    t.m.pause();
    await waitFor(async () => (await t.state('a')) === 'queued', 'requeued');
    expect(t.m.store.getState()).toMatchObject({ paused: true, pauseReason: 'user' });

    t.m.resume();
    await waitFor(() => t.jobs.length === 2, 'restarted');
  });

  it('never re-downloads a song that is already done', async () => {
    const t = await setup();
    await t.add('a');
    await setDownload(t.db, 'a', { download: 'done', filePath: '/docs/audio/a.webm' });
    await t.m.enqueue(['a']);
    await new Promise((r) => setImmediate(r));
    expect(t.yt.download).not.toHaveBeenCalled();
    expect(await t.state('a')).toBe('done');
  });

  it('removeDownload deletes the files but keeps the song', async () => {
    const t = await setup();
    await t.add('a');
    await setDownload(t.db, 'a', { download: 'done', filePath: '/docs/audio/a.webm', artPath: '/docs/art/a.jpg', sizeBytes: 5 });
    t.files.add('audio/a.webm');
    t.files.add('art/a.jpg');

    await t.m.removeDownload('a');

    expect(t.files.size).toBe(0);
    const s = (await getSong(t.db, 'a')) as Song;
    expect(s).toMatchObject({ download: 'none', filePath: null, artPath: null, sizeBytes: null });
    expect(t.player.onSongUpdated).toHaveBeenCalledWith(expect.objectContaining({ youtubeId: 'a', download: 'none' }));
  });

  it('clearAll removes every download, queued ones included, and keeps the songs', async () => {
    const t = await setup();
    for (const id of ['a', 'b', 'c', 'd']) await t.add(id);
    await setDownload(t.db, 'a', { download: 'done', filePath: '/docs/audio/a.webm', artPath: null, sizeBytes: 5 });
    await setDownload(t.db, 'b', { download: 'failed', downloadError: 'x' });
    await setDownload(t.db, 'c', { download: 'queued' });
    t.files.add('audio/a.webm');

    await t.m.clearAll();

    expect(t.files.size).toBe(0);
    for (const id of ['a', 'b', 'c', 'd']) expect(await t.state(id)).toBe('none');
    expect(await getSong(t.db, 'a')).not.toBeNull();
  });

  it('onLiked enqueues only when autoDownloadLiked is on', async () => {
    const on = await setup();
    await on.add('a');
    await on.m.onLiked('a');
    await waitFor(() => on.jobs.length === 1, 'download start');

    const off = await setup({ autoLiked: false });
    await off.add('a');
    await off.m.onLiked('a');
    expect(await off.state('a')).toBe('none');
  });

  describe('network trouble while Wi-Fi still looks fine', () => {
    const NET = 'Network error — check your connection';
    const ticks = async (n = 20) => {
      for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
    };

    it('a network error requeues the song and does not start the next song right away', async () => {
      const t = await setup();
      await t.add('a');
      await t.add('b');
      await t.m.enqueue(['a', 'b']);
      await waitFor(() => t.jobs.length === 1, 'first download');

      t.jobs[0].reject(new YoutubeError('network'));
      await waitFor(async () => (await t.state('a')) === 'queued', 'requeued');
      await ticks();

      expect(t.jobs).toHaveLength(1);
      expect(await t.state('b')).toBe('queued');
      expect(t.m.store.getState()).toMatchObject({ active: null, paused: true, pauseReason: 'network' });
      expect(t.pendingTimers().map((x) => x.ms)).toEqual([30_000]);
    });

    it('resumes on the next connectivity change, cancelling the timer', async () => {
      const t = await setup();
      await t.add('a');
      await t.m.enqueue(['a']);
      await waitFor(() => t.jobs.length === 1, 'first download');
      t.jobs[0].reject(new YoutubeError('network'));
      await waitFor(() => t.m.store.getState().pauseReason === 'network', 'backoff');

      t.setConnectivity({ online: true, wifi: true });
      await waitFor(() => t.jobs.length === 2, 'retry');
      expect(t.jobs[1].youtubeId).toBe('a');
      expect(t.pendingTimers()).toHaveLength(0);
      expect(t.m.store.getState().pauseReason).toBeNull();
    });

    it('resumes when the backoff timer fires, backing off longer each time', async () => {
      const t = await setup();
      await t.add('a');
      await t.m.enqueue(['a']);
      await waitFor(() => t.jobs.length === 1, 'first download');
      t.jobs[0].reject(new YoutubeError('network'));
      await waitFor(() => t.pendingTimers().length === 1, 'backoff');

      t.fireTimers();
      await waitFor(() => t.jobs.length === 2, 'retry');
      t.jobs[1].reject(new YoutubeError('network'));
      await waitFor(() => t.pendingTimers().length === 1, 'second backoff');

      expect(t.timers.map((x) => x.ms)).toEqual([30_000, 120_000]);
    });

    it('after 3 network failures in a row the song is failed', async () => {
      const t = await setup();
      await t.add('a');
      await t.m.enqueue(['a']);
      for (let i = 0; i < 3; i++) {
        await waitFor(() => t.jobs.length === i + 1, `attempt ${i + 1}`);
        t.jobs[i].reject(new YoutubeError('network'));
        await waitFor(() => t.pendingTimers().length === 1, `backoff ${i + 1}`);
        if (i < 2) {
          expect(await t.state('a')).toBe('queued');
          t.fireTimers();
        }
      }
      expect(await getSong(t.db, 'a')).toMatchObject({ download: 'failed', downloadError: NET });
      expect(t.timers.map((x) => x.ms)).toEqual([30_000, 120_000, 600_000]);
    });

    it('a success resets the failure count', async () => {
      const t = await setup();
      await t.add('a');
      await t.m.enqueue(['a']);
      for (let i = 0; i < 2; i++) {
        await waitFor(() => t.jobs.length === i + 1, `attempt ${i + 1}`);
        t.jobs[i].reject(new YoutubeError('network'));
        await waitFor(() => t.pendingTimers().length === 1, `backoff ${i + 1}`);
        t.fireTimers();
      }
      await waitFor(() => t.jobs.length === 3, 'third attempt');
      t.jobs[2].resolve();
      await waitFor(async () => (await t.state('a')) === 'done', 'done');

      await t.add('b');
      await t.m.enqueue(['b']);
      await waitFor(() => t.jobs.length === 4, 'b starts');
      t.jobs[3].reject(new YoutubeError('network'));
      await waitFor(() => t.pendingTimers().length === 1, 'backoff');
      expect(await t.state('b')).toBe('queued');
      expect(t.timers.at(-1)!.ms).toBe(30_000);
    });
  });

  it('a download started before onStartup is not reset by it', async () => {
    const t = await setup();
    await t.add('a');
    await t.m.enqueue(['a']);
    await waitFor(() => t.jobs.length === 1, 'download start');

    await t.m.onStartup();

    expect(await t.state('a')).toBe('downloading');
    expect(t.files.has('audio/a.webm.part')).toBe(true);
  });

  it('a cancel just before the next song starts is not overwritten', async () => {
    const t = await setup({ connectivity: { online: false, wifi: false } });
    await t.add('a');
    await setDownload(t.db, 'a', { download: 'queued' });
    await t.m.onStartup();
    t.onNextQueuedList(() => t.m.cancel('a'));

    t.setConnectivity({ online: true, wifi: true });
    await waitFor(() => t.m.store.getState().pauseReason === null, 'allowed');
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));

    expect(t.yt.download).not.toHaveBeenCalled();
    expect(await t.state('a')).toBe('none');
  });

  it('the queue keeps going when recording a failure hits a database error', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await setup();
    await t.add('a');
    await t.m.enqueue(['a']);
    await waitFor(() => t.jobs.length === 1, 'download start');
    t.failNextWrite((sql, p) => sql.startsWith('UPDATE songs') && p[0] === 'failed');

    t.jobs[0].reject(new YoutubeError('extraction'));
    await waitFor(() => t.jobs.length === 2, 'retried');
    t.jobs[1].reject(new YoutubeError('extraction'));
    await waitFor(async () => (await t.state('a')) === 'failed', 'failed');
    await waitFor(() => t.m.store.getState().active === null, 'idle');
    expect(warn).toHaveBeenCalledWith('[downloads] could not record a failed download', expect.any(Error));
    warn.mockRestore();
  });
});
