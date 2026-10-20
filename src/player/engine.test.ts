type Listener = (payload: any) => void;

type MockState = {
  listeners: Map<string, Listener>;
  remoteHandlers: Record<string, (cmd: any) => void>;
  progress: { position: number; duration: number; buffered: number; cached: number };
};

// The engine registers listeners when it is imported (before this file's body
// runs), so the fake's state lives inside the mock factory.
jest.mock('@rntp/player', () => {
  const state: MockState = {
    listeners: new Map(),
    remoteHandlers: {},
    progress: { position: 0, duration: 0, buffered: 0, cached: 0 },
  };
  const Event = {
    PlaybackStateChanged: 'event.playback-state-changed',
    IsPlayingChanged: 'event.is-playing-changed',
    MediaItemTransition: 'event.media-item-transition',
    PlaybackError: 'event.playback-error',
  };
  return {
    __esModule: true,
    __mock: state,
    Event,
    PlaybackState: { Idle: 'idle', Ready: 'ready', Buffering: 'buffering', Ended: 'ended', Error: 'error' },
    PlayerCommand: { Seek: 'seek', PlayPause: 'playPause', Next: 'next', Previous: 'previous' },
    default: {
      setupPlayer: jest.fn(),
      setCommands: jest.fn(),
      setMediaItems: jest.fn(),
      play: jest.fn(),
      pause: jest.fn(),
      seekTo: jest.fn(),
      skipToIndex: jest.fn(),
      getProgress: jest.fn(() => state.progress),
      addEventListener: jest.fn((event: string, cb: Listener) => {
        state.listeners.set(event, cb);
        return { remove: jest.fn() };
      }),
      registerRemoteHandlers: jest.fn((h: Record<string, (cmd: any) => void>) => {
        state.remoteHandlers = h;
        return { remove: jest.fn() };
      }),
    },
  };
});

import TrackPlayer from '@rntp/player';

import { engine, type EngineStatus, type RemoteCommand } from './engine';

const TP = TrackPlayer as unknown as Record<string, jest.Mock>;
const mock: MockState = jest.requireMock('@rntp/player').__mock;
const emit = (event: string, payload: unknown) => mock.listeners.get(event)!(payload);
const press = (name: string, extra: object = {}) =>
  mock.remoteHandlers[name]({ performDefault: jest.fn(), ...extra });

const song = {
  uri: 'file:///data/songs/abc.webm',
  title: 'Song A',
  artist: 'Artist A',
  artworkUri: 'https://i.ytimg.com/vi/abc/hq.jpg',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('engine.load', () => {
  it('sets up the player once and passes uri, metadata and startSec through', async () => {
    await engine.load(song, true, 42);

    expect(TP.setupPlayer).toHaveBeenCalledTimes(1);
    expect(TP.setCommands).toHaveBeenCalledWith({
      capabilities: ['playPause', 'next', 'previous', 'seek'],
    });
    const [items, startIndex] = TP.setMediaItems.mock.calls[0];
    expect(startIndex).toBe(0);
    expect(items[0]).toEqual({
      mediaId: 'file:///data/songs/abc.webm',
      url: 'file:///data/songs/abc.webm',
      title: 'Song A',
      artist: 'Artist A',
      artworkUrl: 'https://i.ytimg.com/vi/abc/hq.jpg',
    });
    // A silent end-marker keeps "next" available in the notification.
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ mediaId: 'resonance:end', title: 'Song A', artist: 'Artist A' });
    expect(TP.seekTo).toHaveBeenCalledWith(42);
    expect(TP.play).toHaveBeenCalled();

    await engine.load({ ...song, uri: 'https://example.com/a.webm', artist: null, artworkUri: null }, false);
    expect(TP.setupPlayer).toHaveBeenCalledTimes(1);
    const [items2] = TP.setMediaItems.mock.calls[1];
    expect(items2[0]).toEqual({
      mediaId: 'https://example.com/a.webm',
      url: 'https://example.com/a.webm',
      title: 'Song A',
    });
    expect(TP.seekTo).toHaveBeenCalledTimes(1);
    expect(TP.pause).toHaveBeenCalled();
  });
});

describe('engine.onStatus', () => {
  it('maps native events to EngineStatus', async () => {
    jest.useFakeTimers();
    const seen: EngineStatus[] = [];
    const off = engine.onStatus((s) => seen.push(s));
    await engine.load(song, true);
    const last = () => seen[seen.length - 1];

    expect(last()).toEqual({
      playing: false,
      buffering: true,
      positionSec: 0,
      durationSec: 0,
      ended: false,
      error: null,
    });

    emit('event.playback-state-changed', { state: 'ready' });
    emit('event.is-playing-changed', { playing: true });
    expect(last()).toMatchObject({ playing: true, buffering: false, ended: false });

    emit('event.playback-state-changed', { state: 'buffering' });
    expect(last().buffering).toBe(true);

    mock.progress = { position: 10, duration: 200, buffered: 0, cached: 0 };
    jest.advanceTimersByTime(500); // position is polled while playing
    expect(last()).toMatchObject({ positionSec: 10, durationSec: 200 });

    // The song finished: the player moved on to the silent end-marker.
    emit('event.media-item-transition', { item: { mediaId: 'resonance:end' }, index: 1, reason: 'auto' });
    expect(last()).toMatchObject({ ended: true, playing: false, positionSec: 200 });
    expect(TP.pause).toHaveBeenCalled();
    expect(TP.skipToIndex).toHaveBeenCalledWith(0);

    emit('event.playback-error', { code: 'network', message: 'Source error' });
    expect(last()).toMatchObject({ error: 'Source error', playing: false, buffering: false });

    const count = seen.length;
    off();
    emit('event.is-playing-changed', { playing: true });
    expect(seen).toHaveLength(count);
    jest.useRealTimers();
  });
});

describe('engine.onRemote', () => {
  it('delivers notification/lock-screen commands to subscribers and unsubscribes', () => {
    const got: RemoteCommand[] = [];
    const off = engine.onRemote((c) => got.push(c));

    press('next');
    press('previous');
    press('play');
    press('pause');
    press('seek', { position: 30 });
    expect(got).toEqual(['next', 'previous', 'play', 'pause', { seekTo: 30 }]);

    off();
    press('next');
    expect(got).toHaveLength(5);
  });

  it('falls back to the engine for play/pause/seek when nobody subscribes', () => {
    press('pause');
    expect(TP.pause).toHaveBeenCalled();
    press('play');
    expect(TP.play).toHaveBeenCalled();
    press('seek', { position: 12 });
    expect(TP.seekTo).toHaveBeenCalledWith(12);
  });
});
