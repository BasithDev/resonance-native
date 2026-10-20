/**
 * The player store: owns the queue and drives the single-song engine.
 *
 * - Downloaded songs play from their file; others stream from a resolved
 *   YouTube URL (cached 4 h, prefetched for the next song while one plays).
 * - A stream error re-resolves the URL once and resumes at the last position
 *   (expired URLs). Any other failure, e.g. the signal dropping, moves on to
 *   the next playable song: offline that means the next downloaded one.
 * - While subscribed to `engine.onRemote` the store handles every remote
 *   command itself (lock screen, notification, headset).
 */
import { create } from 'zustand';

import type { Song } from '../library/types';
import { getConnectivity } from '../net/connectivity';
import { resolveStream } from '../youtube/client';
import { engine, type EngineStatus, type PlayerEngine } from './engine';
import * as Q from './queue';
import type { QueueState } from './queue';

export type { QueueState, RepeatMode } from './queue';

export const STREAM_URL_TTL_MS = 4 * 60 * 60 * 1000;
/** `previous()` restarts the song instead once it has played this long. */
const RESTART_AFTER_SEC = 3;

export type PlayerState = {
  queue: QueueState | null;
  status: EngineStatus;
  playSongs(songs: Song[], index: number, opts?: { shuffle?: boolean }): void;
  togglePlay(): void;
  next(): void;
  previous(): void;
  seek(sec: number): void;
  toggleShuffle(): void;
  cycleRepeat(): void;
  playNext(s: Song): void;
  enqueue(s: Song): void;
  removeFromQueue(i: number): void;
  moveInQueue(from: number, to: number): void;
  /** The song left the library (download manager): drop it and skip it if playing. */
  onSongRemoved(youtubeId: string): void;
  /**
   * The song's library row changed (e.g. download finished or its file was deleted):
   * swap its snapshot in the queue. The playing song is not reloaded; its next load uses it.
   */
  onSongUpdated(song: Song): void;
};

export type PlayerDeps = {
  engine: PlayerEngine;
  resolveStream: (youtubeId: string) => Promise<{ url: string }>;
  isOnline: () => boolean;
  now?: () => number;
};

const IDLE: EngineStatus = { playing: false, buffering: false, positionSec: 0, durationSec: 0, ended: false, error: null };

/** `song.filePath` is a bare absolute path; the engine wants a URI. */
export function fileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export function isPlayable(s: Song, online: boolean): boolean {
  return s.download === 'done' || online;
}

export function artworkUri(s: Song): string | null {
  return s.artPath ? fileUri(s.artPath) : s.thumbnailUrl;
}

export const selectCurrent = (s: PlayerState): Song | null => (s.queue ? (s.queue.items[s.queue.index] ?? null) : null);

const isLocal = (s: Song) => s.download === 'done' && !!s.filePath;

export function createPlayerStore(deps: PlayerDeps) {
  const now = deps.now ?? Date.now;
  const playable = (s: Song) => isPlayable(s, deps.isOnline());

  const urls = new Map<string, { url: string; at: number }>();
  let loadSeq = 0; // bumps on every load; stale async loads drop out
  let source: { youtubeId: string; kind: 'file' | 'http' } | null = null; // what the engine holds
  let retried = false; // the current song has been re-resolved once already
  let failures = 0; // songs that failed in a row (stops a skip loop)
  let lastPosition = 0;

  return create<PlayerState>()((set, get) => {
    async function streamUrl(youtubeId: string, fresh = false): Promise<string> {
      const hit = urls.get(youtubeId);
      if (!fresh && hit && now() - hit.at < STREAM_URL_TTL_MS) return hit.url;
      const { url } = await deps.resolveStream(youtubeId);
      urls.set(youtubeId, { url, at: now() });
      return url;
    }

    function prefetch(q: QueueState) {
      const n = Q.advance(q, 'user', playable);
      const s = n?.items[n.index];
      if (s && !isLocal(s) && deps.isOnline()) streamUrl(s.youtubeId).catch(() => {});
    }

    async function loadCurrent(autoplay: boolean, opts: { startSec?: number; fresh?: boolean } = {}) {
      const q = get().queue;
      if (!q) return;
      const s = q.items[q.index];
      const seq = ++loadSeq;
      source = null;
      let uri: string;
      let kind: 'file' | 'http';
      try {
        if (isLocal(s)) {
          uri = fileUri(s.filePath!);
          kind = 'file';
        } else {
          uri = await streamUrl(s.youtubeId, opts.fresh);
          kind = 'http';
        }
      } catch (e) {
        if (seq === loadSeq) skipAfterFailure(e instanceof Error ? e.message : 'Could not play this song');
        return;
      }
      if (seq !== loadSeq) return;
      source = { youtubeId: s.youtubeId, kind };
      await deps.engine.load(
        { uri, title: s.title, artist: s.channel, artworkUri: artworkUri(s) },
        autoplay,
        opts.startSec,
      );
      const latest = get().queue;
      if (seq === loadSeq && latest) prefetch(latest);
    }

    /** Make `q` the queue and play its current song from the start. */
    function go(q: QueueState, autoplay = true) {
      retried = false;
      lastPosition = 0;
      set({ queue: q });
      void loadCurrent(autoplay);
    }

    function clear() {
      loadSeq++;
      source = null;
      deps.engine.pause();
      set({ queue: null });
    }

    function skipAfterFailure(message: string) {
      failures++;
      const q = get().queue;
      const n = q && failures < q.items.length ? Q.advance(q, 'user', playable) : null;
      if (n) return go(n);
      loadSeq++;
      deps.engine.pause();
      set({ status: { ...get().status, playing: false, buffering: false, error: get().status.error ?? message } });
    }

    function onEnded() {
      const q = get().queue;
      if (!q) return;
      // The engine has already paused and rewound; with nothing next we stay stopped.
      const n = Q.advance(q, 'ended', playable);
      if (n) go(n);
    }

    function onError(message: string) {
      if (source?.kind === 'http' && !retried && deps.isOnline()) {
        retried = true; // the URL probably expired: fetch a new one, resume where we were
        void loadCurrent(true, { startSec: lastPosition || undefined, fresh: true });
        return;
      }
      skipAfterFailure(message);
    }

    function resume() {
      if (!get().queue) return;
      if (!source) {
        void loadCurrent(true); // nothing loaded (its stream failed to resolve): try again
        return;
      }
      failures = 0; // the user asked again: allow skipping through the queue again
      if (get().status.error) {
        // The engine is still in its error state: a plain play() would leave that error set,
        // so a repeat failure would never be noticed. Load the song afresh instead.
        void loadCurrent(true, { startSec: lastPosition || undefined, fresh: source.kind === 'http' });
        return;
      }
      const hit = urls.get(source.youtubeId);
      if (source.kind === 'http' && (!hit || now() - hit.at >= STREAM_URL_TTL_MS)) {
        void loadCurrent(true, { startSec: lastPosition || undefined, fresh: true });
        return;
      }
      deps.engine.play();
    }

    /** Removes the current song (`remove`), moving to the next playable one that survives. */
    function dropCurrent(gone: (s: Song) => boolean, remove: (q: QueueState) => QueueState) {
      const q = get().queue!;
      const n = Q.advance(q, 'user', (s) => !gone(s) && playable(s));
      if (n) return go(remove(n));
      const rest = remove(q);
      if (rest.items.length > 0 && playable(rest.items[rest.index])) return go(rest, false);
      clear();
    }

    /** Applies a queue edit that keeps the current song. */
    function edit(fn: (q: QueueState) => QueueState) {
      const q = get().queue;
      if (!q) return;
      const next = fn(q);
      set({ queue: next });
      prefetch(next);
    }

    deps.engine.onStatus((s) => {
      const prev = get().status;
      set({ status: s });
      if (!source) return; // a load is in flight; these events are about the old song
      if (s.playing) failures = 0;
      if (!s.ended && s.positionSec > 0) lastPosition = s.positionSec;
      if (s.ended && !prev.ended) onEnded();
      else if (s.error && !prev.error) onError(s.error);
    });

    deps.engine.onRemote((c) => {
      if (c === 'play') resume();
      else if (c === 'pause') deps.engine.pause();
      else if (c === 'next') get().next();
      else if (c === 'previous') get().previous();
      else deps.engine.seekTo(c.seekTo);
    });

    return {
      queue: null,
      status: IDLE,

      playSongs(songs, index, opts) {
        if (songs.length === 0) return;
        const q: QueueState = { ...Q.start(songs, index, !!opts?.shuffle), repeat: get().queue?.repeat ?? 'off' };
        const first = playable(q.items[q.index]) ? q : Q.advance(q, 'user', playable);
        if (!first) return;
        failures = 0;
        go(first);
      },

      togglePlay() {
        const { playing, buffering, error } = get().status;
        // Buffering counts as playing: tapping during a stall means pause.
        if ((playing || buffering) && !error) deps.engine.pause();
        else resume();
      },

      next() {
        const q = get().queue;
        const n = q && Q.advance(q, 'user', playable);
        if (n) go(n);
      },

      previous() {
        const q = get().queue;
        if (!q) return;
        const p = Q.back(q, playable);
        if (get().status.positionSec > RESTART_AFTER_SEC || p.index === q.index) deps.engine.seekTo(0);
        else go(p);
      },

      seek(sec) {
        if (get().queue) deps.engine.seekTo(sec);
      },

      toggleShuffle: () => edit(Q.toggleShuffle),
      cycleRepeat: () => edit(Q.cycleRepeat),

      playNext(s) {
        if (get().queue) edit((q) => Q.playNext(q, s));
        else get().playSongs([s], 0);
      },

      enqueue(s) {
        if (get().queue) edit((q) => Q.enqueue(q, s));
        else get().playSongs([s], 0);
      },

      removeFromQueue(i) {
        const q = get().queue;
        if (!q || !q.items[i]) return;
        if (i !== q.index) return edit((x) => Q.removeAt(x, i));
        const cur = q.items[i];
        dropCurrent(
          (s) => s === cur,
          (x) => Q.removeAt(x, x.items.indexOf(cur)),
        );
      },

      moveInQueue: (from, to) => edit((q) => Q.move(q, from, to)),

      onSongUpdated(song) {
        const q = get().queue;
        if (!q || !q.items.some((s) => s.youtubeId === song.youtubeId)) return;
        const swap = (list: Song[]) => list.map((s) => (s.youtubeId === song.youtubeId ? song : s));
        edit((x) => ({ ...x, items: swap(x.items), original: swap(x.original) }));
      },

      onSongRemoved(youtubeId) {
        urls.delete(youtubeId);
        const q = get().queue;
        if (!q || !q.items.some((s) => s.youtubeId === youtubeId)) return;
        if (q.items[q.index].youtubeId !== youtubeId) return edit((x) => Q.removeSongEverywhere(x, youtubeId));
        dropCurrent(
          (s) => s.youtubeId === youtubeId,
          (x) => Q.removeSongEverywhere(x, youtubeId),
        );
      },
    };
  });
}

export const usePlayer = createPlayerStore({
  engine,
  resolveStream,
  isOnline: () => getConnectivity().online,
});
