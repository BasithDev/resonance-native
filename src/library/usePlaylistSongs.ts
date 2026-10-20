import { useEffect, useState } from 'react';

import { getDb } from '../db/instance';
import { libraryEvents } from './events';
import { getPlaylistSongs } from './repo';
import type { Song } from './types';

/**
 * The playlist's songs in order (null until first read), re-read after every
 * `libraryEvents.emit()`. The setter lets a screen show a new order before it is saved.
 */
export function usePlaylistSongs(id: string) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  useEffect(() => {
    let alive = true;
    let seq = 0; // only the newest read may land
    const load = () => {
      const mine = ++seq;
      getDb()
        .then((db) => getPlaylistSongs(db, id))
        .then((s) => {
          if (alive && mine === seq) setSongs(s);
        })
        .catch((e) => console.warn('[playlist] load failed', e));
    };
    load();
    const off = libraryEvents.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [id]);
  return [songs, setSongs] as const;
}
