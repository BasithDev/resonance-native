import { createElement } from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import type { AppSyncResult } from './runAppSync';
import { SyncError } from './types';
import { NOT_RESONANCE_QR, useSyncFlow, type SyncFlow } from './useSyncFlow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const good = JSON.stringify({ v: 1, urls: ['http://lan/api'], code: 'ABCD2345' });
const result: AppSyncResult = {
  summary: {
    toPhone: { songs: 1, playlists: 0 }, fromPhone: { songs: 0, playlists: 0 }, removed: { songs: 0, playlists: 0 },
  },
  newSongs: [],
};

async function render(run: (p: { urls: string[]; code: string }) => Promise<AppSyncResult>) {
  const flow: { current: SyncFlow | null } = { current: null };
  function Probe() {
    flow.current = useSyncFlow(run);
    return null;
  }
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(createElement(Probe));
  });
  return { flow, unmount: () => act(() => r.unmount()) };
}

describe('useSyncFlow', () => {
  it("a non-Resonance QR shows a notice, keeps scanning and doesn't sync", async () => {
    const run = jest.fn(async () => result);
    const { flow, unmount } = await render(run);
    await act(async () => flow.current!.onScanned('https://example.com'));
    expect(flow.current!.state).toEqual({ phase: 'scanning', notice: NOT_RESONANCE_QR });
    expect(NOT_RESONANCE_QR).toBe("That's not a Resonance sync code");
    expect(run).not.toHaveBeenCalled();
    await unmount();
  });

  it('syncs once even when the QR is scanned repeatedly, then shows the result', async () => {
    let resolve!: (r: AppSyncResult) => void;
    const run = jest.fn(() => new Promise<AppSyncResult>((r) => { resolve = r; }));
    const { flow, unmount } = await render(run);
    await act(async () => {
      flow.current!.onScanned(good);
      flow.current!.onScanned(good);
    });
    expect(flow.current!.state).toEqual({ phase: 'syncing' });
    await act(async () => flow.current!.onScanned(good));
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ urls: ['http://lan/api'], code: 'ABCD2345' });
    await act(async () => resolve(result));
    expect(flow.current!.state).toEqual({ phase: 'done', result });
    await unmount();
  });

  it('shows the SyncError message and Try again goes back to scanning', async () => {
    const run = jest
      .fn<Promise<AppSyncResult>, [unknown]>()
      .mockRejectedValueOnce(new SyncError('expired', 'This code has expired — tap Sync on the web again'))
      .mockResolvedValueOnce(result);
    const { flow, unmount } = await render(run);
    await act(async () => flow.current!.onScanned(good));
    expect(flow.current!.state).toEqual({ phase: 'error', message: 'This code has expired — tap Sync on the web again' });
    await act(async () => flow.current!.onScanned(good)); // camera is off on the error screen
    expect(run).toHaveBeenCalledTimes(1);
    await act(async () => flow.current!.retry());
    expect(flow.current!.state).toEqual({ phase: 'scanning', notice: null });
    await act(async () => flow.current!.onScanned(good));
    expect(flow.current!.state).toEqual({ phase: 'done', result });
    await unmount();
  });

  it('shows a generic message for unexpected errors', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { flow, unmount } = await render(jest.fn(async () => { throw new Error('disk I/O'); }));
    await act(async () => flow.current!.onScanned(good));
    expect(flow.current!.state).toEqual({ phase: 'error', message: 'Sync failed — please try again' });
    warn.mockRestore();
    await unmount();
  });
});
