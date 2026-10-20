// One definition, owned by the yt-dlp module (type-only: no native import at runtime).
export type { YtTrack } from '../../modules/ytdlp';

export type DownloadState = 'none' | 'queued' | 'downloading' | 'done' | 'failed';

export type Song = {
  youtubeId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  addedAt: number;
  download: DownloadState;
  filePath: string | null;
  artPath: string | null;
  sizeBytes: number | null;
  downloadError: string | null;
};

export type Playlist = {
  id: string;
  name: string;
  kind: 'user' | 'liked';
  createdAt: number;
  updatedAt: number;
  songCount: number;
  downloadedCount: number;
  coverUrl: string | null;
};

export type Tombstone = {
  kind: 'song' | 'playlist' | 'membership';
  key: string;
  deletedAt: number;
};
