/** Library writes shared by several screens (each one emits `libraryEvents` afterwards). */
import { useEffect, useState } from 'react';

import { getDb } from '../db/instance';
import { downloads } from '../downloads/manager';
import { libraryEvents } from './events';
import * as repo from './repo';
import type { Playlist } from './types';

/** What the user sees for a playlist (the Liked playlist is "Liked songs"). */
export function playlistName(p: Pick<Playlist, 'kind' | 'name'>): string {
  return p.kind === 'liked' ? 'Liked songs' : p.name;
}

/** ♥ toggle. A newly liked song is queued for download when auto-download of liked songs is on. */
export async function toggleLikeSong(youtubeId: string): Promise<boolean> {
  const db = await getDb();
  const liked = await repo.toggleLike(db, youtubeId);
  try {
    if (liked) await downloads.onLiked(youtubeId);
  } catch (e) {
    console.warn('[library] auto-download of a liked song failed', e);
  }
  libraryEvents.emit();
  return liked;
}

/** Whether the song is in Liked songs, kept current across library writes. */
export function useIsLiked(youtubeId: string | null): boolean {
  const [liked, setLiked] = useState(false);
  useEffect(() => {
    if (!youtubeId) {
      setLiked(false);
      return;
    }
    let alive = true;
    const load = () =>
      getDb()
        .then((db) => repo.isLiked(db, youtubeId))
        .then((v) => alive && setLiked(v))
        .catch(() => {});
    load();
    const off = libraryEvents.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [youtubeId]);
  return liked;
}
