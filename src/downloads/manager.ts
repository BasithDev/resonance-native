/**
 * The download queue: puts songs on the phone, one at a time.
 *
 * - The queue is the library itself: songs whose `download` is 'queued', oldest first,
 *   so it survives the app being killed. `onStartup` puts interrupted downloads back.
 * - Downloads run only when `canDownloadNow` allows (Wi-Fi unless mobile data is allowed)
 *   and the user hasn't paused; losing that stops the active job and re-queues it.
 * - One failing song is marked 'failed' with the error's message and the queue moves on.
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
};

export type PauseReason = 'user' | 'offline' | 'cellular';

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
  const store = create<DownloadsState>()(() => ({ active: null, queuedCount: 0, paused: false, pauseReason: null }));

  let job: Job | null = null;
  let userPaused = false;
  let pumping = false;
  let again = false;
  let started = false;
  let startup: Promise<void> | null = null;

  function pauseReason(): PauseReason | null {
    if (userPaused) return 'user';
    const c = deps.connectivity.get();
    if (!c.online) return 'offline';
    return canDownloadNow({ ...c, cellularAllowed: deps.settings.get().downloadOnCellular }) ? null : 'cellular';
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
    if (pauseReason() !== null) stopActive('pause');
    else kick();
    void refresh();
  }

  function ensureStarted() {
    if (started) return;
    started = true;
    deps.connectivity.subscribe(onConditionsChanged);
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

  async function pump() {
    try {
      do {
        again = false;
        while (pauseReason() === null) {
          const [next] = await listByDownload(await deps.getDb(), ['queued']);
          if (!next) break;
          await run(next);
        }
      } while (again);
    } catch (e) {
      console.warn('[downloads] queue stopped', e);
    } finally {
      pumping = false;
    }
  }

  async function run(song: Song) {
    const db = await deps.getDb();
    const id = song.youtubeId;
    const current: Job = { youtubeId: id, jobId: `${id}:${now()}`, stop: null };
    job = current;
    store.setState({ active: { youtubeId: id, percent: 0 } });
    try {
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
      await changed(db, [id]);
    } catch (e) {
      await failed(db, current, e);
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
    } else if (current.stop === 'pause' || (e instanceof YoutubeError && e.kind === 'network' && pauseReason() !== null)) {
      // Paused, or the connection dropped mid-download: it waits for the next chance.
      await setDownload(db, id, { download: 'queued', downloadError: null });
    } else {
      const message = e instanceof Error ? e.message : 'Download failed';
      await setDownload(db, id, { download: 'failed', downloadError: message });
    }
    await changed(db, [id]);
  }

  const api = {
    store,

    /** Queues songs that aren't on the phone yet (also retries failed ones). */
    async enqueue(youtubeIds: string[]) {
      ensureStarted();
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

    /** Removes the song from the library: cancels its download and deletes its files. */
    async removeSongCompletely(youtubeId: string) {
      if (job?.youtubeId === youtubeId) stopActive('remove');
      deleteFiles(youtubeId);
      await removeSong(await deps.getDb(), youtubeId);
      deps.player.onSongRemoved(youtubeId);
      deps.emit();
      await refresh();
    },

    /** Stops the active download (it goes back to the queue) until `resume`. */
    pause() {
      userPaused = true;
      stopActive('pause');
      void refresh();
    },

    resume() {
      userPaused = false;
      void refresh();
      kick();
    },

    /** Once per launch: interrupted downloads go back to the queue without their partial files. */
    onStartup(): Promise<void> {
      startup ??= (async () => {
        ensureStarted();
        const db = await deps.getDb();
        const interrupted = await resetInterruptedDownloads(db);
        interrupted.forEach((s) => deleteFiles(s.youtubeId));
        if (interrupted.length > 0) await changed(db, interrupted.map((s) => s.youtubeId));
        api.resume();
      })().catch((e) => {
        startup = null;
        console.warn('[downloads] startup failed', e);
      });
      return startup;
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
