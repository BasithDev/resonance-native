import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import { toggleLikeSong } from './actions';
import { libraryEvents } from './events';
import { addSong, isLiked, migrate } from './repo';

let mockDb: Db;
const mockOnLiked = jest.fn(async (_id: string) => {});
jest.mock('../db/instance', () => ({ getDb: () => Promise.resolve(mockDb) }));
jest.mock('../downloads/manager', () => ({ downloads: { onLiked: (id: string) => mockOnLiked(id) } }));

beforeEach(async () => {
  mockOnLiked.mockClear();
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
