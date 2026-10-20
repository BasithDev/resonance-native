import { useCallback, useEffect, useRef, useState } from 'react';

import { getDb } from '../db/instance';
import { libraryEvents } from './events';
import { listPlaylists, listSongs } from './repo';
import type { Playlist, Song } from './types';

export type Library = {
  songs: Song[];
  playlists: Playlist[];
  /** False until the first read finishes (so screens don't flash an empty state). */
  loaded: boolean;
  refresh(): Promise<void>;
};

/** All songs (newest first) and playlists (Liked first), re-read after every `libraryEvents.emit()`. */
export function useLibrary(): Library {
  const [state, setState] = useState({ songs: [] as Song[], playlists: [] as Playlist[], loaded: false });
  const seq = useRef(0); // only the newest read may land
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    const db = await getDb();
    const [songs, playlists] = await Promise.all([listSongs(db), listPlaylists(db)]);
    if (alive.current && mine === seq.current) setState({ songs, playlists, loaded: true });
  }, []);

  useEffect(() => {
    alive.current = true;
    const load = () => refresh().catch((e) => console.warn('[library] refresh failed', e));
    load();
    const unsubscribe = libraryEvents.subscribe(load);
    return () => {
      alive.current = false;
      unsubscribe();
    };
  }, [refresh]);

  return { ...state, refresh };
}
