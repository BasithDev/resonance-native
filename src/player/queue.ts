/**
 * Pure play-queue logic. `items` is the play order; `original` is the order
 * the songs were given in (what turning shuffle off goes back to). With
 * shuffle off the two are always equal. Every function returns a new state.
 */
import type { Song } from '../library/types';

export type RepeatMode = 'off' | 'all' | 'one';
export type QueueState = { original: Song[]; items: Song[]; index: number; shuffle: boolean; repeat: RepeatMode };

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Index in `original` of the song currently playing. */
function currentInOriginal(q: QueueState): number {
  if (!q.shuffle) return q.index;
  const id = q.items[q.index]?.youtubeId;
  return q.original.findIndex((s) => s.youtubeId === id);
}

/** Shuffled order with `list[at]` first. */
function shuffleFrom(list: Song[], at: number): Song[] {
  return [list[at], ...shuffled(list.filter((_, i) => i !== at))];
}

export function start(songs: Song[], startIndex: number, shuffle: boolean): QueueState {
  const original = [...songs];
  if (shuffle) return { original, items: shuffleFrom(original, startIndex), index: 0, shuffle, repeat: 'off' };
  return { original, items: [...original], index: startIndex, shuffle, repeat: 'off' };
}

/** The next state to play, or null to stop. Unplayable songs are skipped. */
export function advance(
  q: QueueState,
  reason: 'ended' | 'user',
  playable: (s: Song) => boolean,
): QueueState | null {
  const n = q.items.length;
  if (n === 0) return null;
  if (reason === 'ended' && q.repeat === 'one' && playable(q.items[q.index])) return { ...q };
  const wrap = q.repeat !== 'off';
  for (let k = 1; k <= n; k++) {
    const i = q.index + k;
    if (i >= n && !wrap) return null;
    if (playable(q.items[i % n])) return { ...q, index: i % n };
  }
  return null;
}

/** The previous playable song; stays put at the start (wraps with repeat all). */
export function back(q: QueueState, playable: (s: Song) => boolean): QueueState {
  const n = q.items.length;
  for (let k = 1; k < n; k++) {
    const i = q.index - k;
    if (i < 0 && q.repeat !== 'all') break;
    if (playable(q.items[(i + n) % n])) return { ...q, index: (i + n) % n };
  }
  return q;
}

export function toggleShuffle(q: QueueState): QueueState {
  if (q.items.length === 0) return { ...q, shuffle: !q.shuffle };
  if (q.shuffle) {
    const index = Math.max(0, currentInOriginal(q));
    return { ...q, shuffle: false, items: [...q.original], index };
  }
  return { ...q, shuffle: true, items: shuffleFrom(q.original, q.index), index: 0 };
}

export function cycleRepeat(q: QueueState): QueueState {
  const repeat: RepeatMode = q.repeat === 'off' ? 'all' : q.repeat === 'all' ? 'one' : 'off';
  return { ...q, repeat };
}

/** Keeps `original` equal to `items` while shuffle is off. */
function synced(q: QueueState): QueueState {
  return q.shuffle ? q : { ...q, original: [...q.items] };
}

function insertAt<T>(list: T[], at: number, item: T): T[] {
  return [...list.slice(0, at), item, ...list.slice(at)];
}

export function playNext(q: QueueState, s: Song): QueueState {
  const items = insertAt(q.items, q.index + 1, s);
  const original = q.shuffle ? insertAt(q.original, currentInOriginal(q) + 1, s) : q.original;
  return synced({ ...q, items, original });
}

export function enqueue(q: QueueState, s: Song): QueueState {
  return synced({ ...q, items: [...q.items, s], original: [...q.original, s] });
}

function withoutIndex(q: QueueState, i: number): QueueState {
  const items = q.items.filter((_, k) => k !== i);
  const index = i < q.index ? q.index - 1 : Math.max(0, Math.min(q.index, items.length - 1));
  return { ...q, items, index };
}

export function removeAt(q: QueueState, i: number): QueueState {
  const removed = q.items[i];
  if (!removed) return q;
  const r = withoutIndex(q, i);
  if (!q.shuffle) return synced(r);
  const at = q.original.indexOf(removed);
  return { ...r, original: q.original.filter((_, k) => k !== at) };
}

export function move(q: QueueState, from: number, to: number): QueueState {
  if (from === to || !q.items[from] || to < 0 || to >= q.items.length) return q;
  const items = [...q.items];
  const [s] = items.splice(from, 1);
  items.splice(to, 0, s);
  let index = q.index;
  if (from === q.index) index = to;
  else if (from < q.index && to >= q.index) index--;
  else if (from > q.index && to <= q.index) index++;
  return synced({ ...q, items, index });
}

/**
 * Drops every copy of a song. If it was the current song, the song that took
 * its place becomes current (the caller decides whether that can play).
 */
export function removeSongEverywhere(q: QueueState, youtubeId: string): QueueState {
  let index = q.index;
  const items = q.items.filter((s, k) => {
    if (s.youtubeId !== youtubeId) return true;
    if (k < q.index) index--;
    return false;
  });
  index = Math.max(0, Math.min(index, items.length - 1));
  return { ...q, items, index, original: q.original.filter((s) => s.youtubeId !== youtubeId) };
}
