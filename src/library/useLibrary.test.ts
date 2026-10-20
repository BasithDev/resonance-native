import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import { createTestDb } from '../../test/sqliteAdapter';
import type { Db } from '../db/types';
import { libraryEvents } from './events';
import { addSong, createPlaylist, migrate } from './repo';
import type { YtTrack } from './types';
import { useLibrary, type Library } from './useLibrary';

let mockDb: Db;
const mockGetDb = jest.fn(() => Promise.resolve(mockDb));
jest.mock('../db/instance', () => ({ getDb: () => mockGetDb() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const track = (id: string): YtTrack => ({
  youtubeId: id, title: `Title ${id}`, channel: 'Chan', durationSec: 100, thumbnailUrl: `https://img/${id}.jpg`,
});

/** Renders the hook and exposes its latest value. */
async function renderLibrary() {
  const result: { current: Library | null } = { current: null };
  function Probe() {
    result.current = useLibrary();
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(Probe));
  });
  return { result, renderer };
}

/** Lets the async re-read settle. */
const flush = () => act(async () => {});

beforeEach(async () => {
  mockDb = createTestDb();
  await migrate(mockDb);
});

describe('useLibrary', () => {
  it('loads songs and playlists (Liked first) on mount', async () => {
    await addSong(mockDb, track('a'));
    const { result, renderer } = await renderLibrary();
    expect(result.current!.loaded).toBe(true);
    expect(result.current!.songs.map((s) => s.youtubeId)).toEqual(['a']);
    expect(result.current!.playlists.map((p) => p.id)).toEqual(['liked']);
    act(() => renderer.unmount());
  });

  it('useLibrary refreshes after libraryEvents.emit', async () => {
    const { result, renderer } = await renderLibrary();
    expect(result.current!.songs).toHaveLength(0);

    await addSong(mockDb, track('a'));
    await addSong(mockDb, track('b'));
    await createPlaylist(mockDb, 'Mix', () => 'p1');
    expect(result.current!.songs).toHaveLength(0); // no event yet

    await act(async () => libraryEvents.emit());
    await flush();
    expect(result.current!.songs).toHaveLength(2);
    expect(result.current!.playlists.map((p) => p.name)).toEqual(['Liked', 'Mix']);
    act(() => renderer.unmount());
  });

  it('refresh() re-reads on demand', async () => {
    const { result, renderer } = await renderLibrary();
    await addSong(mockDb, track('a'));
    await act(() => result.current!.refresh());
    expect(result.current!.songs).toHaveLength(1);
    act(() => renderer.unmount());
  });

  it('stops re-reading after unmount', async () => {
    mockGetDb.mockClear();
    const { renderer } = await renderLibrary();
    await act(async () => libraryEvents.emit());
    expect(mockGetDb).toHaveBeenCalledTimes(2); // mount + emit
    act(() => renderer.unmount());
    await act(async () => libraryEvents.emit());
    expect(mockGetDb).toHaveBeenCalledTimes(2); // no read once unmounted
  });
});
