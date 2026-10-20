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

/**
 * ♥ toggle. A newly liked song is queued for download when auto-download of liked songs is on.
 * Pass the song (not just its id) so one played from Search without saving joins the library.
 */
export async function toggleLikeSong(song: repo.SongRef): Promise<boolean> {
  const db = await getDb();
  const liked = await repo.toggleLike(db, song);
  try {
    if (liked) await downloads.onLiked(typeof song === 'string' ? song : song.youtubeId);
  } catch (e) {
    console.warn('[library] auto-download of a liked song failed', e);
  }
  libraryEvents.emit();
  return liked;
}

/** Adds the song to the playlist, saving it to the library first if it isn't there; then emits. */
export async function addSongToPlaylist(playlistId: string, song: repo.SongSnapshot): Promise<void> {
  await repo.addToPlaylist(await getDb(), playlistId, song);
  libraryEvents.emit();
}

/** Queues the song's download, saving it to the library first if it isn't there. */
export async function downloadSong(song: repo.SongSnapshot): Promise<void> {
  if (await repo.ensureSong(await getDb(), song)) libraryEvents.emit();
  await downloads.enqueue([song.youtubeId]);
}

/** Whether the song is in Liked songs, kept current across library writes. */
export function useIsLiked(youtubeId: string | null): boolean {
  const [state, setState] = useState<{ id: string | null; liked: boolean }>({ id: youtubeId, liked: false });
  // A new song starts unliked until its own read lands (no flash of the previous song's ♥).
  if (state.id !== youtubeId) setState({ id: youtubeId, liked: false });
  useEffect(() => {
    if (!youtubeId) return;
    let alive = true;
    const load = () =>
      getDb()
        .then((db) => repo.isLiked(db, youtubeId))
        .then((liked) => alive && setState({ id: youtubeId, liked }))
        .catch((e) => console.warn('[library] liked state failed', e));
    load();
    const off = libraryEvents.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [youtubeId]);
  return state.id === youtubeId && state.liked;
}
