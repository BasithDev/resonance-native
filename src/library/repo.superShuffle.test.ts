import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import { addSong, addToPlaylist, createPlaylist, migrate, superShuffleSongs, toggleLike } from './repo';

const track = (id: string) => ({
  youtubeId: id, title: id, channel: 'C', durationSec: 100, thumbnailUrl: `https://img/${id}.jpg`,
});

let db: Db;
beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
});

describe('superShuffleSongs', () => {
  it('returns each song once even if in 3 playlists, includes liked, excludes unlisted songs', async () => {
    for (const id of ['a', 'b', 'c', 'orphan']) await addSong(db, track(id));
    const p1 = await createPlaylist(db, 'One', () => 'p1');
    const p2 = await createPlaylist(db, 'Two', () => 'p2');
    const p3 = await createPlaylist(db, 'Three', () => 'p3');
    for (const p of [p1, p2, p3]) await addToPlaylist(db, p.id, 'a');
    await addToPlaylist(db, p1.id, 'b');
    await toggleLike(db, 'c');
    const ids = (await superShuffleSongs(db)).map((s) => s.youtubeId).sort();
    expect(ids).toEqual(['a', 'b', 'c']);
  });
});
