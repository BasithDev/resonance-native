import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from 'expo-audio';
import * as api from '../services/api';

export interface Track {
  id?: string;
  youtubeId?: string;
  title: string;
  channel?: string;
  durationSec?: number;
  thumbnailUrl?: string;
  [key: string]: any;
}

interface AudioContextType {
  playerTrack: Track | null;
  isPlaying: boolean;
  isAudioLoading: boolean;
  isPlayerOpen: boolean;
  setIsPlayerOpen: (open: boolean) => void;
  progress: number;
  currentTime: number;
  durationSec: number;
  repeatMode: 'off' | 'all' | 'one';
  shuffleOn: boolean;
  queue: Track[];
  queueIndex: number;
  serverUrl: string;
  isServerModalOpen: boolean;
  setIsServerModalOpen: (open: boolean) => void;
  updateServerUrl: (url: string) => Promise<void>;
  playTrack: (track: Track, trackQueue?: Track[], opts?: { shuffle?: boolean }) => Promise<void>;
  togglePlayPause: () => Promise<void>;
  playNext: () => Promise<void>;
  playPrev: () => Promise<void>;
  enqueueNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  seekTo: (pct: number) => Promise<void>;
  seekBy: (seconds: number) => Promise<void>;
  cycleRepeatMode: () => void;
  toggleShuffle: () => void;
  selectQueueIndex: (index: number) => Promise<void>;
  superShufflePlay: () => Promise<void>;
}

const AudioContext = createContext<AudioContextType | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [playerTrack, setPlayerTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [isServerModalOpen, setIsServerModalOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [repeatMode, setRepeatMode] = useState<'off' | 'all' | 'one'>('off');
  const [shuffleOn, setShuffleOn] = useState(false);
  const [queue, setQueue] = useState<Track[]>([]);
  const [originalQueue, setOriginalQueue] = useState<Track[]>([]);
  const [queueIndex, setQueueIndex] = useState(0);
  const [serverUrl, setServerUrl] = useState('http://192.168.60.114:4000/api');

  const playerRef = useRef<any>(null);

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldRouteThroughEarpiece: false,
    }).catch((e: any) => console.warn('Audio mode config warning:', e));

    api.initApi().then((url) => setServerUrl(url));

    return () => {
      if (playerRef.current) {
        playerRef.current.remove();
        playerRef.current = null;
      }
    };
  }, []);

  async function updateServerUrl(url: string) {
    const newUrl = await api.setBaseUrl(url);
    setServerUrl(newUrl);
  }

  function shuffleArray(arr: Track[]) {
    const res = [...arr];
    for (let i = res.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [res[i], res[j]] = [res[j], res[i]];
    }
    return res;
  }

  async function handleAudioEnded() {
    setIsAudioLoading(false);

    if (repeatMode === 'one') {
      if (playerRef.current) {
        playerRef.current.seekTo(0);
        playerRef.current.play();
      }
    } else if (repeatMode === 'all') {
      const nextIdx = (queueIndex + 1) % (queue.length || 1);
      setQueueIndex(nextIdx);
      if (queue[nextIdx]) {
        await loadAndPlayTrack(queue[nextIdx]);
      }
    } else {
      if (queueIndex < queue.length - 1) {
        const nextIdx = queueIndex + 1;
        setQueueIndex(nextIdx);
        if (queue[nextIdx]) {
          await loadAndPlayTrack(queue[nextIdx]);
        }
      } else {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTime(0);
      }
    }
  }

  async function loadAndPlayTrack(track: Track) {
    setPlayerTrack(track);
    setIsAudioLoading(true);
    setProgress(0);
    setCurrentTime(0);

    const songId = track.id || track.youtubeId;
    if (!songId) return;

    const streamUrl = api.getStreamUrl(songId);

    if (playerRef.current) {
      try {
        playerRef.current.remove();
      } catch (e) {}
      playerRef.current = null;
    }

    try {
      const player = createAudioPlayer({ uri: streamUrl });
      playerRef.current = player;

      (player as any).addListener('playbackStatusUpdate', (status: any) => {
        if (!status) return;
        setIsAudioLoading(Boolean(status.isBuffering));
        setIsPlaying(Boolean(status.playing));

        const posSec = status.currentTime || 0;
        const totalSec = status.duration || track.durationSec || 0;

        setCurrentTime(posSec);
        setDurationSec(totalSec);

        if (totalSec > 0) {
          setProgress(Math.min(1.0, posSec / totalSec));
        }

        if (status.didJustFinish) {
          handleAudioEnded();
        }
      });

      player.play();
      setIsPlaying(true);
    } catch (err) {
      console.error('Failed to load audio stream:', err);
      setIsAudioLoading(false);
      setIsPlaying(false);
    }
  }

  async function playTrack(track: Track, trackQueue?: Track[], opts: { shuffle?: boolean } = {}) {
    if (!track) return;
    const baseQueue = trackQueue && trackQueue.length > 0 ? trackQueue : [track];
    setOriginalQueue(baseQueue);

    const shouldShuffle = opts.shuffle ?? shuffleOn;
    let finalQueue = baseQueue;
    let finalIdx = baseQueue.findIndex(
      (t) => (t.id || t.youtubeId) === (track.id || track.youtubeId)
    );

    if (shouldShuffle && baseQueue.length > 1) {
      const trackId = track.id || track.youtubeId;
      const others = baseQueue.filter((t: Track) => (t.id || t.youtubeId) !== trackId);
      finalQueue = [track, ...shuffleArray(others)];
      finalIdx = 0;
      setShuffleOn(true);
    }

    setQueue(finalQueue);
    setQueueIndex(Math.max(0, finalIdx));

    await loadAndPlayTrack(track);
  }

  async function togglePlayPause() {
    if (!playerRef.current || !playerTrack) return;
    if (isPlaying) {
      playerRef.current.pause();
      setIsPlaying(false);
    } else {
      playerRef.current.play();
      setIsPlaying(true);
    }
  }

  async function playNext() {
    if (queue.length === 0) return;
    let nextIdx = queueIndex + 1;
    if (repeatMode === 'all') {
      nextIdx = (queueIndex + 1) % queue.length;
    }
    if (nextIdx < queue.length) {
      setQueueIndex(nextIdx);
      await loadAndPlayTrack(queue[nextIdx]);
    }
  }

  async function playPrev() {
    if (queue.length === 0) return;
    let prevIdx = queueIndex - 1;
    if (prevIdx < 0 && repeatMode === 'all') {
      prevIdx = queue.length - 1;
    }
    if (prevIdx >= 0 && prevIdx < queue.length) {
      setQueueIndex(prevIdx);
      await loadAndPlayTrack(queue[prevIdx]);
    }
  }

  function enqueueNext(track: Track) {
    if (!playerTrack || queue.length === 0) {
      playTrack(track);
      return;
    }
    const newQueue = [...queue];
    newQueue.splice(queueIndex + 1, 0, track);
    setQueue(newQueue);
  }

  function addToQueue(track: Track) {
    if (!playerTrack || queue.length === 0) {
      playTrack(track);
      return;
    }
    setQueue((prev) => [...prev, track]);
  }

  function removeFromQueue(index: number) {
    if (index < 0 || index >= queue.length) return;
    const newQueue = queue.filter((_, i) => i !== index);
    setQueue(newQueue);
    if (index < queueIndex) {
      setQueueIndex((prev) => Math.max(0, prev - 1));
    } else if (index === queueIndex) {
      if (newQueue.length > 0) {
        const nextIdx = Math.min(queueIndex, newQueue.length - 1);
        setQueueIndex(nextIdx);
        loadAndPlayTrack(newQueue[nextIdx]);
      } else {
        setPlayerTrack(null);
        setIsPlaying(false);
      }
    }
  }

  async function seekTo(pct: number) {
    if (!playerRef.current || durationSec <= 0) return;
    const targetSec = Math.floor(pct * durationSec);
    playerRef.current.seekTo(targetSec);
  }

  async function seekBy(seconds: number) {
    if (!playerRef.current) return;
    const targetSec = Math.max(0, Math.floor(currentTime + seconds));
    playerRef.current.seekTo(targetSec);
  }

  function cycleRepeatMode() {
    setRepeatMode((m: any) => (m === 'off' ? 'all' : m === 'all' ? 'one' : 'off'));
  }

  function toggleShuffle() {
    setShuffleOn((prev: boolean) => {
      const next = !prev;
      const baseQueue = originalQueue.length > 0 ? originalQueue : queue;
      if (next && baseQueue.length > 0) {
        const currentId = playerTrack ? playerTrack.id || playerTrack.youtubeId : null;
        const others = baseQueue.filter((t: Track) => (t.id || t.youtubeId) !== currentId);
        const shuffled = playerTrack ? [playerTrack, ...shuffleArray(others)] : shuffleArray(others);
        setQueue(shuffled);
        setQueueIndex(0);
      } else if (baseQueue.length > 0) {
        setQueue(baseQueue);
        const currentId = playerTrack ? playerTrack.id || playerTrack.youtubeId : null;
        const idx = baseQueue.findIndex((t: Track) => (t.id || t.youtubeId) === currentId);
        setQueueIndex(Math.max(0, idx));
      }
      return next;
    });
  }

  async function selectQueueIndex(index: number) {
    if (index >= 0 && index < queue.length) {
      setQueueIndex(index);
      await loadAndPlayTrack(queue[index]);
    }
  }

  async function superShufflePlay() {
    try {
      const res = await api.getSuperShuffle();
      const tracks = res?.songs || res;
      if (Array.isArray(tracks) && tracks.length > 0) {
        await playTrack(tracks[0], tracks, { shuffle: true });
      }
    } catch (err) {
      console.error('Super shuffle error:', err);
    }
  }

  return (
    <AudioContext.Provider
      value={{
        playerTrack,
        isPlaying,
        isAudioLoading,
        isPlayerOpen,
        setIsPlayerOpen,
        progress,
        currentTime,
        durationSec,
        repeatMode,
        shuffleOn,
        queue,
        queueIndex,
        serverUrl,
        isServerModalOpen,
        setIsServerModalOpen,
        updateServerUrl,
        playTrack,
        togglePlayPause,
        playNext,
        playPrev,
        enqueueNext,
        addToQueue,
        removeFromQueue,
        seekTo,
        seekBy,
        cycleRepeatMode,
        toggleShuffle,
        selectQueueIndex,
        superShufflePlay,
      }}
    >
      {children}
    </AudioContext.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error('useAudio must be used within an AudioProvider');
  return context;
}
