/**
 * App-side glue for the update check: the installed version, the pending update
 * shown by <UpdateDialog />, and the automatic (launch) and manual (Settings) checks.
 */
import Constants from 'expo-constants';
import { create } from 'zustand';

import { getDb } from '../db/instance';
import { checkForUpdate, type CheckResult, type UpdateInfo } from './check';

/** app.json expo.version of the installed build. */
export function currentVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

type UpdateState = {
  /** The newer release to offer, or null when the dialog is closed. */
  pending: UpdateInfo | null;
  dismiss(): void;
};

export const useUpdate = create<UpdateState>()((set) => ({
  pending: null,
  dismiss: () => set({ pending: null }),
}));

async function run(manual: boolean): Promise<CheckResult> {
  try {
    const r = await checkForUpdate({ db: await getDb(), currentVersion: currentVersion() }, manual);
    if (r.kind === 'available') useUpdate.setState({ pending: r.update });
    return r;
  } catch {
    return { kind: 'failed' };
  }
}

/** On launch: at most once per 24 h, silent unless there is an update. */
export const autoCheckForUpdate = () => run(false);
/** From Settings: always asks GitHub; the caller reports "up to date" / failure. */
export const manualCheckForUpdate = () => run(true);
