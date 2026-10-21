import { createTestDb } from '../../test/sqliteAdapter';
import { migrate } from '../library/repo';
import {
  CHECK_INTERVAL_MS,
  checkForUpdate,
  compareVersions,
  fetchLatestRelease,
  getLastCheckAt,
  parseRelease,
  pickApkUrl,
  RELEASES_PAGE,
  setLastCheckAt,
  shouldAutoCheck,
} from './check';

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  body: '### Player\n- Faster',
  html_url: `https://github.com/BasithDev/resonance-native/releases/tag/${tag}`,
  assets: [{ name: `resonance-${tag}.apk`, browser_download_url: `https://dl/resonance-${tag}.apk` }],
  ...extra,
});

function fakeFetch(status: number, body: unknown = {}) {
  return jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })) as unknown as typeof fetch;
}

async function freshDb() {
  const db = createTestDb();
  await migrate(db);
  return db;
}

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(compareVersions('1.0.10', '1.0.9')).toBeGreaterThan(0);
    expect(compareVersions('1.2.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('ignores a leading v and treats missing parts as 0', () => {
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('V1.0.1', '1.0')).toBeGreaterThan(0);
  });
});

describe('pickApkUrl', () => {
  it('returns the APK asset, preferring the resonance-named one', () => {
    expect(
      pickApkUrl([
        { name: 'checksums.txt', browser_download_url: 'https://dl/sum' },
        { name: 'other.apk', browser_download_url: 'https://dl/other.apk' },
        { name: 'Resonance-v1.1.0.APK', browser_download_url: 'https://dl/res.apk' },
      ]),
    ).toBe('https://dl/res.apk');
    expect(pickApkUrl([{ name: 'app-release.apk', browser_download_url: 'https://dl/a.apk' }])).toBe('https://dl/a.apk');
  });

  it('returns null without an APK or with malformed assets', () => {
    expect(pickApkUrl([{ name: 'notes.txt', browser_download_url: 'https://dl/n' }])).toBeNull();
    expect(pickApkUrl([{ name: 'x.apk' }, null])).toBeNull();
    expect(pickApkUrl(undefined)).toBeNull();
  });
});

describe('parseRelease', () => {
  it('maps the GitHub release JSON', () => {
    expect(parseRelease(release('v1.1.0'))).toEqual({
      version: '1.1.0',
      notes: '### Player\n- Faster',
      apkUrl: 'https://dl/resonance-v1.1.0.apk',
      pageUrl: 'https://github.com/BasithDev/resonance-native/releases/tag/v1.1.0',
    });
  });

  it('falls back to the releases page and empty notes; rejects tags that are not versions', () => {
    expect(parseRelease({ tag_name: 'v2.0.0', assets: [] })).toEqual({ version: '2.0.0', notes: '', apkUrl: null, pageUrl: RELEASES_PAGE });
    expect(parseRelease({ tag_name: 'nightly' })).toBeNull();
    expect(parseRelease(null)).toBeNull();
  });
});

describe('shouldAutoCheck', () => {
  const now = 1_000_000_000_000;
  it('checks when never checked or 24 h have passed', () => {
    expect(shouldAutoCheck(null, now)).toBe(true);
    expect(shouldAutoCheck(now - CHECK_INTERVAL_MS, now)).toBe(true);
    expect(shouldAutoCheck(now - CHECK_INTERVAL_MS + 1, now)).toBe(false);
    expect(shouldAutoCheck(now - 60_000, now)).toBe(false);
  });

  it('checks when the clock went backwards', () => {
    expect(shouldAutoCheck(now + 60_000, now)).toBe(true);
  });
});

describe('fetchLatestRelease', () => {
  it('returns null on HTTP errors and network failures', async () => {
    expect(await fetchLatestRelease(fakeFetch(404))).toBeNull();
    const offline = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    expect(await fetchLatestRelease(offline)).toBeNull();
  });

  it('gives up after the timeout', async () => {
    const hang = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    ) as unknown as typeof fetch;
    expect(await fetchLatestRelease(hang, 10)).toBeNull();
  });
});

describe('checkForUpdate', () => {
  const now = 1_700_000_000_000;

  it('offers a newer release and records the check time', async () => {
    const db = await freshDb();
    const r = await checkForUpdate({ db, currentVersion: '1.0.0', fetch: fakeFetch(200, release('v1.1.0')), now: () => now });
    expect(r).toMatchObject({ kind: 'available', update: { version: '1.1.0' } });
    expect(await getLastCheckAt(db)).toBe(now);
  });

  it('reports up to date for the same or an older release', async () => {
    const db = await freshDb();
    expect(await checkForUpdate({ db, currentVersion: '1.0.0', fetch: fakeFetch(200, release('v1.0.0')) }, true)).toEqual({ kind: 'upToDate' });
    expect(await checkForUpdate({ db, currentVersion: '1.2.0', fetch: fakeFetch(200, release('v1.1.9')) }, true)).toEqual({ kind: 'upToDate' });
  });

  it('throttles automatic checks to one per 24 h, but not manual ones', async () => {
    const db = await freshDb();
    await setLastCheckAt(db, now - 60_000);
    const f = fakeFetch(200, release('v1.1.0'));
    expect(await checkForUpdate({ db, currentVersion: '1.0.0', fetch: f, now: () => now })).toEqual({ kind: 'throttled' });
    expect(f).not.toHaveBeenCalled();

    const manual = await checkForUpdate({ db, currentVersion: '1.0.0', fetch: f, now: () => now }, true);
    expect(manual.kind).toBe('available');

    const later = now + CHECK_INTERVAL_MS;
    expect((await checkForUpdate({ db, currentVersion: '1.0.0', fetch: f, now: () => later })).kind).toBe('available');
  });

  it('fails without recording the check, so an offline launch retries next time', async () => {
    const db = await freshDb();
    expect(await checkForUpdate({ db, currentVersion: '1.0.0', fetch: fakeFetch(500), now: () => now })).toEqual({ kind: 'failed' });
    expect(await getLastCheckAt(db)).toBeNull();
  });
});
