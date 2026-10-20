export type YtTrack = {
  youtubeId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  thumbnailUrl: string;
};

export type ProgressEvent = { jobId: string; percent: number; etaSec: number };

export type YtdlpModuleEvents = {
  onProgress: (event: ProgressEvent) => void;
};

/** Codes the native side rejects with (`error.code`). */
export type YtdlpErrorCode = 'EXTRACTION_FAILED' | 'NETWORK' | 'CANCELLED';
