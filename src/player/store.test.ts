// The default store instance imports the real engine, yt-dlp client and
// connectivity (all native). Each test builds its own store with fakes.
jest.mock('./engine', () => ({
  engine: { onStatus: () => () => {}, onRemote: () => () => {} },
}));
jest.mock('../youtube/client', () => ({ resolveStream: jest.fn() }));
jest.mock('../net/connectivity', () => ({ getConnectivity: () => ({ online: true, wifi: true }) }));

import type { Song } from '../library/types';
import type { EngineStatus, PlayerEngine, RemoteCommand } from './engine';
import { useSleepTimer } from './sleepTimer';
import { createPlayerStore, type NowPlaying } from './store';

const song = (id: string, download: Song['download'] = 'done'): Song => ({
  youtubeId: id,
  title: `Title ${id}`,
  channel: 'Chan',
  durationSec: 100,
  thumbnailUrl: `https://img/${id}.jpg`,
  addedAt: 1,
  download,
  filePath: download === 'done' ? `/data/user/0/app/files/audio/${id}.webm` : null,
  artPath: null,
  sizeBytes: null,
  downloadError: null,
});

function setup(opts: {
  online?: boolean;
  shuffleSongs?: Song[];
  onListen?: (id: string, sec: number, at: number, playStart: boolean) => void;
  onNowPlaying?: (s: NowPlaying) => void;
} = {}) {
  let status: EngineStatus = {
    playing: false, buffering: false, positionSec: 0, durationSec: 0, ended: false, error: null,
  };
  let statusCb: (s: EngineStatus) => void = () => {};
  let remoteCb: (c: RemoteCommand) => void = () => {};
  const engine = {
    load: jest.fn(async (_src: unknown, _autoplay: boolean, startSec?: number) => {
      status = { playing: false, buffering: true, positionSec: startSec ?? 0, durationSec: 0, ended: false, error: null };
      statusCb(status);
    }),
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    onStatus: jest.fn((cb: (s: EngineStatus) => void) => {
      statusCb = cb;
      return () => {};
    }),
    onRemote: jest.fn((cb: (c: RemoteCommand) => void) => {
      remoteCb = cb;
      return () => {};
    }),
  } satisfies PlayerEngine;
  let resolves = 0;
  const resolveStream = jest.fn(async (id: string) => ({ url: `https://stream/${id}?v=${++resolves}` }));
  const net = { online: opts.online ?? true };
  const clock = { now: 1_000_000 };
  const store = createPlayerStore({ engine, resolveStream, isOnline: () => net.online, now: () => clock.now,
    loadSuperShuffle: async () => opts.shuffleSongs ?? [],
    onListen: opts.onListen,
    onNowPlaying: opts.onNowPlaying,
  });
  return {
    store,
    engine,
    resolveStream,
    net,
    clock,
    emit(patch: Partial<EngineStatus>) {
      status = { ...status, ...patch };
      statusCb(status);
    },
    remote: (c: RemoteCommand) => remoteCb(c),
    lastLoad: () => engine.load.mock.calls[engine.load.mock.calls.length - 1],
  };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
const currentId = (t: ReturnType<typeof setup>) => {
  const q = t.store.getState().queue!;
  return q.items[q.index].youtubeId;
};

describe('player store', () => {
  it('plays local file for downloaded songs without resolving', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a')], 0);
    await flush();
    expect(t.resolveStream).not.toHaveBeenCalled();
    expect(t.engine.load).toHaveBeenCalledTimes(1);
    const [src, autoplay] = t.lastLoad();
    expect(src).toMatchObject({ uri: 'file:///data/user/0/app/files/audio/a.webm', title: 'Title a', artist: 'Chan' });
    expect(autoplay).toBe(true);
  });

  it('resolves stream for non-downloaded song when online', async () => {
    const t = setup();
    t.store.getState().playSongs([song('b', 'none')], 0);
    await flush();
    expect(t.resolveStream).toHaveBeenCalledWith('b');
    expect(t.lastLoad()[0]).toMatchObject({ uri: 'https://stream/b?v=1' });
  });

  it('on load error with an http source, re-resolves once and resumes at last position', async () => {
    const t = setup();
    t.store.getState().playSongs([song('b', 'none')], 0);
    await flush();
    t.emit({ playing: true, buffering: false, positionSec: 42, durationSec: 100 });
    t.emit({ playing: false, error: 'Source error (403)' });
    await flush();
    expect(t.resolveStream).toHaveBeenCalledTimes(2);
    expect(t.engine.load).toHaveBeenCalledTimes(2);
    const [src, autoplay, startSec] = t.lastLoad();
    expect(src).toMatchObject({ uri: 'https://stream/b?v=2' });
    expect(autoplay).toBe(true);
    expect(startSec).toBe(42);

    // A second failure of the same song does not loop on re-resolving.
    t.emit({ error: 'Source error (403)' });
    await flush();
    expect(t.resolveStream).toHaveBeenCalledTimes(2);
  });

  it('play after hours paused re-resolves the expired URL and resumes at the same position', async () => {
    const t = setup();
    t.store.getState().playSongs([song('b', 'none')], 0);
    await flush();
    t.emit({ playing: true, buffering: false, positionSec: 75, durationSec: 200 });
    t.store.getState().togglePlay();
    expect(t.engine.pause).toHaveBeenCalledTimes(1);
    t.emit({ playing: false });
    t.clock.now += 5 * 60 * 60 * 1000;
    t.store.getState().togglePlay();
    await flush();
    expect(t.engine.play).not.toHaveBeenCalled();
    expect(t.resolveStream).toHaveBeenCalledTimes(2);
    const [src, autoplay, startSec] = t.lastLoad();
    expect(src).toMatchObject({ uri: 'https://stream/b?v=2' });
    expect(autoplay).toBe(true);
    expect(startSec).toBe(75);
  });

  it('serves a cached stream URL instead of resolving again', async () => {
    const t = setup();
    const b = song('b', 'none');
    t.store.getState().playSongs([b], 0);
    await flush();
    t.store.getState().playSongs([b], 0);
    await flush();
    expect(t.resolveStream).toHaveBeenCalledTimes(1);
    expect(t.lastLoad()[0]).toMatchObject({ uri: 'https://stream/b?v=1' });
  });

  it('prefetches the next song’s stream URL', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a'), song('b', 'none')], 0);
    await flush();
    expect(t.resolveStream).toHaveBeenCalledWith('b');
    t.store.getState().next();
    await flush();
    expect(t.resolveStream).toHaveBeenCalledTimes(1);
    expect(t.lastLoad()[0]).toMatchObject({ uri: 'https://stream/b?v=1' });
  });

  it('when connectivity goes offline mid-stream, ended/error advances to next downloaded song', async () => {
    for (const failure of [{ error: 'Unable to connect' }, { ended: true }] as Partial<EngineStatus>[]) {
      const t = setup();
      t.store.getState().playSongs([song('a', 'none'), song('b', 'none'), song('c')], 0);
      await flush();
      t.emit({ playing: true, buffering: false, positionSec: 10, durationSec: 100 });
      t.net.online = false;
      t.emit({ playing: false, ...failure });
      await flush();
      expect(currentId(t)).toBe('c');
      const [src, autoplay] = t.lastLoad();
      expect(src).toMatchObject({ uri: 'file:///data/user/0/app/files/audio/c.webm' });
      expect(autoplay).toBe(true);
      expect(t.store.getState().status.error).toBeNull();
    }
  });

  it('stops quietly at the end of the queue when nothing else can play', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a', 'none'), song('b', 'none')], 0);
    await flush();
    t.net.online = false;
    t.emit({ error: 'Unable to connect' });
    await flush();
    expect(t.engine.load).toHaveBeenCalledTimes(1);
    expect(t.engine.pause).toHaveBeenCalled();
    expect(currentId(t)).toBe('a');
  });

  it('play after a failed resolve tries the song again', async () => {
    const t = setup();
    t.resolveStream.mockRejectedValueOnce(new Error('Network error'));
    t.store.getState().playSongs([song('b', 'none')], 0);
    await flush();
    expect(t.engine.load).not.toHaveBeenCalled();
    t.store.getState().togglePlay();
    await flush();
    expect(t.lastLoad()[0]).toMatchObject({ uri: 'https://stream/b?v=1' });
  });

  it('play after stopping on a failure reloads the song, so a fresh failure is noticed', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a', 'none'), song('b', 'none')], 0);
    await flush();
    t.emit({ playing: true, buffering: false, positionSec: 20, durationSec: 100 });
    t.net.online = false;
    t.emit({ playing: false, error: 'Unable to connect' });
    await flush();
    expect(t.engine.load).toHaveBeenCalledTimes(1); // stopped: nothing playable offline

    t.net.online = true;
    t.store.getState().togglePlay();
    await flush();
    expect(t.engine.play).not.toHaveBeenCalled();
    expect(t.engine.load).toHaveBeenCalledTimes(2);
    expect(t.resolveStream).toHaveBeenCalledTimes(3); // a, prefetched b, then a afresh
    const [src, autoplay, startSec] = t.lastLoad();
    expect(src).toMatchObject({ uri: 'https://stream/a?v=3' });
    expect(autoplay).toBe(true);
    expect(startSec).toBe(20);

    // The reload cleared the error, so a new failure is handled (re-resolve once).
    t.emit({ error: 'Source error (403)' });
    await flush();
    expect(t.resolveStream).toHaveBeenCalledTimes(4);
    expect(t.engine.load).toHaveBeenCalledTimes(3);
  });

  it('togglePlay while buffering pauses', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a')], 0);
    await flush();
    t.emit({ playing: false, buffering: true });
    t.store.getState().togglePlay();
    expect(t.engine.pause).toHaveBeenCalledTimes(1);
    expect(t.engine.play).not.toHaveBeenCalled();
  });

  it('onSongUpdated swaps the queued snapshot without reloading the playing song', async () => {
    const t = setup({ online: false });
    t.store.getState().playSongs([song('a'), song('b', 'none'), song('c')], 0);
    await flush();
    t.store.getState().onSongUpdated(song('b')); // b finished downloading
    t.store.getState().onSongUpdated({ ...song('a'), title: 'Renamed a' }); // the playing song
    expect(t.engine.load).toHaveBeenCalledTimes(1);
    const q = t.store.getState().queue!;
    expect(q.items.map((s) => s.download)).toEqual(['done', 'done', 'done']);
    expect(q.original.find((s) => s.youtubeId === 'b')!.download).toBe('done');
    expect(q.items[0].title).toBe('Renamed a');

    t.store.getState().next();
    await flush();
    expect(currentId(t)).toBe('b');
    expect(t.lastLoad()[0]).toMatchObject({ uri: 'file:///data/user/0/app/files/audio/b.webm' });

    // A deleted file makes the song stream-only again (greyed and skipped offline).
    t.store.getState().onSongUpdated(song('c', 'none'));
    t.emit({ ended: true, playing: false });
    await flush();
    expect(currentId(t)).toBe('b');
    expect(t.engine.load).toHaveBeenCalledTimes(2);
  });

  it("remote 'next' from engine.onRemote calls next()", async () => {
    const t = setup();
    t.store.getState().playSongs([song('a'), song('b')], 0);
    await flush();
    t.remote('next');
    await flush();
    expect(currentId(t)).toBe('b');
    expect(t.lastLoad()[0]).toMatchObject({ uri: 'file:///data/user/0/app/files/audio/b.webm' });
    t.remote('previous');
    await flush();
    expect(currentId(t)).toBe('a');
  });

  it('remote play, pause and seek drive the engine', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a')], 0);
    await flush();
    t.remote('pause');
    t.remote('play');
    t.remote({ seekTo: 12 });
    expect(t.engine.pause).toHaveBeenCalledTimes(1);
    expect(t.engine.play).toHaveBeenCalledTimes(1);
    expect(t.engine.seekTo).toHaveBeenCalledWith(12);
  });

  it('previous restarts the song after 3 seconds', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a'), song('b')], 1);
    await flush();
    t.emit({ playing: true, positionSec: 30 });
    t.store.getState().previous();
    await flush();
    expect(t.engine.seekTo).toHaveBeenCalledWith(0);
    expect(currentId(t)).toBe('b');
  });

  it('ended advances to the next song', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a'), song('b')], 0);
    await flush();
    t.emit({ ended: true, playing: false });
    await flush();
    expect(currentId(t)).toBe('b');
    expect(t.engine.load).toHaveBeenCalledTimes(2);
  });

  it('onSongRemoved for the current song skips to the next playable', async () => {
    const t = setup({ online: false });
    t.store.getState().playSongs([song('a'), song('b', 'none'), song('c')], 0);
    await flush();
    t.store.getState().onSongRemoved('a');
    await flush();
    const q = t.store.getState().queue!;
    expect(q.items.map((s) => s.youtubeId)).toEqual(['b', 'c']);
    expect(currentId(t)).toBe('c');
    expect(t.lastLoad()[0]).toMatchObject({ uri: 'file:///data/user/0/app/files/audio/c.webm' });
  });

  it('onSongRemoved for another song keeps playing the current one', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a'), song('b'), song('c')], 1);
    await flush();
    t.store.getState().onSongRemoved('a');
    await flush();
    expect(currentId(t)).toBe('b');
    expect(t.engine.load).toHaveBeenCalledTimes(1);
  });

  it('onSongRemoved of the only song clears the queue', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a')], 0);
    await flush();
    t.store.getState().onSongRemoved('a');
    expect(t.store.getState().queue).toBeNull();
    expect(t.engine.pause).toHaveBeenCalled();
  });

  it('store logs a chunk after 10 s of playing and none while paused', async () => {
    const onListen = jest.fn();
    const t = setup({ onListen });
    t.store.getState().playSongs([song('a')], 0);
    await flush();
    const tick = (ms: number, playing: boolean) => {
      t.clock.now += ms;
      t.emit({ playing, buffering: false, positionSec: t.clock.now / 1000 });
    };
    tick(0, true);
    for (let i = 0; i < 19; i++) tick(500, true); // 9.5 s
    expect(onListen).not.toHaveBeenCalled();
    tick(500, true); // 10 s
    expect(onListen).toHaveBeenCalledTimes(1);
    expect(onListen).toHaveBeenCalledWith('a', 10, t.clock.now, true);
    onListen.mockClear();
    tick(500, false); // paused: a long pause adds nothing
    tick(60_000, false);
    for (let i = 0; i < 10; i++) tick(500, false);
    expect(onListen).not.toHaveBeenCalled();
    tick(500, true); // resumed: time counts from the next tick
    for (let i = 0; i < 20; i++) tick(500, true);
    expect(onListen).toHaveBeenCalledTimes(1);
    expect(onListen).toHaveBeenCalledWith('a', 10, t.clock.now, false); // same play: not a new start
  });
});

describe('sleep timer in the store', () => {
  beforeEach(() => useSleepTimer.getState().set(null));

  it('pauses on a status tick past the deadline (no JS timer needed)', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a'), song('b')], 0);
    await flush();
    useSleepTimer.getState().set(15, t.clock.now);
    t.emit({ playing: true, buffering: false, positionSec: 5, durationSec: 100 });
    expect(t.engine.pause).not.toHaveBeenCalled();
    t.clock.now += 15 * 60_000; // screen off: the clock moved on, then a tick arrives
    t.emit({ positionSec: 6 });
    expect(t.engine.pause).toHaveBeenCalledTimes(1);
    expect(useSleepTimer.getState().setting).toBeNull();
  });

  it('endOfSong pauses instead of advancing when the song ends', async () => {
    const t = setup();
    t.store.getState().playSongs([song('a'), song('b')], 0);
    await flush();
    useSleepTimer.getState().set('endOfSong', t.clock.now);
    t.emit({ playing: true, positionSec: 50, durationSec: 100 });
    t.emit({ playing: false, ended: true });
    await flush();
    expect(t.engine.pause).toHaveBeenCalled();
    expect(currentId(t)).toBe('a');
    expect(t.engine.load).toHaveBeenCalledTimes(1);
  });
});

describe('superShuffle', () => {
  it("offline with no downloads returns 'nothing-playable' and does not start", async () => {
    const t = setup({ online: false, shuffleSongs: [song('a', 'none'), song('b', 'none')] });
    expect(await t.store.getState().superShuffle()).toBe('nothing-playable');
    expect(t.store.getState().queue).toBeNull();
    expect(t.engine.load).not.toHaveBeenCalled();
  });

  it('offline plays only downloaded songs, shuffled', async () => {
    const t = setup({ online: false, shuffleSongs: [song('a', 'none'), song('b'), song('c')] });
    expect(await t.store.getState().superShuffle()).toBe('started');
    await flush();
    const q = t.store.getState().queue!;
    expect(q.shuffle).toBe(true);
    expect(q.items.map((s) => s.youtubeId).sort()).toEqual(['b', 'c']);
  });

  it('starts at a random song, not always the first', async () => {
    const t = setup({ shuffleSongs: [song('a'), song('b'), song('c')] });
    jest.spyOn(Math, 'random').mockReturnValue(0.9);
    await t.store.getState().superShuffle();
    jest.restoreAllMocks();
    await flush();
    expect(currentId(t)).toBe('c');
  });

  it('an empty library is nothing-playable', async () => {
    const t = setup();
    expect(await t.store.getState().superShuffle()).toBe('nothing-playable');
  });
});

describe('now playing (widget)', () => {
  it('reports track and play-state changes once each, not on every position tick', async () => {
    const onNowPlaying = jest.fn();
    const t = setup({ onNowPlaying });
    expect(onNowPlaying).toHaveBeenCalledWith({ title: null, artist: null, artworkUri: null, playing: false });
    const b: Song = { ...song('b'), artPath: '/data/art/b.jpg' };
    t.store.getState().playSongs([song('a'), b], 0);
    await flush();
    // Loading counts as playing (buffering), like togglePlay does.
    expect(onNowPlaying).toHaveBeenLastCalledWith({
      title: 'Title a', artist: 'Chan', artworkUri: 'https://img/a.jpg', playing: true,
    });
    const calls = onNowPlaying.mock.calls.length;
    t.emit({ playing: true, buffering: false, positionSec: 1, durationSec: 100 });
    t.emit({ positionSec: 1.5 });
    t.emit({ positionSec: 2 });
    expect(onNowPlaying).toHaveBeenCalledTimes(calls);

    t.emit({ playing: false });
    expect(onNowPlaying).toHaveBeenCalledTimes(calls + 1);
    expect(onNowPlaying).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Title a', playing: false }));

    t.store.getState().next();
    await flush();
    // Offline art first: the downloaded artwork file, not the thumbnail URL.
    expect(onNowPlaying).toHaveBeenLastCalledWith({
      title: 'Title b', artist: 'Chan', artworkUri: 'file:///data/art/b.jpg', playing: true,
    });
  });

  it('reports nothing playing when the queue empties', async () => {
    const onNowPlaying = jest.fn();
    const t = setup({ onNowPlaying });
    t.store.getState().playSongs([song('a')], 0);
    await flush();
    t.store.getState().onSongRemoved('a');
    expect(onNowPlaying).toHaveBeenLastCalledWith({ title: null, artist: null, artworkUri: null, playing: false });
  });
});
