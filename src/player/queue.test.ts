import type { Song } from '../library/types';
import {
  advance, back, cycleRepeat, enqueue, move, playNext, removeAt, removeSongEverywhere, start, toggleShuffle,
  type QueueState,
} from './queue';

const song = (id: string, download: Song['download'] = 'done'): Song => ({
  youtubeId: id,
  title: `Title ${id}`,
  channel: 'Chan',
  durationSec: 100,
  thumbnailUrl: `https://img/${id}.jpg`,
  addedAt: 1,
  download,
  filePath: download === 'done' ? `/data/audio/${id}.webm` : null,
  artPath: null,
  sizeBytes: null,
  downloadError: null,
});

const ids = (q: QueueState | Song[]) => ('items' in q ? q.items : q).map((s) => s.youtubeId);
const current = (q: QueueState) => q.items[q.index].youtubeId;
const always = () => true;
const offline = (s: Song) => s.download === 'done';
const songs = (...names: string[]) => names.map((n) => song(n));

describe('queue', () => {
  it('start with shuffle keeps the chosen song first', () => {
    const list = songs('a', 'b', 'c', 'd', 'e', 'f');
    for (let i = 0; i < 20; i++) {
      const q = start(list, 3, true);
      expect(q.index).toBe(0);
      expect(current(q)).toBe('d');
      expect(ids(q).slice(1).sort()).toEqual(['a', 'b', 'c', 'e', 'f']);
      expect(ids(q.original)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
      expect(q.shuffle).toBe(true);
    }
  });

  it('start without shuffle keeps order and index', () => {
    const q = start(songs('a', 'b', 'c'), 1, false);
    expect(ids(q)).toEqual(['a', 'b', 'c']);
    expect(q.index).toBe(1);
    expect(q.repeat).toBe('off');
  });

  it('toggleShuffle off restores original order with current song selected', () => {
    const q = start(songs('a', 'b', 'c', 'd', 'e'), 0, true);
    const moved = { ...q, index: 2 };
    const playing = current(moved);
    const off = toggleShuffle(moved);
    expect(off.shuffle).toBe(false);
    expect(ids(off)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(current(off)).toBe(playing);
  });

  it('toggleShuffle on puts the current song first', () => {
    const on = toggleShuffle(start(songs('a', 'b', 'c', 'd'), 2, false));
    expect(on.shuffle).toBe(true);
    expect(on.index).toBe(0);
    expect(current(on)).toBe('c');
    expect([...ids(on)].sort()).toEqual(['a', 'b', 'c', 'd']);
  });

  it("advance 'ended' with repeat one stays on the same index", () => {
    const q = { ...start(songs('a', 'b', 'c'), 1, false), repeat: 'one' as const };
    expect(advance(q, 'ended', always)?.index).toBe(1);
  });

  it("advance 'user' with repeat one moves on", () => {
    const q = { ...start(songs('a', 'b', 'c'), 1, false), repeat: 'one' as const };
    expect(advance(q, 'user', always)?.index).toBe(2);
  });

  it('advance at end: repeat off → null, repeat all → index 0', () => {
    const q = start(songs('a', 'b', 'c'), 2, false);
    expect(advance(q, 'ended', always)).toBeNull();
    expect(advance(q, 'user', always)).toBeNull();
    expect(advance({ ...q, repeat: 'all' }, 'ended', always)?.index).toBe(0);
  });

  it('advance skips unplayable songs', () => {
    const q = start([song('a'), song('b', 'none'), song('c')], 0, false);
    const next = advance(q, 'ended', offline);
    expect(next && current(next)).toBe('c');
  });

  it('advance returns null when nothing ahead is playable offline', () => {
    const q = start([song('a'), song('b', 'none'), song('c', 'queued')], 0, false);
    expect(advance(q, 'ended', offline)).toBeNull();
    expect(advance(q, 'user', offline)).toBeNull();
  });

  it("advance 'ended' with repeat one moves on when the current song can no longer play", () => {
    const q = { ...start([song('a', 'none'), song('b')], 0, false), repeat: 'one' as const };
    const next = advance(q, 'ended', offline);
    expect(next && current(next)).toBe('b');
  });

  it('back goes to the previous playable song and stays at the start', () => {
    const q = start([song('a'), song('b', 'none'), song('c')], 2, false);
    const prev = back(q, offline);
    expect(current(prev)).toBe('a');
    expect(back(prev, offline).index).toBe(0);
    expect(back({ ...prev, repeat: 'all' }, offline).index).toBe(2);
  });

  it('cycleRepeat goes off → all → one → off', () => {
    let q = start(songs('a'), 0, false);
    q = cycleRepeat(q);
    expect(q.repeat).toBe('all');
    q = cycleRepeat(q);
    expect(q.repeat).toBe('one');
    expect(cycleRepeat(q).repeat).toBe('off');
  });

  it('removeSongEverywhere drops the song and keeps current track', () => {
    const q = start(songs('a', 'b', 'c', 'd'), 2, false);
    const r = removeSongEverywhere(q, 'a');
    expect(ids(r)).toEqual(['b', 'c', 'd']);
    expect(current(r)).toBe('c');
    expect(ids(r.original)).toEqual(['b', 'c', 'd']);

    const shuffled = start(songs('a', 'b', 'c', 'd'), 1, true);
    const r2 = removeSongEverywhere(shuffled, 'd');
    expect(ids(r2)).not.toContain('d');
    expect(ids(r2.original)).toEqual(['a', 'b', 'c']);
    expect(current(r2)).toBe('b');
  });

  it('removeSongEverywhere of the current song selects the song that took its place', () => {
    const q = start(songs('a', 'b', 'c'), 1, false);
    const r = removeSongEverywhere(q, 'b');
    expect(ids(r)).toEqual(['a', 'c']);
    expect(current(r)).toBe('c');
    const last = removeSongEverywhere(start(songs('a', 'b'), 1, false), 'b');
    expect(last.index).toBe(0);
    expect(removeSongEverywhere(start(songs('a'), 0, false), 'a').items).toEqual([]);
  });

  it('playNext inserts after current; enqueue appends; move reorders', () => {
    let q = start(songs('a', 'b', 'c'), 1, false);
    q = playNext(q, song('x'));
    expect(ids(q)).toEqual(['a', 'b', 'x', 'c']);
    q = enqueue(q, song('y'));
    expect(ids(q)).toEqual(['a', 'b', 'x', 'c', 'y']);
    expect(current(q)).toBe('b');

    q = move(q, 4, 0);
    expect(ids(q)).toEqual(['y', 'a', 'b', 'x', 'c']);
    expect(current(q)).toBe('b');
    q = move(q, 2, 4);
    expect(ids(q)).toEqual(['y', 'a', 'x', 'c', 'b']);
    expect(current(q)).toBe('b');
    q = move(q, 0, 3);
    expect(ids(q)).toEqual(['a', 'x', 'c', 'y', 'b']);
    expect(current(q)).toBe('b');
    expect(ids(q.original)).toEqual(ids(q));
  });

  it('songs added while shuffled survive turning shuffle off', () => {
    let q = start(songs('a', 'b', 'c'), 0, true);
    q = playNext(q, song('x'));
    expect(q.items[q.index + 1].youtubeId).toBe('x');
    q = enqueue(q, song('y'));
    const off = toggleShuffle(q);
    expect(ids(off)).toEqual(['a', 'x', 'b', 'c', 'y']);
    expect(current(off)).toBe('a');
  });

  it('removeAt drops an upcoming song and keeps the current one', () => {
    const q = start(songs('a', 'b', 'c', 'd'), 2, false);
    const r = removeAt(q, 0);
    expect(ids(r)).toEqual(['b', 'c', 'd']);
    expect(current(r)).toBe('c');
    const r2 = removeAt(r, 2);
    expect(ids(r2)).toEqual(['b', 'c']);
    expect(current(r2)).toBe('c');
  });
});
