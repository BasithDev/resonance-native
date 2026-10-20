import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import {
  addSong, addToPlaylist, createPlaylist, deletePlaylist, getPlaylistSongs, getSong, isLiked,
  listByDownload, listPlaylists, listSongs, listTombstones, migrate, removeFromPlaylist,
  removeSong, renamePlaylist, reorderPlaylist, resetInterruptedDownloads, setDownload, toggleLike,
} from './repo';
import type { YtTrack } from './types';

const track = (id: string, title = `Title ${id}`): YtTrack => ({
  youtubeId: id, title, channel: 'Chan', durationSec: 100, thumbnailUrl: `https://img/${id}.jpg`,
});

let db: Db;
let clock: number;
beforeEach(async () => {
  clock = 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => ++clock);
  db = createTestDb();
  await migrate(db);
});
afterEach(() => jest.restoreAllMocks());

describe('library repo', () => {
  it('addSong is idempotent by youtubeId', async () => {
    const first = await addSong(db, track('a', 'One'));
    const second = await addSong(db, track('a', 'Two'));
    expect(await listSongs(db)).toHaveLength(1);
    expect(second.title).toBe('Two');
    expect(second.addedAt).toBe(first.addedAt);
  });

  it('listSongs is newest first', async () => {
    await addSong(db, track('a'));
    await addSong(db, track('b'));
    expect((await listSongs(db)).map((s) => s.youtubeId)).toEqual(['b', 'a']);
  });

  it("liked playlist exists after migrate with id 'liked'", async () => {
    const lists = await listPlaylists(db);
    expect(lists[0]).toMatchObject({ id: 'liked', kind: 'liked' });
  });

  it('migrate is re-runnable', async () => {
    await migrate(db);
    expect(await listPlaylists(db)).toHaveLength(1);
  });

  it('toggleLike adds to and removes from liked', async () => {
    await addSong(db, track('a'));
    expect(await toggleLike(db, 'a')).toBe(true);
    expect(await isLiked(db, 'a')).toBe(true);
    expect(await getPlaylistSongs(db, 'liked')).toHaveLength(1);
    expect(await toggleLike(db, 'a')).toBe(false);
    expect(await getPlaylistSongs(db, 'liked')).toHaveLength(0);
    expect(await listTombstones(db)).toContainEqual(
      expect.objectContaining({ kind: 'membership', key: 'liked:a' }),
    );
  });

  it('removeSong deletes memberships and writes a song tombstone', async () => {
    await addSong(db, track('a'));
    const p = await createPlaylist(db, 'P', () => 'p1');
    await addToPlaylist(db, p.id, 'a');
    await toggleLike(db, 'a');
    const removed = await removeSong(db, 'a');
    expect(removed?.youtubeId).toBe('a');
    expect(await getSong(db, 'a')).toBeNull();
    expect(await getPlaylistSongs(db, 'p1')).toHaveLength(0);
    expect(await getPlaylistSongs(db, 'liked')).toHaveLength(0);
    expect(await listTombstones(db)).toContainEqual(
      expect.objectContaining({ kind: 'song', key: 'a' }),
    );
    expect(await removeSong(db, 'a')).toBeNull();
  });

  it('deletePlaylist writes a playlist tombstone; liked cannot be deleted', async () => {
    const p = await createPlaylist(db, 'P', () => 'p1');
    await deletePlaylist(db, p.id);
    expect((await listPlaylists(db)).map((x) => x.id)).toEqual(['liked']);
    expect(await listTombstones(db)).toContainEqual(
      expect.objectContaining({ kind: 'playlist', key: 'p1' }),
    );
    await expect(deletePlaylist(db, 'liked')).rejects.toThrow();
    expect((await listPlaylists(db))[0].id).toBe('liked');
  });

  it('renamePlaylist renames user playlists; the Liked playlist cannot be renamed', async () => {
    await createPlaylist(db, 'P', () => 'p1');
    await renamePlaylist(db, 'p1', 'Q');
    expect((await listPlaylists(db)).find((x) => x.id === 'p1')?.name).toBe('Q');
    await expect(renamePlaylist(db, 'liked', 'Nope')).rejects.toThrow('The Liked playlist cannot be renamed');
    expect((await listPlaylists(db))[0].name).toBe('Liked');
  });

  it('removeFromPlaylist writes membership tombstone key "<playlistId>:<youtubeId>"', async () => {
    await addSong(db, track('a'));
    await createPlaylist(db, 'P', () => 'p1');
    await addToPlaylist(db, 'p1', 'a');
    await removeFromPlaylist(db, 'p1', 'a');
    expect(await getPlaylistSongs(db, 'p1')).toHaveLength(0);
    expect(await listTombstones(db)).toContainEqual(
      expect.objectContaining({ kind: 'membership', key: 'p1:a' }),
    );
  });

  it('addToPlaylist appends at the end and ignores duplicates; reorderPlaylist persists order', async () => {
    for (const id of ['a', 'b', 'c']) await addSong(db, track(id));
    await createPlaylist(db, 'P', () => 'p1');
    for (const id of ['a', 'b', 'c', 'a']) await addToPlaylist(db, 'p1', id);
    expect((await getPlaylistSongs(db, 'p1')).map((s) => s.youtubeId)).toEqual(['a', 'b', 'c']);
    await reorderPlaylist(db, 'p1', ['c', 'a', 'b']);
    expect((await getPlaylistSongs(db, 'p1')).map((s) => s.youtubeId)).toEqual(['c', 'a', 'b']);
  });

  it('playlist changes bump updatedAt and rename works', async () => {
    await addSong(db, track('a'));
    await addSong(db, track('b'));
    const created = await createPlaylist(db, 'P', () => 'p1');
    const updated = async () => (await listPlaylists(db)).find((p) => p.id === 'p1')!.updatedAt;
    let prev = created.updatedAt;
    for (const step of [
      () => addToPlaylist(db, 'p1', 'a'),
      () => addToPlaylist(db, 'p1', 'b'),
      () => reorderPlaylist(db, 'p1', ['b', 'a']),
      () => removeFromPlaylist(db, 'p1', 'a'),
      () => renamePlaylist(db, 'p1', 'Renamed'),
    ]) {
      await step();
      const cur = await updated();
      expect(cur).toBeGreaterThan(prev);
      prev = cur;
    }
    expect((await listPlaylists(db)).find((p) => p.id === 'p1')?.name).toBe('Renamed');
  });

  it('listPlaylists counts downloadedCount from download=done and gives a cover', async () => {
    await addSong(db, track('a'));
    await addSong(db, track('b'));
    await createPlaylist(db, 'P', () => 'p1');
    await addToPlaylist(db, 'p1', 'a');
    await addToPlaylist(db, 'p1', 'b');
    await setDownload(db, 'a', { download: 'done', filePath: '/f/a.webm', sizeBytes: 5 });
    const p = (await listPlaylists(db)).find((x) => x.id === 'p1')!;
    expect(p).toMatchObject({ songCount: 2, downloadedCount: 1, coverUrl: 'https://img/a.jpg' });
    expect(await getSong(db, 'a')).toMatchObject({ download: 'done', filePath: '/f/a.webm', sizeBytes: 5 });
  });

  it('resetInterruptedDownloads moves downloading to queued and returns them', async () => {
    await addSong(db, track('a'));
    await addSong(db, track('b'));
    await setDownload(db, 'a', { download: 'downloading' });
    await setDownload(db, 'b', { download: 'done' });
    const reset = await resetInterruptedDownloads(db);
    expect(reset.map((s) => [s.youtubeId, s.download])).toEqual([['a', 'queued']]);
    expect((await getSong(db, 'a'))?.download).toBe('queued');
    expect((await listByDownload(db, ['queued'])).map((s) => s.youtubeId)).toEqual(['a']);
    expect((await getSong(db, 'b'))?.download).toBe('done');
  });

  it('re-adding a removed song clears its tombstone', async () => {
    await addSong(db, track('a'));
    await removeSong(db, 'a');
    await addSong(db, track('a'));
    expect(await listTombstones(db)).toEqual([]);
  });
});

describe('songs not yet in the library (played from Search)', () => {
  it('toggleLike with a track snapshot saves the song and likes it in one go', async () => {
    expect(await toggleLike(db, track('t'))).toBe(true);
    expect(await getSong(db, 't')).toMatchObject({ youtubeId: 't', title: 'Title t', download: 'none' });
    expect((await getPlaylistSongs(db, 'liked')).map((s) => s.youtubeId)).toEqual(['t']);
  });

  it('addToPlaylist with a track snapshot saves the song and supersedes its old tombstone', async () => {
    await addSong(db, track('t'));
    await removeSong(db, 't');
    await createPlaylist(db, 'P', () => 'p1');
    await addToPlaylist(db, 'p1', track('t'));
    expect((await getPlaylistSongs(db, 'p1')).map((s) => s.youtubeId)).toEqual(['t']);
    expect(await listTombstones(db)).not.toContainEqual(expect.objectContaining({ kind: 'song', key: 't' }));
  });

  it('a track snapshot never overwrites a library song', async () => {
    await addSong(db, track('a', 'Saved'));
    await setDownload(db, 'a', { download: 'done', filePath: '/f/a.m4a' });
    await toggleLike(db, track('a', 'Stale'));
    expect(await getSong(db, 'a')).toMatchObject({ title: 'Saved', download: 'done', filePath: '/f/a.m4a' });
  });

  it('refuses to write a membership for an unknown song id (no orphan rows)', async () => {
    await createPlaylist(db, 'P', () => 'p1');
    await expect(toggleLike(db, 'ghost')).rejects.toThrow();
    await expect(addToPlaylist(db, 'p1', 'ghost')).rejects.toThrow();
    expect(await getPlaylistSongs(db, 'liked')).toEqual([]);
    expect(await db.all('SELECT * FROM playlist_songs')).toEqual([]);
  });
});
