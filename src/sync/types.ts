// Sync contract shared with the backend (copied verbatim from the plan).
export type SyncSong = {
  youtubeId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
  addedAt: number;
};
export type SyncPlaylist = {
  id: string;
  name: string;
  kind: 'user' | 'liked';
  updatedAt: number;
  songs: string[];
};
export type Deletion = {
  kind: 'song' | 'playlist' | 'membership';
  key: string;
  deletedAt: number;
};
export type Listen = { youtubeId: string; durationSec: number; playedAt: number };
export type SyncRequest = {
  v: 1;
  lastSyncAt: number | null;
  songs: SyncSong[];
  playlists: SyncPlaylist[];
  deletions: Deletion[];
  listens: Listen[];
};
export type SyncSummary = {
  toPhone: { songs: number; playlists: number };
  fromPhone: { songs: number; playlists: number };
  removed: { songs: number; playlists: number };
};
export type SyncResponse = {
  serverTime: number;
  songs: SyncSong[];
  playlists: SyncPlaylist[];
  summary: SyncSummary;
};

export type SyncErrorKind = 'expired' | 'unreachable' | 'bad-qr' | 'server';

export class SyncError extends Error {
  readonly kind: SyncErrorKind;
  constructor(kind: SyncErrorKind, message: string) {
    super(message);
    this.name = 'SyncError';
    this.kind = kind;
  }
}

export const EXPIRED_MESSAGE = 'This code has expired — tap Sync on the web again';
export const UNREACHABLE_MESSAGE = "Can't reach your computer — check both are on the same Wi-Fi";
