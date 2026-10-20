/**
 * Sleep timer. The deadline is a wall-clock timestamp that the player store
 * checks on every engine status tick, so it still fires with the screen off
 * (a JS timer may be frozen in the background).
 */
import { create } from 'zustand';

export const SLEEP_MINUTES = [15, 30, 45, 60] as const;
export type SleepMinutes = (typeof SLEEP_MINUTES)[number];
export type SleepChoice = SleepMinutes | 'endOfSong' | null;
export type SleepSetting = { kind: 'minutes'; minutes: SleepMinutes; deadline: number } | { kind: 'endOfSong' } | null;

type SleepTimer = {
  setting: SleepSetting;
  set(choice: SleepChoice, now?: number): void;
  remainingSec(now?: number): number | null;
  /** True when playback should stop now; the setting clears when it fires. */
  shouldPause(now: number, trackEnded: boolean): boolean;
};

export const useSleepTimer = create<SleepTimer>()((set, get) => ({
  setting: null,

  set(choice, now = Date.now()) {
    if (choice === null) set({ setting: null });
    else if (choice === 'endOfSong') set({ setting: { kind: 'endOfSong' } });
    else set({ setting: { kind: 'minutes', minutes: choice, deadline: now + choice * 60_000 } });
  },

  remainingSec(now = Date.now()) {
    const s = get().setting;
    return s?.kind === 'minutes' ? Math.max(0, Math.ceil((s.deadline - now) / 1000)) : null;
  },

  shouldPause(now, trackEnded) {
    const s = get().setting;
    if (!s) return false;
    const fire = s.kind === 'minutes' ? now >= s.deadline : trackEnded;
    if (fire) set({ setting: null });
    return fire;
  },
}));
