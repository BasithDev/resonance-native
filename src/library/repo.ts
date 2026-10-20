import { randomUUID } from 'expo-crypto';

import { runMigrations } from '../db/migrations';
import type { Db } from '../db/types';
import type { DownloadState, Playlist, Song, Tombstone, YtTrack } from './types';

const LIKED_ID = 'liked';

type SongRow = {
  youtube_id: string;
  title: string;
  channel: string | null;
  duration_sec: number | null;
  thumbnail_url: string | null;
  added_at: number;
  download: DownloadState;
  file_path: string | null;
  art_path: string | null;
  size_bytes: number | null;
  download_error: string | null;
};

type PlaylistRow = {
  id: string;
  name: string;
  kind: 'user' | 'liked';
  created_at: number;
  updated_at: number;
  song_count: number;
  downloaded_count: number;
  cover_url: string | null;
};

const toSong = (r: SongRow): Song => ({
  youtubeId: r.youtube_id,
  title: r.title,
  channel: r.channel,
  durationSec: r.duration_sec,
  thumbnailUrl: r.thumbnail_url,
  addedAt: r.added_at,
  download: r.download,
  filePath: r.file_path,
  artPath: r.art_path,
  sizeBytes: r.size_bytes,
  downloadError: r.download_error,
});

const toPlaylist = (r: PlaylistRow): Playlist => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  songCount: r.song_count,
  downloadedCount: r.downloaded_count,
  coverUrl: r.cover_url,
});

const now = () => Date.now();

export function migrate(db: Db): Promise<void> {
  return runMigrations(db);
}

export async function getSong(db: Db, id: string): Promise<Song | null> {
  const r = await db.first<SongRow>('SELECT * FROM songs WHERE youtube_id = ?', [id]);
  return r ? toSong(r) : null;
}

export async function listSongs(db: Db): Promise<Song[]> {
  const rows = await db.all<SongRow>('SELECT * FROM songs ORDER BY added_at DESC, rowid DESC');
  return rows.map(toSong);
}

/** Idempotent upsert by youtubeId; addedAt is stamped only on first insert. */
export async function addSong(db: Db, t: YtTrack): Promise<Song> {
  await db.tx(async () => {
    await db.run(
      `INSERT INTO songs (youtube_id, title, channel, duration_sec, thumbnail_url, added_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(youtube_id) DO UPDATE SET
         title = excluded.title, channel = excluded.channel,
         duration_sec = excluded.duration_sec, thumbnail_url = excluded.thumbnail_url`,
      [t.youtubeId, t.title, t.channel, t.durationSec, t.thumbnailUrl, now()],
    );
    // Re-adding supersedes an earlier deletion, so sync must not delete it again.
    await db.run("DELETE FROM tombstones WHERE kind = 'song' AND key = ?", [t.youtubeId]);
  });
  return (await getSong(db, t.youtubeId))!;
}

export async function removeSong(db: Db, id: string): Promise<Song | null> {
  const song = await getSong(db, id);
  if (!song) return null;
  const ts = now();
  await db.tx(async () => {
    await db.run(
      `UPDATE playlists SET updated_at = ? WHERE id IN
         (SELECT playlist_id FROM playlist_songs WHERE youtube_id = ?)`,
      [ts, id],
    );
    await db.run('DELETE FROM playlist_songs WHERE youtube_id = ?', [id]);
    await db.run('DELETE FROM songs WHERE youtube_id = ?', [id]);
    await db.run(
      "INSERT OR REPLACE INTO tombstones (kind, key, deleted_at) VALUES ('song', ?, ?)",
      [id, ts],
    );
  });
  return song;
}

const PLAYLIST_SELECT = `
  SELECT p.id, p.name, p.kind, p.created_at, p.updated_at,
    (SELECT COUNT(*) FROM playlist_songs ps WHERE ps.playlist_id = p.id) AS song_count,
    (SELECT COUNT(*) FROM playlist_songs ps JOIN songs s ON s.youtube_id = ps.youtube_id
       WHERE ps.playlist_id = p.id AND s.download = 'done') AS downloaded_count,
    (SELECT s.thumbnail_url FROM playlist_songs ps JOIN songs s ON s.youtube_id = ps.youtube_id
       WHERE ps.playlist_id = p.id ORDER BY ps.position LIMIT 1) AS cover_url
  FROM playlists p`;

async function getPlaylist(db: Db, id: string): Promise<Playlist> {
  const r = await db.first<PlaylistRow>(`${PLAYLIST_SELECT} WHERE p.id = ?`, [id]);
  if (!r) throw new Error(`Playlist not found: ${id}`);
  return toPlaylist(r);
}

export async function createPlaylist(
  db: Db,
  name: string,
  newId: () => string = randomUUID,
): Promise<Playlist> {
  const id = newId();
  const ts = now();
  await db.run(
    "INSERT INTO playlists (id, name, kind, created_at, updated_at) VALUES (?, ?, 'user', ?, ?)",
    [id, name, ts, ts],
  );
  return getPlaylist(db, id);
}

export async function renamePlaylist(db: Db, id: string, name: string): Promise<void> {
  await db.run('UPDATE playlists SET name = ?, updated_at = ? WHERE id = ?', [name, now(), id]);
}

export async function deletePlaylist(db: Db, id: string): Promise<void> {
  if (id === LIKED_ID) throw new Error('The Liked playlist cannot be deleted');
  await db.tx(async () => {
    await db.run('DELETE FROM playlist_songs WHERE playlist_id = ?', [id]);
    await db.run('DELETE FROM playlists WHERE id = ?', [id]);
    await db.run(
      "INSERT OR REPLACE INTO tombstones (kind, key, deleted_at) VALUES ('playlist', ?, ?)",
      [id, now()],
    );
  });
}

export async function listPlaylists(db: Db): Promise<Playlist[]> {
  const rows = await db.all<PlaylistRow>(
    `${PLAYLIST_SELECT} ORDER BY (p.kind = 'liked') DESC, p.created_at, p.rowid`,
  );
  return rows.map(toPlaylist);
}

export async function getPlaylistSongs(db: Db, id: string): Promise<Song[]> {
  const rows = await db.all<SongRow>(
    `SELECT s.* FROM playlist_songs ps JOIN songs s ON s.youtube_id = ps.youtube_id
     WHERE ps.playlist_id = ? ORDER BY ps.position`,
    [id],
  );
  return rows.map(toSong);
}

// Non-transactional building blocks so toggleLike can compose them inside one tx
// (tx is not nestable).
async function insertMembership(db: Db, playlistId: string, youtubeId: string): Promise<void> {
  const ts = now();
  const row = await db.first<{ next: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM playlist_songs WHERE playlist_id = ?',
    [playlistId],
  );
  await db.run(
    'INSERT OR IGNORE INTO playlist_songs (playlist_id, youtube_id, position, added_at) VALUES (?, ?, ?, ?)',
    [playlistId, youtubeId, row?.next ?? 0, ts],
  );
  // Re-adding supersedes an earlier removal.
  await db.run("DELETE FROM tombstones WHERE kind = 'membership' AND key = ?", [
    `${playlistId}:${youtubeId}`,
  ]);
  await db.run('UPDATE playlists SET updated_at = ? WHERE id = ?', [ts, playlistId]);
}

async function deleteMembership(db: Db, playlistId: string, youtubeId: string): Promise<void> {
  const ts = now();
  await db.run('DELETE FROM playlist_songs WHERE playlist_id = ? AND youtube_id = ?', [
    playlistId,
    youtubeId,
  ]);
  await db.run(
    "INSERT OR REPLACE INTO tombstones (kind, key, deleted_at) VALUES ('membership', ?, ?)",
    [`${playlistId}:${youtubeId}`, ts],
  );
  await db.run('UPDATE playlists SET updated_at = ? WHERE id = ?', [ts, playlistId]);
}

export async function addToPlaylist(db: Db, playlistId: string, youtubeId: string): Promise<void> {
  await db.tx(() => insertMembership(db, playlistId, youtubeId));
}

export async function removeFromPlaylist(
  db: Db,
  playlistId: string,
  youtubeId: string,
): Promise<void> {
  await db.tx(() => deleteMembership(db, playlistId, youtubeId));
}

export async function reorderPlaylist(db: Db, id: string, youtubeIds: string[]): Promise<void> {
  await db.tx(async () => {
    for (let i = 0; i < youtubeIds.length; i++) {
      await db.run(
        'UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND youtube_id = ?',
        [i, id, youtubeIds[i]],
      );
    }
    await db.run('UPDATE playlists SET updated_at = ? WHERE id = ?', [now(), id]);
  });
}

export async function isLiked(db: Db, youtubeId: string): Promise<boolean> {
  const r = await db.first(
    'SELECT 1 AS x FROM playlist_songs WHERE playlist_id = ? AND youtube_id = ?',
    [LIKED_ID, youtubeId],
  );
  return r !== null;
}

/** Returns the new liked state. */
export async function toggleLike(db: Db, youtubeId: string): Promise<boolean> {
  let liked = false;
  await db.tx(async () => {
    if (await isLiked(db, youtubeId)) {
      await deleteMembership(db, LIKED_ID, youtubeId);
    } else {
      await insertMembership(db, LIKED_ID, youtubeId);
      liked = true;
    }
  });
  return liked;
}

const PATCH_COLUMNS = {
  download: 'download',
  filePath: 'file_path',
  artPath: 'art_path',
  sizeBytes: 'size_bytes',
  downloadError: 'download_error',
} as const;

export async function setDownload(
  db: Db,
  id: string,
  patch: Partial<Pick<Song, keyof typeof PATCH_COLUMNS>>,
): Promise<void> {
  const keys = (Object.keys(PATCH_COLUMNS) as (keyof typeof PATCH_COLUMNS)[]).filter(
    (k) => k in patch,
  );
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${PATCH_COLUMNS[k]} = ?`).join(', ');
  await db.run(`UPDATE songs SET ${sets} WHERE youtube_id = ?`, [
    ...keys.map((k) => patch[k] ?? null),
    id,
  ]);
}

export async function listByDownload(db: Db, states: DownloadState[]): Promise<Song[]> {
  if (states.length === 0) return [];
  const marks = states.map(() => '?').join(', ');
  const rows = await db.all<SongRow>(
    `SELECT * FROM songs WHERE download IN (${marks}) ORDER BY added_at, rowid`,
    states,
  );
  return rows.map(toSong);
}

/** Songs left in 'downloading' by a killed app go back to 'queued'; returns them. */
export async function resetInterruptedDownloads(db: Db): Promise<Song[]> {
  const interrupted = await listByDownload(db, ['downloading']);
  if (interrupted.length > 0) {
    await db.run("UPDATE songs SET download = 'queued' WHERE download = 'downloading'");
  }
  return interrupted.map((s) => ({ ...s, download: 'queued' as const }));
}

export async function listTombstones(db: Db): Promise<Tombstone[]> {
  const rows = await db.all<{ kind: Tombstone['kind']; key: string; deleted_at: number }>(
    'SELECT kind, key, deleted_at FROM tombstones ORDER BY deleted_at, rowid',
  );
  return rows.map((r) => ({ kind: r.kind, key: r.key, deletedAt: r.deleted_at }));
}
