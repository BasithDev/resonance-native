import type { Db } from './types';

/** Ordered schema migrations; index + 1 is the schema version stored in `PRAGMA user_version`. */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE songs (
    youtube_id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    channel TEXT,
    duration_sec INTEGER,
    thumbnail_url TEXT,
    added_at INTEGER NOT NULL,
    download TEXT NOT NULL DEFAULT 'none',
    file_path TEXT,
    art_path TEXT,
    size_bytes INTEGER,
    download_error TEXT
  );
  CREATE INDEX songs_download ON songs(download);
  CREATE TABLE playlists (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE playlist_songs (
    playlist_id TEXT NOT NULL,
    youtube_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, youtube_id)
  );
  CREATE INDEX playlist_songs_pos ON playlist_songs(playlist_id, position);
  CREATE TABLE tombstones (
    kind TEXT NOT NULL,
    key TEXT NOT NULL,
    deleted_at INTEGER NOT NULL,
    PRIMARY KEY (kind, key)
  );
  CREATE TABLE kv (key TEXT PRIMARY KEY NOT NULL, value TEXT);
  INSERT INTO playlists (id, name, kind, created_at, updated_at) VALUES ('liked', 'Liked', 'liked', 0, 0);
  `,
];

export async function runMigrations(db: Db): Promise<void> {
  const row = await db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.tx(async () => {
      await db.exec(MIGRATIONS[v]);
      await db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
