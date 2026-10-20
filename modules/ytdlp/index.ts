import Native from './src/YtdlpModule';
import type { ProgressEvent, YtTrack } from './src/YtdlpModule.types';

export * from './src/YtdlpModule.types';
export type Subscription = ReturnType<typeof Native.addListener>;

/** YouTube search via `ytsearchN:` with `--flat-playlist -J`. */
export function search(query: string, limit = 20): Promise<YtTrack[]> {
  return Native.search(query, limit);
}

/** Flat list of a playlist's entries (`--flat-playlist -J`). */
export function playlistEntries(url: string): Promise<YtTrack[]> {
  return Native.playlistEntries(url);
}

export function videoInfo(urlOrId: string): Promise<YtTrack> {
  return Native.videoInfo(urlOrId);
}

/** Direct (expiring) URL of the best audio stream. */
export function resolveStream(youtubeId: string): Promise<{ url: string }> {
  return Native.resolveStream(youtubeId);
}

/** Downloads best audio to `destDir/<youtubeId>.<ext>`; progress arrives via `addProgressListener`. */
export function download(
  jobId: string,
  youtubeId: string,
  destDir: string,
): Promise<{ path: string; sizeBytes: number }> {
  return Native.download(jobId, youtubeId, destDir);
}

/** Kills the running download for `jobId`; its promise rejects with `CANCELLED`. */
export function cancel(jobId: string): void {
  Native.cancel(jobId);
}

export function version(): Promise<string> {
  return Native.version();
}

/** Updates yt-dlp from the STABLE channel. */
export function update(): Promise<'updated' | 'up-to-date'> {
  return Native.update();
}

export function addProgressListener(cb: (e: ProgressEvent) => void): Subscription {
  return Native.addListener('onProgress', cb);
}
