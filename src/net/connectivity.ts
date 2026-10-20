/**
 * Network status from expo-network. `getConnectivity()` is for non-React code
 * (the player store); `useConnectivity()` re-renders on change.
 */
import * as Network from 'expo-network';
import { useSyncExternalStore } from 'react';

export type Connectivity = { online: boolean; wifi: boolean };

// Optimistic until the first reading arrives (a failed stream falls back anyway).
let state: Connectivity = { online: true, wifi: false };
const subs = new Set<() => void>();

export function toConnectivity(s: Network.NetworkState): Connectivity {
  const online = s.isConnected === true && s.isInternetReachable !== false;
  const unmetered = s.type === Network.NetworkStateType.WIFI || s.type === Network.NetworkStateType.ETHERNET;
  return { online, wifi: online && unmetered };
}

function set(next: Connectivity) {
  if (next.online === state.online && next.wifi === state.wifi) return;
  state = next;
  subs.forEach((cb) => cb());
}

let started = false;
function ensureStarted() {
  if (started) return;
  started = true;
  Network.addNetworkStateListener((s) => set(toConnectivity(s)));
  Network.getNetworkStateAsync()
    .then((s) => set(toConnectivity(s)))
    .catch(() => {});
}

export function getConnectivity(): Connectivity {
  ensureStarted();
  return state;
}

export function subscribeConnectivity(cb: () => void): () => void {
  ensureStarted();
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function useConnectivity(): Connectivity {
  return useSyncExternalStore(subscribeConnectivity, getConnectivity);
}
