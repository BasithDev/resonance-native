type Counts = { songs: number; playlists: number };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "+12 songs · 1 playlist"; zero parts are left out, all-zero is "Nothing". */
export function formatCounts(c: Counts, plus: boolean): string {
  const parts: string[] = [];
  if (c.songs > 0) parts.push(plural(c.songs, 'song'));
  if (c.playlists > 0) parts.push(plural(c.playlists, 'playlist'));
  if (parts.length === 0) return 'Nothing';
  return `${plus ? '+' : ''}${parts.join(' · ')}`;
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "5 minutes ago", "yesterday", "3 days ago". */
export function formatAgo(t: number, now: number): string {
  const d = now - t;
  if (d < MIN) return 'just now';
  if (d < HOUR) return `${plural(Math.floor(d / MIN), 'minute')} ago`;
  if (d < DAY) return `${plural(Math.floor(d / HOUR), 'hour')} ago`;
  if (d < 2 * DAY) return 'yesterday';
  return `${Math.floor(d / DAY)} days ago`;
}

/** Downloads are ≈160 kbps audio, i.e. about 20 kB per second. */
const BYTES_PER_SEC = 20_000;

/** "About 42 MB" from the songs' durations; null when no duration is known. */
export function formatDownloadSize(songs: { durationSec: number | null }[]): string | null {
  const sec = songs.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
  if (sec <= 0) return null;
  return `About ${Math.max(1, Math.round((sec * BYTES_PER_SEC) / 1e6))} MB`;
}
