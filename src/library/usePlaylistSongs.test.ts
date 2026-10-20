import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import { libraryEvents } from './events';
import { addSong, migrate, toggleLike } from './repo';
import type { Song } from './types';
import { usePlaylistSongs } from './usePlaylistSongs';

let mockDb: Db;
const mockGetDb = jest.fn(() => Promise.resolve(mockDb));
jest.mock('../db/instance', () => ({ getDb: () => mockGetDb() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(id: string) {
  const result: { current: Song[] | null } = { current: null };
  function Probe() {
    result.current = usePlaylistSongs(id)[0];
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(Probe));
  });
  return { result, renderer };
}

beforeEach(async () => {
  mockGetDb.mockClear();
  mockDb = createTestDb();
  await migrate(mockDb);
  await addSong(mockDb, { youtubeId: 'a', title: 'A', channel: null, durationSec: 60, thumbnailUrl: 'https://img/a.jpg' });
});

describe('usePlaylistSongs', () => {
  it("loads the playlist's songs and re-reads after libraryEvents.emit", async () => {
    const { result, renderer } = await render('liked');
    expect(result.current).toEqual([]);
    await toggleLike(mockDb, 'a');
    await act(async () => libraryEvents.emit());
    expect(result.current!.map((s) => s.youtubeId)).toEqual(['a']);
    act(() => renderer.unmount());
  });

  it('logs a failed read instead of hiding it', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetDb.mockRejectedValueOnce(new Error('db gone'));
    const { result, renderer } = await render('liked');
    expect(result.current).toBeNull();
    expect(warn).toHaveBeenCalledWith('[playlist] load failed', expect.any(Error));
    warn.mockRestore();
    act(() => renderer.unmount());
  });

  it('stops re-reading after unmount', async () => {
    const { renderer } = await render('liked');
    act(() => renderer.unmount());
    const before = mockGetDb.mock.calls.length;
    await act(async () => libraryEvents.emit());
    expect(mockGetDb.mock.calls.length).toBe(before);
  });
});
