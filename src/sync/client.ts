import type { Db } from '../db/types';
import * as repo from '../library/repo';
import { applyResponse } from './apply';
import type { SyncPayload } from './qr';
import { EXPIRED_MESSAGE, SyncError, UNREACHABLE_MESSAGE } from './types';
import type { Listen, SyncRequest, SyncResponse, SyncSummary } from './types';

export type SyncDeps = {
  fetch?: typeof fetch;
  removeDownload: (youtubeId: string) => Promise<void>;
  collectListens: () => Promise<{ ids: number[]; listens: Listen[] }>;
  markListensSynced: (ids: number[]) => Promise<void>;
  now?: () => number;
};

const HEALTH_TIMEOUT_MS = 2000;
const POST_TIMEOUT_MS = 60000;

async function fetchWithTimeout(
  f: typeof fetch,
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await f(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Probes every url in parallel; the first that answers /health with 200 wins. */
function pickReachable(f: typeof fetch, urls: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let pending = urls.length;
    if (pending === 0) return resolve(null);
    for (const url of urls) {
      fetchWithTimeout(f, `${url}/health`, {}, HEALTH_TIMEOUT_MS)
        .then((r) => (r.ok ? resolve(url) : null))
        .catch(() => null)
        .finally(() => {
          if (--pending === 0) resolve(null);
        });
    }
  });
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    if (typeof body?.error?.message === 'string') return body.error.message;
  } catch {
    // fall through
  }
  return `Sync failed (HTTP ${res.status})`;
}

export async function runSync(
  db: Db,
  payload: SyncPayload,
  deps: SyncDeps,
): Promise<SyncSummary> {
  const f = deps.fetch ?? fetch;
  const requestTime = (deps.now ?? Date.now)();

  const base = await pickReachable(f, payload.urls);
  if (base === null) throw new SyncError('unreachable', UNREACHABLE_MESSAGE);

  const lastSyncAt = await repo.getLastSyncAt(db);
  const exported = await repo.exportForSync(db);
  const { ids, listens } = await deps.collectListens();
  const body: SyncRequest = { v: 1, lastSyncAt, ...exported, listens };

  let res: Response;
  try {
    res = await fetchWithTimeout(
      f,
      `${base}/sync`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sync-Code': payload.code },
        body: JSON.stringify(body),
      },
      POST_TIMEOUT_MS,
    );
  } catch {
    throw new SyncError('unreachable', UNREACHABLE_MESSAGE);
  }
  if (res.status === 401) throw new SyncError('expired', EXPIRED_MESSAGE);
  if (res.status !== 200) throw new SyncError('server', await errorMessage(res));

  let data: SyncResponse;
  try {
    data = (await res.json()) as SyncResponse;
  } catch {
    throw new SyncError('server', 'The server sent an unreadable response');
  }

  await applyResponse(db, data, requestTime, deps);
  await deps.markListensSynced(ids);
  return data.summary;
}
