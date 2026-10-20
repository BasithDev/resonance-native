/**
 * Turns engine status ticks into listening chunks. Only the wall-clock time
 * between two consecutive playing ticks counts, so pauses, stalls and long
 * gaps add nothing. Every full CHUNK_SEC is reported with the timestamp at
 * its end; a partial chunk is reported when the song changes.
 */
export const CHUNK_SEC = 10;
/** Ticks come every ~0.5 s; a longer gap means the app was not really playing. */
const MAX_GAP_MS = 2000;

export function createListenTracker(
  onListen: (youtubeId: string, durationSec: number, playedAt: number) => void,
  now: () => number,
) {
  let songId: string | null = null;
  let lastAt: number | null = null; // set only while the previous tick was playing
  let accMs = 0;

  function flush(at: number) {
    const sec = Math.round(accMs / 1000);
    if (songId && sec >= 1) onListen(songId, sec, at);
    accMs = 0;
  }

  return {
    tick(youtubeId: string | null, playing: boolean) {
      const t = now();
      if (youtubeId !== songId) {
        flush(lastAt ?? t);
        songId = youtubeId;
        lastAt = null;
      }
      if (!playing || !songId) {
        lastAt = null;
        return;
      }
      if (lastAt !== null) accMs += Math.min(Math.max(t - lastAt, 0), MAX_GAP_MS);
      lastAt = t;
      while (accMs >= CHUNK_SEC * 1000) {
        accMs -= CHUNK_SEC * 1000;
        onListen(songId, CHUNK_SEC, t);
      }
    },
  };
}
