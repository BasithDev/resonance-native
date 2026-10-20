import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import { addSongToPlaylist, downloadSong, toggleLikeSong } from './actions';
import { libraryEvents } from './events';
import { addSong, createPlaylist, getPlaylistSongs, getSong, isLiked, migrate } from './repo';

let mockDb: Db;
const mockOnLiked = jest.fn(async (_id: string) => {});
const mockEnqueue = jest.fn(async (_ids: string[]) => {});
jest.mock('../db/instance', () => ({ getDb: () => Promise.resolve(mockDb) }));
jest.mock('../downloads/manager', () => ({
  downloads: { onLiked: (id: string) => mockOnLiked(id), enqueue: (ids: string[]) => mockEnqueue(ids) },
}));

beforeEach(async () => {
  mockOnLiked.mockClear();
  mockEnqueue.mockClear();
  mockDb = createTestDb();
  await migrate(mockDb);
  await addSong(mockDb, { youtubeId: 'a', title: 'A', channel: null, durationSec: 60, thumbnailUrl: 'https://img/a.jpg' });
});

describe('toggleLikeSong', () => {
  it('likes, asks downloads to auto-download it, then emits', async () => {
    const order: string[] = [];
    mockOnLiked.mockImplementationOnce(async () => {
      order.push('onLiked');
    });
    const off = libraryEvents.subscribe(() => order.push('emit'));
    expect(await toggleLikeSong('a')).toBe(true);
    off();
    expect(await isLiked(mockDb, 'a')).toBe(true);
    expect(mockOnLiked).toHaveBeenCalledWith('a');
    expect(order).toEqual(['onLiked', 'emit']);
  });

  it('unliking emits without queueing a download', async () => {
    await toggleLikeSong('a');
    mockOnLiked.mockClear();
    const emitted = jest.fn();
    const off = libraryEvents.subscribe(emitted);
    expect(await toggleLikeSong('a')).toBe(false);
    off();
    expect(mockOnLiked).not.toHaveBeenCalled();
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('still emits when the auto-download fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockOnLiked.mockRejectedValueOnce(new Error('boom'));
    const emitted = jest.fn();
    const off = libraryEvents.subscribe(emitted);
    expect(await toggleLikeSong('a')).toBe(true);
    off();
    expect(emitted).toHaveBeenCalledTimes(1);
    jest.restoreAllMocks();
  });
});

describe('toggleLikeSong with a song played from Search (not saved yet)', () => {
  it('saves it, puts it in Liked and asks downloads to auto-download it', async () => {
    const transient = { youtubeId: 't', title: 'T', channel: 'C', durationSec: 90, thumbnailUrl: null };
    const emitted = jest.fn();
    const off = libraryEvents.subscribe(emitted);
    expect(await toggleLikeSong(transient)).toBe(true);
    off();
    expect(await getSong(mockDb, 't')).toMatchObject({ youtubeId: 't', title: 'T' });
    expect(await isLiked(mockDb, 't')).toBe(true);
    expect(mockOnLiked).toHaveBeenCalledWith('t');
    expect(emitted).toHaveBeenCalledTimes(1);
  });
});

describe('addSongToPlaylist / downloadSong with a song played from Search', () => {
  it('addSongToPlaylist saves the song before adding it, then emits', async () => {
    const pl = await createPlaylist(mockDb, 'P', () => 'p1');
    const emitted = jest.fn();
    const off = libraryEvents.subscribe(emitted);
    await addSongToPlaylist(pl.id, { youtubeId: 't', title: 'T', channel: null, durationSec: null, thumbnailUrl: null });
    off();
    expect((await getPlaylistSongs(mockDb, 'p1')).map((s) => s.youtubeId)).toEqual(['t']);
    expect(emitted).toHaveBeenCalledTimes(1);
  });

  it('downloadSong saves the song before queueing it', async () => {
    await downloadSong({ youtubeId: 't', title: 'T', channel: null, durationSec: null, thumbnailUrl: null });
    expect(await getSong(mockDb, 't')).not.toBeNull();
    expect(mockEnqueue).toHaveBeenCalledWith(['t']);
  });
});

