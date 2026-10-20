import { NOTHING_TO_SHUFFLE, showToast } from '../components/Toast';
import { usePlayer } from './store';

/** What the Super shuffle buttons call: starts it, or tells the user nothing can play. */
export async function runSuperShuffle(): Promise<'started' | 'nothing-playable'> {
  const result = await usePlayer.getState().superShuffle();
  if (result === 'nothing-playable') showToast(NOTHING_TO_SHUFFLE);
  return result;
}
