/**
 * The download queue: puts songs on the phone, one at a time.
 *
 * - The queue is the library itself: songs whose `download` is 'queued', oldest first,
 *   so it survives the app being killed. `onStartup` puts interrupted downloads back.
 * - Downloads run only when `canDownloadNow` allows (Wi-Fi unless mobile data is allowed)
 *   and the user hasn't paused; losing that stops the active job and re-queues it.
 * - One failing song is marked 'failed' with the error's message and the queue moves on.
 * - A network error while the connection still looks usable (weak Wi-Fi, captive portal)
 *   puts the song back and backs off (30 s, 2 min, then 10 min) until the timer fires or
 *   connectivity changes, so one bad connection can't fail the whole queue. The third
 *   network failure in a row for the same song marks it 'failed'.
 * - A song is never downloaded again once 'done': yt-dlp's failure cleanup deletes every
 *   `<id>.*`, which would take the finished file with it.
 */
import { create } from 'zustand';

import { getDb } from '../db/instance';
import type { Db } from '../db/types';
import { libraryEvents } from '../library/events';
import { getSong, listByDownload, removeSong, resetInterruptedDownloads, setDownload } from '../library/repo';
import type { Song } from '../library/types';
import { getConnectivity, subscribeConnectivity, type Connectivity } from '../net/connectivity';
import { usePlayer } from '../player/store';
import { settingsReady, useSettings } from '../settings/store';
import * as youtube from '../youtube/client';
import { YoutubeError, type ProgressEvent } from '../youtube/client';
import { expoDownloadFs } from './files';
import { canDownloadNow } from './rules';

export type DownloadFs = {
  ensureDirs(): void;
  /** Bare absolute path yt-dlp downloads into. */
  audioDir(): string;
  /** Deletes every audio file for the song, partial or complete. */
  deleteAudio(youtubeId: string): void;
  deleteArt(youtubeId: string): void;
  /** Saves the artwork; resolves with its bare absolute path. */
  downloadArt(url: string, youtubeId: string): Promise<string>;
};

export type DownloadManagerDeps = {
  getDb: () => Promise<Db>;
  yt: {
    download(jobId: string, youtubeId: string, destDir: string): Promise<{ path: string; sizeBytes: number }>;
    cancel(jobId: string): void;
    addProgressListener(cb: (e: ProgressEvent) => void): unknown;
  };
  fs: DownloadFs;
  connectivity: { get(): Connectivity; subscribe(cb: () => void): unknown };
  settings: {
    get(): { downloadOnCellular: boolean; autoDownloadLiked: boolean };
    subscribe(cb: () => void): unknown;
    ready(): Promise<void>;
  };
  player: { onSongRemoved(youtubeId: string): void; onSongUpdated(song: Song): void };
  emit(): void;
  now?: () => number;
  /** Runs `cb` after `ms`; returns a canceller. Defaults to setTimeout. */
  schedule?: (cb: () => void, ms: number) => () => void;
};

/** 'network': backing off after a network error; retries soon by itself. */
export type PauseReason = 'user' | 'offline' | 'cellular' | 'network';

export const NETWORK_BACKOFF_MS = [30_000, 120_000, 600_000] as const;
/** Network failures in a row after which a song is marked 'failed'. */
export const MAX_NETWORK_FAILURES = 3;

export type DownloadsState = {
  active: { youtubeId: string; percent: number } | null;
  /** Songs waiting, not counting the active one. */
  queuedCount: number;
  paused: boolean;
  pauseReason: PauseReason | null;
};

/** Why the active job was stopped: cancelled by the user, song removed, or paused. */
type StopReason = 'cancel' | 'remove' | 'pause';
type Job = { youtubeId: string; jobId: string; stop: StopReason | null };

export function createDownloadManager(deps: DownloadManagerDeps) {
  const now = deps.now ?? Date.now;
  const schedule =
    deps.schedule ??
    ((cb: () => void, ms: number) => {
      const t = setTimeout(cb, ms);
      return () => clearTimeout(t);
    });
  const store = create<DownloadsState>()(() => ({ active: null, queuedCount: 0, paused: false, pauseReason: null }));

  let job: Job | null = null;
  let userPaused = false;
  let pumping = false;
  let again = false;
  let started = false;
  let prepared: Promise<void> | null = null;
  const networkFailures = new Map<string, number>(); // in a row, per song
  let backoffLevel = 0; // network backoffs in a row (any song)
  let cancelBackoff: (() => void) | null = null; // set while backing off
  let cancelRetry: (() => void) | null = null; // set after the queue stopped on an error

  function pauseReason(): PauseReason | null {
    if (userPaused) return 'user';
    const c = deps.connectivity.get();
    if (!c.online) return 'offline';
    if (!canDownloadNow({ ...c, cellularAllowed: deps.settings.get().downloadOnCellular })) return 'cellular';
    return cancelBackoff ? 'network' : null;
  }

  function endBackoff() {
    cancelBackoff?.();
    cancelBackoff = null;
  }

  function startBackoff() {
    endBackoff();
    const ms = NETWORK_BACKOFF_MS[Math.min(backoffLevel, NETWORK_BACKOFF_MS.length - 1)];
    backoffLevel++;
    cancelBackoff = schedule(() => {
      cancelBackoff = null;
      void refresh();
      kick();
    }, ms);
  }

  async function refresh() {
    try {
      const queued = await listByDownload(await deps.getDb(), ['queued']);
      const reason = pauseReason();
      store.setState({ queuedCount: queued.length, pauseReason: reason, paused: reason !== null });
    } catch {
      // the next change refreshes again
    }
  }

  /** After every download state change: tell the player and the screens. */
  async function changed(db: Db, ids: string[]) {
    for (const id of ids) {
      const s = await getSong(db, id);
      if (s) deps.player.onSongUpdated(s);
    }
    deps.emit();
    await refresh();
  }

  function deleteFiles(id: string) {
    try {
      deps.fs.deleteAudio(id);
      deps.fs.deleteArt(id);
    } catch {
      // nothing to delete
    }
  }

  function stopActive(reason: StopReason) {
    if (!job || job.stop) return;
    job.stop = reason;
    deps.yt.cancel(job.jobId);
  }

  function onConditionsChanged() {
    const reason = pauseReason();
    if (reason !== null && reason !== 'network') stopActive('pause');
    if (reason === null) kick();
    void refresh();
  }

  /** Any connectivity event may mean the connection recovered: retry now. */
  function onConnectivityChanged() {
    endBackoff();
    onConditionsChanged();
  }

  function ensureStarted() {
    if (started) return;
    started = true;
    deps.connectivity.subscribe(onConnectivityChanged);
    deps.settings.subscribe(onConditionsChanged);
    deps.yt.addProgressListener((e) => {
      if (job && !job.stop && e.jobId === job.jobId) {
        store.setState({ active: { youtubeId: job.youtubeId, percent: e.percent } });
      }
    });
    try {
      deps.fs.ensureDirs();
    } catch {
      // the download itself reports the problem
    }
  }

  function kick() {
    ensureStarted();
    if (pumping) {
      again = true;
      return;
    }
    pumping = true;
    void pump();
  }

  /**
   * Once, before the first download: interrupted downloads go back to the queue without
   * their partial files. Every download waits for it, so it can never reset a live one.
   */
  function prepare(): Promise<void> {
    prepared ??= (async () => {
      ensureStarted();
      const db = await deps.getDb();
      const interrupted = await resetInterruptedDownloads(db);
      interrupted.forEach((s) => deleteFiles(s.youtubeId));
      if (interrupted.length > 0) await changed(db, interrupted.map((s) => s.youtubeId));
    })().catch((e) => {
      prepared = null;
      throw e;
    });
    return prepared;
  }

  async function pump() {
    cancelRetry?.();
    cancelRetry = null;
    try {
      await prepare();
      do {
        again = false;
        while (pauseReason() === null) {
          const [next] = await listByDownload(await deps.getDb(), ['queued']);
          if (!next) break;
          await run(next);
        }
      } while (again);
    } catch (e) {
      console.warn('[downloads] queue stopped; retrying soon', e);
      cancelRetry = schedule(() => {
        cancelRetry = null;
        kick();
      }, NETWORK_BACKOFF_MS[0]);
    } finally {
      pumping = false;
    }
  }

  async function run(song: Song) {
    const id = song.youtubeId;
    // Set before any await, so a cancel from now on reaches this job.
    const current: Job = { youtubeId: id, jobId: `${id}:${now()}`, stop: null };
    job = current;
    store.setState({ active: { youtubeId: id, percent: 0 } });
    let db: Db | null = null;
    try {
      db = await deps.getDb();
      // A cancel/remove may have landed after the queue was read, before `job` was set.
      if ((await getSong(db, id))?.download !== 'queued') return;
      await setDownload(db, id, { download: 'downloading', downloadError: null });
      await changed(db, [id]);
      if (current.stop) throw new YoutubeError('cancelled');

      const audio = await deps.yt.download(current.jobId, id, deps.fs.audioDir());
      let artPath: string | null = null;
      const discard = current.stop === 'cancel' || current.stop === 'remove';
      if (!discard && song.thumbnailUrl) {
        artPath = await deps.fs.downloadArt(song.thumbnailUrl, id).catch(() => null); // artwork is optional
      }

      // A cancel can be lost before yt-dlp starts, so the file may be complete even
      // though the song was cancelled or removed meanwhile.
      const still = await getSong(db, id);
      if (!still || current.stop === 'remove') return deleteFiles(id);
      if (current.stop === 'cancel') {
        deleteFiles(id);
        await setDownload(db, id, { download: 'none', downloadError: null });
        return await changed(db, [id]);
      }
      // Finished (a 'pause' that came too late changes nothing: the file is complete).
      await setDownload(db, id, {
        download: 'done',
        filePath: audio.path,
        artPath,
        sizeBytes: audio.sizeBytes,
        downloadError: null,
      });
      networkFailures.delete(id);
      backoffLevel = 0;
      await changed(db, [id]);
    } catch (e) {
      try {
        await failed(await deps.getDb(), current, e);
      } catch (e2) {
        // Couldn't record the outcome: don't leave the row 'downloading'; it gets another go.
        console.warn('[downloads] could not record a failed download', e2);
        const requeued = db
          ? await setDownload(db, id, { download: 'queued' }).then(() => true, () => false)
          : false;
        // Writes fail but reads work (e.g. disk full): the row is still 'queued', so the
        // pump would pick it again at once. Back off instead of spinning.
        if (!requeued) {
          startBackoff();
          void refresh();
        }
      }
    } finally {
      job = null;
      store.setState({ active: null });
    }
  }

  async function failed(db: Db, current: Job, e: unknown) {
    const id = current.youtubeId;
    deleteFiles(id); // partial files; the song never reached 'done'
    const still = await getSong(db, id);
    if (!still || current.stop === 'remove') return; // whoever removed it updated the row
    if (current.stop === 'cancel') {
      await setDownload(db, id, { download: 'none', downloadError: null });
    } else if (current.stop === 'pause' || (isNetwork(e) && pauseReason() !== null)) {
      // Paused, or the connection visibly dropped: it waits for the next chance.
      await setDownload(db, id, { download: 'queued', downloadError: null });
    } else if (isNetwork(e)) {
      // The connection looks fine but isn't: back off instead of failing the whole queue.
      const n = (networkFailures.get(id) ?? 0) + 1;
      startBackoff();
      if (n >= MAX_NETWORK_FAILURES) {
        networkFailures.delete(id);
        await setDownload(db, id, { download: 'failed', downloadError: (e as Error).message });
      } else {
        networkFailures.set(id, n);
        await setDownload(db, id, { download: 'queued', downloadError: null });
      }
    } else {
      const message = e instanceof Error ? e.message : 'Download failed';
      await setDownload(db, id, { download: 'failed', downloadError: message });
    }
    await changed(db, [id]);
  }

  const isNetwork = (e: unknown) => e instanceof YoutubeError && e.kind === 'network';

  const api = {
    store,

    /** Queues songs that aren't on the phone yet (also retries failed ones). */
    async enqueue(youtubeIds: string[]) {
      ensureStarted();
      youtubeIds.forEach((id) => networkFailures.delete(id)); // a manual retry starts afresh
      const db = await deps.getDb();
      const queued: string[] = [];
      for (const id of youtubeIds) {
        const s = await getSong(db, id);
        if (s && (s.download === 'none' || s.download === 'failed')) {
          await setDownload(db, id, { download: 'queued', downloadError: null });
          queued.push(id);
        }
      }
      if (queued.length > 0) await changed(db, queued);
      kick();
    },

    /** Stops downloading the song (active or waiting); it stays in the library. */
    async cancel(youtubeId: string) {
      if (job?.youtubeId === youtubeId) return stopActive('cancel'); // run() resets the row
      const db = await deps.getDb();
      const s = await getSong(db, youtubeId);
      if (s?.download === 'queued' || s?.download === 'failed') {
        await setDownload(db, youtubeId, { download: 'none', downloadError: null });
        await changed(db, [youtubeId]);
      }
    },

    /** Deletes the song's files and keeps it in the library (it streams again). */
    async removeDownload(youtubeId: string) {
      if (job?.youtubeId === youtubeId) stopActive('remove');
      deleteFiles(youtubeId);
      const db = await deps.getDb();
      await setDownload(db, youtubeId, {
        download: 'none', filePath: null, artPath: null, sizeBytes: null, downloadError: null,
      });
      await changed(db, [youtubeId]);
    },

    /** Removes every download (done, queued, downloading or failed); the songs stay in the library. */
    async clearAll() {
      const db = await deps.getDb();
      const songs = await listByDownload(db, ['done', 'queued', 'downloading', 'failed']);
      for (const s of songs) await api.removeDownload(s.youtubeId);
    },

    /** Removes the song from the library: cancels its download and deletes its files. */
    async removeSongCompletely(youtubeId: string) {
      if (job?.youtubeId === youtubeId) stopActive('remove');
      deleteFiles(youtubeId);
      await removeSong(await deps.getDb(), youtubeId);
      deps.player.onSongRemoved(youtubeId);
      deps.emit();
      await refresh();
    },

    /**
     * For songs a sync already removed from the library: cancels their download and deletes
     * their files. No per-song player or library events — the caller emits once.
     */
    async forgetSongs(youtubeIds: string[]) {
      for (const id of youtubeIds) {
        if (job?.youtubeId === id) stopActive('remove');
        deleteFiles(id);
      }
      await refresh();
    },

    /** Stops the active download (it goes back to the queue) until `resume`. */
    pause() {
      userPaused = true;
      stopActive('pause');
      void refresh();
    },

    /** Lifts a user pause, and retries now after a network backoff. */
    resume() {
      userPaused = false;
      endBackoff();
      void refresh();
      kick();
    },

    /** Once per launch: interrupted downloads go back to the queue without their partial files. */
    async onStartup(): Promise<void> {
      try {
        await prepare();
      } catch (e) {
        console.warn('[downloads] startup failed', e);
      }
      api.resume();
    },

    /** Call after the user likes a song: queues it when auto-download of liked songs is on. */
    async onLiked(youtubeId: string) {
      await deps.settings.ready();
      if (deps.settings.get().autoDownloadLiked) await api.enqueue([youtubeId]);
    },
  };
  return api;
}

export type DownloadManager = ReturnType<typeof createDownloadManager>;

export const downloads = createDownloadManager({
  getDb,
  yt: youtube,
  fs: expoDownloadFs,
  connectivity: { get: getConnectivity, subscribe: subscribeConnectivity },
  settings: { get: () => useSettings.getState(), subscribe: (cb) => useSettings.subscribe(cb), ready: settingsReady },
  player: {
    onSongRemoved: (id) => usePlayer.getState().onSongRemoved(id),
    onSongUpdated: (s) => usePlayer.getState().onSongUpdated(s),
  },
  emit: () => libraryEvents.emit(),
});

export function useDownloads(): DownloadsState {
  return downloads.store();
}
