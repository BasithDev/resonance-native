import { useSleepTimer } from './sleepTimer';

const T0 = 1_000_000;
beforeEach(() => useSleepTimer.getState().set(null));

describe('sleep timer', () => {
  it('minutes timer: shouldPause false before deadline, true at/after deadline, then setting clears', () => {
    const t = useSleepTimer.getState();
    t.set(15, T0);
    const deadline = T0 + 15 * 60_000;
    expect(useSleepTimer.getState().remainingSec(T0)).toBe(900);
    expect(useSleepTimer.getState().shouldPause(deadline - 1, false)).toBe(false);
    expect(useSleepTimer.getState().setting).not.toBeNull();
    expect(useSleepTimer.getState().shouldPause(deadline, false)).toBe(true);
    expect(useSleepTimer.getState().setting).toBeNull();
    expect(useSleepTimer.getState().shouldPause(deadline + 1, false)).toBe(false);
  });

  it('endOfSong: shouldPause only when trackEnded', () => {
    useSleepTimer.getState().set('endOfSong', T0);
    expect(useSleepTimer.getState().remainingSec(T0)).toBeNull();
    expect(useSleepTimer.getState().shouldPause(T0 + 10 * 60_000, false)).toBe(false);
    expect(useSleepTimer.getState().setting).toEqual({ kind: 'endOfSong' });
    expect(useSleepTimer.getState().shouldPause(T0, true)).toBe(true);
    expect(useSleepTimer.getState().setting).toBeNull();
  });
});
