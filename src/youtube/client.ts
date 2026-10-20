import * as ytdlp from '../../modules/ytdlp';
import type { ProgressEvent, Subscription, YtTrack } from '../../modules/ytdlp';

export type { ProgressEvent, Subscription, YtTrack };

export type YoutubeErrorKind = 'extraction' | 'network' | 'cancelled';

const MESSAGES: Record<YoutubeErrorKind, string> = {
  extraction: 'YouTube changed something — update yt-dlp in Settings',
  network: 'Network error — check your connection',
  cancelled: 'Cancelled',
};

export class YoutubeError extends Error {
  readonly kind: YoutubeErrorKind;

  constructor(kind: YoutubeErrorKind, cause?: unknown) {
    super(MESSAGES[kind], { cause });
    this.name = 'YoutubeError';
    this.kind = kind;
  }
}

function toYoutubeError(e: unknown): YoutubeError {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === 'NETWORK') return new YoutubeError('network', e);
  if (code === 'CANCELLED') return new YoutubeError('cancelled', e);
  // EXTRACTION_FAILED and anything unexpected: the fix is updating yt-dlp.
  return new YoutubeError('extraction', e);
}

async function wrap<T>(p: () => Promise<T>): Promise<T> {
  try {
    return await p();
  } catch (e) {
    throw toYoutubeError(e);
  }
}

export function search(query: string, limit = 20): Promise<YtTrack[]> {
  return wrap(() => ytdlp.search(query, limit));
}

export function playlistEntries(url: string): Promise<YtTrack[]> {
  return wrap(() => ytdlp.playlistEntries(url));
}

export function videoInfo(urlOrId: string): Promise<YtTrack> {
  return wrap(() => ytdlp.videoInfo(urlOrId));
}

export function resolveStream(youtubeId: string): Promise<{ url: string }> {
  return wrap(() => ytdlp.resolveStream(youtubeId));
}

export function download(
  jobId: string,
  youtubeId: string,
  destDir: string,
): Promise<{ path: string; sizeBytes: number }> {
  return wrap(() => ytdlp.download(jobId, youtubeId, destDir));
}

export function cancel(jobId: string): void {
  ytdlp.cancel(jobId);
}

export function version(): Promise<string> {
  return wrap(() => ytdlp.version());
}

export function update(): Promise<'updated' | 'up-to-date'> {
  return wrap(() => ytdlp.update());
}

export function addProgressListener(cb: (e: ProgressEvent) => void): Subscription {
  return ytdlp.addProgressListener(cb);
}
