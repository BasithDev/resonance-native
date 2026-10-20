/**
 * Playback engine: one track at a time, background playback, and
 * notification / lock-screen / headset controls. The queue lives in our own
 * store (later task); it drives this engine through `load`, and reacts to
 * `onStatus` (e.g. `ended`) and `onRemote` (next/previous/play/pause/seek).
 *
 * DECISION: @rntp/player 5.12.1 (react-native-track-player v5, non-commercial
 * licence - fine for this personal app), not expo-audio. Decided by reading the
 * Android sources; no device was available for the on-device checklist.
 *
 * Why not expo-audio (~57.0.5):
 * - android/src/main/java/expo/modules/audio/service/AudioMediaSessionCallback.kt:27-31
 *   removes COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM, COMMAND_SEEK_TO_NEXT_MEDIA_ITEM,
 *   COMMAND_SEEK_TO_PREVIOUS and COMMAND_SEEK_TO_NEXT from the media session, and
 *   onCustomCommand (lines 46-61) only handles seek forward/backward.
 * - service/AudioControlsService.kt:239-278 builds the notification buttons:
 *   skip-back-10, play/pause, skip-forward-10. No next/previous button exists,
 *   and nothing sends a next/previous event to JS. The v57 docs match this:
 *   `setActiveForLockScreen(active, metadata, { showSeekBackward, showSeekForward })`.
 *   So checklist item (b) cannot pass on expo-audio.
 *
 * Why @rntp/player works:
 * - android/.../TrackPlayerPlaybackService.kt:1158-1188 (buildPlayerCommands)
 *   advertises COMMAND_SEEK_TO_NEXT/PREVIOUS when the capabilities include
 *   PlayerCommand.Next/Previous, and its ForwardingPlayer (lines 580-605) routes
 *   seekToNext/seekToPrevious from the notification, lock screen and headset
 *   through handleRemoteCommand, so `registerRemoteHandlers({ next, previous })`
 *   (src/remoteHandlers.ts) gets them in JS. Headset play/pause reaches
 *   play()/pause() the same way (lines 513-545).
 * - Background: the library's manifest declares the foreground service
 *   TrackPlayerPlaybackService with foregroundServiceType="mediaPlayback" and
 *   the WAKE_LOCK / FOREGROUND_SERVICE(_MEDIA_PLAYBACK) permissions; it merges
 *   automatically (no Expo config plugin is needed). `wakeMode: 'network'`
 *   keeps the CPU and Wi-Fi awake while streaming.
 * - URLs: src/audio.ts normalizeUrlString passes `file://` and `https://`
 *   through to Media3 unchanged.
 *
 * The end marker: Media3 only advertises COMMAND_SEEK_TO_NEXT when the player
 * has a next item (ExoPlayer's available commands), so with a true one-item
 * queue the notification has no Next button. So every `load` queues the song
 * plus a short silent end marker (assets/audio/silence.wav) with the same
 * metadata. Next/Previous are intercepted by our handlers and never move
 * natively. When the song finishes, the player moves to the end marker on
 * its own. We treat that as `ended`, pause, and step back to the song.
 */
import TrackPlayer, { Event, PlaybackState, PlayerCommand, type MediaItem } from '@rntp/player';

export type EngineStatus = {
  playing: boolean;
  buffering: boolean;
  positionSec: number;
  durationSec: number;
  ended: boolean;
  error: string | null;
};
export type RemoteCommand = 'play' | 'pause' | 'next' | 'previous' | { seekTo: number };
export interface PlayerEngine {
  load(
    src: { uri: string; title: string; artist: string | null; artworkUri: string | null },
    autoplay: boolean,
    startSec?: number,
  ): Promise<void>;
  play(): void;
  pause(): void;
  seekTo(sec: number): void;
  onStatus(cb: (s: EngineStatus) => void): () => void;
  onRemote(cb: (c: RemoteCommand) => void): () => void;
}

const END_MARKER_ID = 'resonance:end';
const POLL_MS = 500;

const statusSubs = new Set<(s: EngineStatus) => void>();
const remoteSubs = new Set<(c: RemoteCommand) => void>();

let status: EngineStatus = {
  playing: false,
  buffering: false,
  positionSec: 0,
  durationSec: 0,
  ended: false,
  error: null,
};
let isSetUp = false;
let poll: ReturnType<typeof setInterval> | null = null;

function update(patch: Partial<EngineStatus>) {
  const next = { ...status, ...patch };
  if ((Object.keys(next) as (keyof EngineStatus)[]).every((k) => next[k] === status[k])) return;
  status = next;
  statusSubs.forEach((cb) => cb(status));
}

function readProgress() {
  if (status.ended) return;
  const { position, duration } = TrackPlayer.getProgress();
  update({ positionSec: position, durationSec: duration });
}

function setPolling(on: boolean) {
  if (on && !poll) poll = setInterval(readProgress, POLL_MS);
  if (!on && poll) {
    clearInterval(poll);
    poll = null;
  }
}

function ensureSetUp() {
  if (isSetUp) return;
  isSetUp = true;
  TrackPlayer.setupPlayer({
    contentType: 'music',
    handleAudioBecomingNoisy: true,
    audioMixing: 'exclusive',
    android: { wakeMode: 'network' },
  });
  TrackPlayer.setCommands({
    capabilities: [PlayerCommand.PlayPause, PlayerCommand.Next, PlayerCommand.Previous, PlayerCommand.Seek],
  });
}

/** Leave the end marker: stop, rewind to the song, report `ended`. */
function finishTrack() {
  setPolling(false);
  update({ ended: true, playing: false, buffering: false, positionSec: status.durationSec });
  TrackPlayer.pause();
  TrackPlayer.skipToIndex(0);
}

function clearEnded() {
  if (status.ended) update({ ended: false, positionSec: 0 });
}

TrackPlayer.addEventListener(Event.IsPlayingChanged, ({ playing }) => {
  update({ playing });
  setPolling(playing);
});

TrackPlayer.addEventListener(Event.PlaybackStateChanged, ({ state }) => {
  if (state === PlaybackState.Buffering) update({ buffering: true });
  else if (state === PlaybackState.Ready) update({ buffering: false });
  else if (state === PlaybackState.Ended) finishTrack();
  else if (state === PlaybackState.Error) update({ buffering: false, playing: false, error: status.error ?? 'Playback error' });
  readProgress();
});

TrackPlayer.addEventListener(Event.MediaItemTransition, ({ item, reason }) => {
  if (item?.mediaId === END_MARKER_ID && reason === 'auto') finishTrack();
});

TrackPlayer.addEventListener(Event.PlaybackError, ({ message }) => {
  setPolling(false);
  update({ error: message || 'Playback error', playing: false, buffering: false });
});

/** Send a remote press to subscribers; with none, run `fallback` (if any). */
function remote(cmd: RemoteCommand, fallback?: () => void) {
  if (remoteSubs.size === 0) fallback?.();
  else remoteSubs.forEach((cb) => cb(cmd));
}

TrackPlayer.registerRemoteHandlers({
  play: () => remote('play', () => engine.play()),
  pause: () => remote('pause', () => engine.pause()),
  next: () => remote('next'),
  previous: () => remote('previous'),
  seek: ({ position }) => remote({ seekTo: position }, () => engine.seekTo(position)),
});

export const engine: PlayerEngine = {
  async load(src, autoplay, startSec) {
    ensureSetUp();
    const meta = {
      title: src.title,
      ...(src.artist != null ? { artist: src.artist } : {}),
      ...(src.artworkUri != null ? { artworkUrl: src.artworkUri } : {}),
    };
    const song: MediaItem = { mediaId: src.uri, url: src.uri, ...meta };
    const endMarker: MediaItem = {
      mediaId: END_MARKER_ID,
      url: require('../../assets/audio/silence.wav'),
      ...meta,
    };
    setPolling(false);
    status = { playing: false, buffering: true, positionSec: startSec ?? 0, durationSec: 0, ended: false, error: null };
    statusSubs.forEach((cb) => cb(status));
    TrackPlayer.setMediaItems([song, endMarker], 0);
    if (startSec) TrackPlayer.seekTo(startSec);
    if (autoplay) TrackPlayer.play();
    else TrackPlayer.pause();
  },
  play() {
    clearEnded();
    TrackPlayer.play();
  },
  pause() {
    TrackPlayer.pause();
  },
  seekTo(sec) {
    clearEnded();
    TrackPlayer.seekTo(sec);
    update({ positionSec: sec });
  },
  onStatus(cb) {
    statusSubs.add(cb);
    return () => {
      statusSubs.delete(cb);
    };
  },
  onRemote(cb) {
    remoteSubs.add(cb);
    return () => {
      remoteSubs.delete(cb);
    };
  },
};
