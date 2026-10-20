import { formatAgo, formatCounts, formatDownloadSize } from './format';

describe('formatCounts', () => {
  it('joins non-zero parts, prefixes + when asked, and says Nothing for zero', () => {
    expect(formatCounts({ songs: 12, playlists: 1 }, true)).toBe('+12 songs · 1 playlist');
    expect(formatCounts({ songs: 3, playlists: 0 }, true)).toBe('+3 songs');
    expect(formatCounts({ songs: 0, playlists: 2 }, true)).toBe('+2 playlists');
    expect(formatCounts({ songs: 1, playlists: 1 }, false)).toBe('1 song · 1 playlist');
    expect(formatCounts({ songs: 0, playlists: 0 }, true)).toBe('Nothing');
  });
});

describe('formatAgo', () => {
  const now = 10 * 86_400_000;
  it('describes how long ago', () => {
    expect(formatAgo(now - 20_000, now)).toBe('just now');
    expect(formatAgo(now - 60_000, now)).toBe('1 minute ago');
    expect(formatAgo(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(formatAgo(now - 3_600_000, now)).toBe('1 hour ago');
    expect(formatAgo(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(formatAgo(now - 86_400_000, now)).toBe('yesterday');
    expect(formatAgo(now - 2 * 86_400_000, now)).toBe('2 days ago');
    expect(formatAgo(now + 5000, now)).toBe('just now');
  });
});

describe('formatDownloadSize', () => {
  it('estimates from duration at ~160 kbps and omits when unknown', () => {
    // 2100 s * 20 kB/s = 42 MB
    expect(formatDownloadSize([{ durationSec: 2000 }, { durationSec: 100 }, { durationSec: null }])).toBe('About 42 MB');
    expect(formatDownloadSize([{ durationSec: 5 }])).toBe('About 1 MB');
    expect(formatDownloadSize([{ durationSec: null }])).toBeNull();
  });
});
