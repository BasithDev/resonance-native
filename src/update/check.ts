/**
 * In-app update check against GitHub Releases. The APK is published only as a
 * release on the public repo; the app asks for the latest one and offers it when
 * its tag (vX.Y.Z) is newer than the installed version.
 */
import type { Db } from '../db/types';

export const GITHUB_REPO = 'BasithDev/resonance-native';
export const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;
const LATEST_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

/** Automatic checks run at most this often. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8000;
const LAST_CHECK_KEY = 'update.lastCheckAt';

export type UpdateInfo = {
  /** "1.1.0" (no leading v). */
  version: string;
  /** Release body: the CHANGELOG section, as markdown. */
  notes: string;
  /** Direct APK download, when one is attached. */
  apkUrl: string | null;
  /** Release page on GitHub (the fallback when there is no APK). */
  pageUrl: string;
};

export type CheckResult =
  | { kind: 'available'; update: UpdateInfo }
  | { kind: 'upToDate' }
  /** Offline, timed out, or GitHub answered with an error. */
  | { kind: 'failed' }
  /** Automatic check skipped: the last one was under 24 h ago. */
  | { kind: 'throttled' };

/** Compares "1.2.10" with "v1.2.9" numerically. Positive when a is newer. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.trim().replace(/^v/i, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

type Asset = { name?: unknown; browser_download_url?: unknown };

/** Download url of the release's APK; prefers the resonance-vX.Y.Z.apk name if several are attached. */
export function pickApkUrl(assets: unknown): string | null {
  if (!Array.isArray(assets)) return null;
  const apks = (assets as Asset[]).filter(
    (a) => typeof a?.name === 'string' && a.name.toLowerCase().endsWith('.apk') && typeof a.browser_download_url === 'string',
  );
  const best = apks.find((a) => (a.name as string).toLowerCase().startsWith('resonance')) ?? apks[0];
  return best ? (best.browser_download_url as string) : null;
}

/** The fields we use from GitHub's release JSON, or null when it has no usable tag. */
export function parseRelease(json: unknown): UpdateInfo | null {
  if (!json || typeof json !== 'object') return null;
  const r = json as Record<string, unknown>;
  const version = typeof r.tag_name === 'string' ? r.tag_name.trim().replace(/^v/i, '') : '';
  if (!/^\d+(\.\d+)*/.test(version)) return null;
  return {
    version,
    notes: typeof r.body === 'string' ? r.body : '',
    apkUrl: pickApkUrl(r.assets),
    pageUrl: typeof r.html_url === 'string' ? r.html_url : RELEASES_PAGE,
  };
}

/** True when an automatic check is due (never checked, 24 h passed, or the clock went backwards). */
export function shouldAutoCheck(lastCheckAt: number | null, now: number): boolean {
  if (lastCheckAt === null) return true;
  const elapsed = now - lastCheckAt;
  return elapsed < 0 || elapsed >= CHECK_INTERVAL_MS;
}

/** Latest release from GitHub, or null when offline / unavailable. Never throws. */
export async function fetchLatestRelease(f: typeof fetch = fetch, timeoutMs = TIMEOUT_MS): Promise<UpdateInfo | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await f(LATEST_URL, { headers: { Accept: 'application/vnd.github+json' }, signal: ctrl.signal });
    if (!res.ok) return null; // 404 until the first release exists
    return parseRelease(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function getLastCheckAt(db: Db): Promise<number | null> {
  const r = await db.first<{ value: string | null }>('SELECT value FROM kv WHERE key = ?', [LAST_CHECK_KEY]);
  if (!r || r.value === null) return null;
  const n = Number(r.value);
  return Number.isFinite(n) ? n : null;
}

export async function setLastCheckAt(db: Db, t: number): Promise<void> {
  await db.run('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)', [LAST_CHECK_KEY, String(t)]);
}

export type CheckDeps = {
  db: Db;
  currentVersion: string;
  fetch?: typeof fetch;
  now?: () => number;
};

/**
 * Asks GitHub whether a newer version exists. Automatic checks (`manual` false)
 * are throttled to one per 24 h; only a check that reached GitHub counts, so an
 * offline launch tries again next time.
 */
export async function checkForUpdate(deps: CheckDeps, manual = false): Promise<CheckResult> {
  const now = deps.now ?? Date.now;
  if (!manual) {
    const last = await getLastCheckAt(deps.db).catch(() => null);
    if (!shouldAutoCheck(last, now())) return { kind: 'throttled' };
  }
  const latest = await fetchLatestRelease(deps.fetch);
  if (!latest) return { kind: 'failed' };
  await setLastCheckAt(deps.db, now()).catch(() => {});
  return compareVersions(latest.version, deps.currentVersion) > 0
    ? { kind: 'available', update: latest }
    : { kind: 'upToDate' };
}
