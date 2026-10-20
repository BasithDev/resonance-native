import { useCallback, useEffect, useRef, useState } from 'react';

import { parseSyncQr, type SyncPayload } from './qr';
import type { AppSyncResult } from './runAppSync';
import { SyncError } from './types';

export const NOT_RESONANCE_QR = "That's not a Resonance sync code";
const GENERIC_ERROR = 'Sync failed — please try again';
const NOTICE_MS = 3000;

export type SyncFlowState =
  | { phase: 'scanning'; notice: string | null }
  | { phase: 'syncing' }
  | { phase: 'done'; result: AppSyncResult }
  | { phase: 'error'; message: string };

export type SyncFlow = {
  state: SyncFlowState;
  /** Feed every scanned barcode here; only a Resonance QR seen while scanning starts a sync. */
  onScanned: (text: string) => void;
  /** From the error screen back to the camera. */
  retry: () => void;
};

export function useSyncFlow(run: (payload: SyncPayload) => Promise<AppSyncResult>): SyncFlow {
  const [state, setState] = useState<SyncFlowState>({ phase: 'scanning', notice: null });
  // The camera reports the same code many times a second, before a re-render can turn it off.
  const scanning = useRef(true);

  const notice = state.phase === 'scanning' ? state.notice : null;
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => {
      if (scanning.current) setState({ phase: 'scanning', notice: null });
    }, NOTICE_MS);
    return () => clearTimeout(t);
  }, [notice]);

  const onScanned = useCallback(
    (text: string) => {
      if (!scanning.current) return;
      const payload = parseSyncQr(text);
      if (!payload) {
        setState((s) => (s.phase === 'scanning' && s.notice === NOT_RESONANCE_QR ? s : { phase: 'scanning', notice: NOT_RESONANCE_QR }));
        return;
      }
      scanning.current = false;
      setState({ phase: 'syncing' });
      run(payload).then(
        (result) => setState({ phase: 'done', result }),
        (e: unknown) => {
          if (!(e instanceof SyncError)) console.warn('[sync] failed', e);
          setState({ phase: 'error', message: e instanceof SyncError ? e.message : GENERIC_ERROR });
        },
      );
    },
    [run],
  );

  const retry = useCallback(() => {
    scanning.current = true;
    setState({ phase: 'scanning', notice: null });
  }, []);

  return { state, onScanned, retry };
}
