import { NO_PLAYLIST_SONGS, NOTHING_TO_SHUFFLE, showToast } from '../components/Toast';
import { getConnectivity } from '../net/connectivity';
import { usePlayer } from './store';

/** What the Super shuffle buttons call: starts it, or tells the user why nothing can play. */
export async function runSuperShuffle(): Promise<'started' | 'nothing-playable'> {
  const result = await usePlayer.getState().superShuffle();
  // Online every playlist song can stream, so nothing playable means no playlist songs at all.
  if (result === 'nothing-playable') showToast(getConnectivity().online ? NO_PLAYLIST_SONGS : NOTHING_TO_SHUFFLE);
  return result;
}
