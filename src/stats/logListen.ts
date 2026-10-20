import { getDb } from '../db/instance';
import { log } from './listens';

/** Fire-and-forget write to the local listens table; works offline. */
export function logListen(youtubeId: string, durationSec: number, playedAt: number, playStart = false): void {
  getDb()
    .then((db) => log(db, youtubeId, durationSec, playedAt, playStart))
    .catch(() => {});
}
