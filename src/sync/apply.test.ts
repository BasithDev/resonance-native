import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import {
  addSong, addToPlaylist, createPlaylist, exportForSync, getPlaylistSongs, listPlaylists,
  listSongs, listTombstones, migrate, removeSong, setDownload, toggleLike,
  replaceLibrary,
} from '../library/repo';
import type { YtTrack } from '../library/types';
import type { SyncSong } from './types';

const track = (id: string): YtTrack => ({
  youtubeId: id, title: `T ${id}`, channel: 'C', durationSec: 10, thumbnailUrl: `u/${id}`,
});
const ssong = (id: string, title = `S ${id}`): SyncSong => ({
  youtubeId: id, title, channel: null, durationSec: null, thumbnailUrl: null, addedAt: 5,
});

let db: Db;
beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
});

describe('exportForSync', () => {
  it("includes liked playlist with id 'liked' and tombstones as deletions", async () => {
    await addSong(db, track('a'));
    await addSong(db, track('b'));
    await toggleLike(db, 'a');
    const pl = await createPlaylist(db, 'Mix', () => 'mix');
    await addToPlaylist(db, pl.id, 'b');
    await addToPlaylist(db, pl.id, 'a');
    await removeSong(db, 'b');

    const out = await exportForSync(db);
    expect(out.songs.map((s) => s.youtubeId)).toEqual(['a']);
    const liked = out.playlists.find((p) => p.kind === 'liked')!;
    expect(liked.id).toBe('liked');
    expect(liked.songs).toEqual(['a']);
    expect(out.playlists.find((p) => p.id === pl.id)!.songs).toEqual(['a']);
    expect(out.deletions).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'song', key: 'b' })]),
    );
    expect(out.deletions).toEqual(await listTombstones(db));
  });
});

describe('replaceLibrary', () => {
  it('makes local library equal response and returns removed song ids', async () => {
    await addSong(db, track('a'));
    await addSong(db, track('gone'));
    await setDownload(db, 'a', { download: 'done', filePath: '/f/a.m4a', sizeBytes: 9 });
    const old = await createPlaylist(db, 'Old', () => 'old');
    await addToPlaylist(db, old.id, 'a');
    await toggleLike(db, 'gone');
    const tombstonesBefore = await listTombstones(db);

    const res = await replaceLibrary(
      db,
      [ssong('a', 'Renamed'), ssong('new')],
      [
        { id: 'liked', name: 'Liked', kind: 'liked', updatedAt: 7, songs: ['new', 'a'] },
        { id: 'p2', name: 'Fresh', kind: 'user', updatedAt: 8, songs: ['a', 'new'] },
      ],
    );

    expect(res.removedSongIds).toEqual(['gone']);
    const songs = await listSongs(db);
    expect(songs.map((s) => s.youtubeId).sort()).toEqual(['a', 'new']);
    const a = songs.find((s) => s.youtubeId === 'a')!;
    expect(a).toMatchObject({ title: 'Renamed', download: 'done', filePath: '/f/a.m4a', sizeBytes: 9 });
    expect(songs.find((s) => s.youtubeId === 'new')!.download).toBe('none');

    const pls = await listPlaylists(db);
    expect(pls.map((p) => p.id)).toEqual(['liked', 'p2']);
    expect(pls[0].kind).toBe('liked');
    expect((await getPlaylistSongs(db, 'liked')).map((s) => s.youtubeId)).toEqual(['new', 'a']);
    expect((await getPlaylistSongs(db, 'p2')).map((s) => s.youtubeId)).toEqual(['a', 'new']);
    expect(await listTombstones(db)).toEqual(tombstonesBefore);
  });

  it('never deletes the Liked playlist', async () => {
    await replaceLibrary(db, [], []);
    expect((await listPlaylists(db)).map((p) => p.id)).toEqual(['liked']);
  });
});
