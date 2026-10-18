# Resonance Android — Plan 3: Sleep timer, Super shuffle, Listening stats, Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The four features the owner added after the mockups: sleep timer, super shuffle, listening stats (screen 14) and a home-screen widget (screen 15).

**Architecture:** Everything builds on Plan 1's `repo`, `usePlayer` and `engine`. Listening time is logged locally in a `listens` table every 10 s of actual playback, and sent to the web at sync (Plan 2 Task 14 consumes it). The widget uses `react-native-android-widget` with its Expo config plugin.

**Tech Stack:** Expo 57, TypeScript, zustand, expo-sqlite, react-native-android-widget.

**Spec:** `docs/superpowers/specs/2026-10-18-android-app-design.md` §2 goals 8–11, §6 screens 14–15.

## Global Constraints

- Sleep timer options (exact): 15, 30, 45, 60 minutes, and "End of song".
- Super shuffle = every distinct song in any playlist (including Liked), each exactly once, in random order. With no connection, only downloaded songs.
- Stats periods: today (since local midnight), last 7 days, last 30 days, last 365 days, all time. Most played = top 5 by play count, then by listened seconds. "Song of the day" is deterministic per local date.
- Listening is logged in 10-second chunks of actual playback (paused time doesn't count), including offline.
- The widget is built last. If `react-native-android-widget` can't build on Expo 57 / RN 0.86 within reasonable effort, the widget is dropped, and the report says exactly why.
- Direction A styling and Plan 1 theme tokens.

## Review Focus

1. **The sleep timer fires while the app is in the background with the screen off.** Playback must pause. A JS timer alone may not fire when the app is backgrounded, so use a wall-clock deadline that's checked on every engine status tick. (Test in Task 16.)
2. **The phone clock crosses midnight during playback.** Listening time is split by `playedAt` per 10-second chunk, so "today" is right. (Test in Task 17.)
3. **A song is deleted while it has listen history.** Stats still count the time and don't crash. Most played shows only songs that still exist. (Test in Task 17.)
4. **Super shuffle with nothing playable** (offline with no downloads). The user sees "Nothing downloaded to shuffle", not an empty player. (Test in Task 16.)
5. **The widget is tapped when the app process is dead.** The app opens. It doesn't crash or do nothing.

---

### Task 16: Sleep timer and super shuffle

**Files:**
- Create: `src/player/sleepTimer.ts`
- Modify: `src/player/store.ts` (check the sleep deadline on status ticks), `src/library/repo.ts` (`superShuffleSongs(db): Song[]`), `src/app/player.tsx` (☾ Sleep chip showing remaining time; options sheet), `src/app/(tabs)/index.tsx` and `src/app/playlists/index.tsx` (Super shuffle button, icon ⤨ with a sparkle)
- Test: `src/player/sleepTimer.test.ts`, `src/library/repo.superShuffle.test.ts`

**Interfaces:**
- Consumes: `usePlayer` (Plan 1 Task 6), `repo` and `Db` (Plan 1 Task 5), `useConnectivity`.
- Produces:
  ```ts
  type SleepSetting = { kind: 'minutes'; minutes: 15 | 30 | 45 | 60; deadline: number } | { kind: 'endOfSong' } | null;
  useSleepTimer: { setting: SleepSetting; set(choice: 15 | 30 | 45 | 60 | 'endOfSong' | null, now?: number): void;
                   remainingSec(now?: number): number | null; shouldPause(now: number, trackEnded: boolean): boolean }
  superShuffleSongs(db): Song[]   // distinct, unshuffled; the store shuffles
  usePlayer.superShuffle(): Promise<'started' | 'nothing-playable'>
  ```

- [ ] **Step 1: Write the failing tests:**
  - `minutes timer: shouldPause false before deadline, true at/after deadline, then setting clears`
  - `endOfSong: shouldPause only when trackEnded`
  - `store pauses on a status tick past the deadline` (Review Focus 1)
  - `superShuffleSongs returns each song once even if in 3 playlists, includes liked`
  - `superShuffle offline with no downloads returns 'nothing-playable' and does not start` (Review Focus 4)
- [ ] **Step 2:** Run `npx jest src/player/sleepTimer src/library/repo.superShuffle`. Expected: FAIL.
- [ ] **Step 3:** Implement. Show "Nothing downloaded to shuffle" as a toast/snackbar when the result is `nothing-playable`.
- [ ] **Step 4:** Run `npx jest`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(app): sleep timer and super shuffle`.

### Task 17: Listening stats (log, queries, screen 14)

**Files:**
- Create: `src/stats/listens.ts`, `src/stats/queries.ts`, `src/app/stats.tsx`
- Modify: `src/db/migrations.ts` (table `listens(id integer primary key, youtube_id text, duration_sec integer, played_at integer, synced integer default 0)`), `src/player/store.ts` (log a 10 s chunk each 10 s of playing), `src/app/(tabs)/index.tsx` ("Listened today 1h 12m" chip → `/stats`)
- Test: `src/stats/listens.test.ts`, `src/stats/queries.test.ts`

**Interfaces:**
- Produces:
  ```ts
  listens.log(db, youtubeId: string, durationSec: number, playedAt: number): Promise<void>
  listens.unsynced(db): Promise<{ id: number; youtubeId: string; durationSec: number; playedAt: number }[]>
  listens.markSynced(db, ids: number[]): Promise<void>
  getStats(db, now: number): Promise<{ todaySec: number; weekSec: number; monthSec: number; yearSec: number; lifetimeSec: number;
                                       mostPlayed: (Song & { playCount: number; listenedSec: number })[]; songOfTheDay: Song | null }>
  ```
  Song of the day: hash the local date string `YYYY-MM-DD` with the web's algorithm (`hash = (hash << 5) - hash + charCode; hash |= 0`), then take index `abs(hash) % songs.length` over songs ordered by `addedAt` desc.

- [ ] **Step 1: Write the failing tests:**
  - `today counts only chunks since local midnight` (Review Focus 2: chunks at 23:59:55 and 00:00:05 split correctly)
  - `week/month/year/lifetime windows`
  - `mostPlayed top 5 by playCount then listenedSec; excludes deleted songs; lifetime still counts their time` (Review Focus 3)
  - `songOfTheDay is stable for the same date and matches the web hash for '2026-10-18'`
  - `unsynced/markSynced round trip`
  - `store logs a chunk after 10 s of playing and none while paused` (fake timers)
- [ ] **Step 2:** Run `npx jest src/stats`. Expected: FAIL.
- [ ] **Step 3:** Implement the queries, the logging and screen 14 (direction A): period cards (Today · Week · Month · Year · All time) with formatted durations, a most-played list, and a song-of-the-day card with a play button.
- [ ] **Step 4:** Run `npx jest`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(app): listening stats`.

### Task 18: Home-screen widget (screen 15)

**Files:**
- Create: `src/widget/NowPlayingWidget.tsx`, `src/widget/taskHandler.ts`, `src/widget/update.ts`
- Modify: `app.json` (the `react-native-android-widget` plugin with widget `NowPlaying`, 4×1, minWidth 250dp, minHeight 70dp, preview image), the root `index` entry (register the widget task handler), `src/player/store.ts` (call `updateWidget(state)` on track or play-state change)

**Interfaces:**
- Consumes: `usePlayer` (Plan 1 Task 6).
- Produces: `updateWidget(s: { title: string | null; artist: string | null; artworkUri: string | null; playing: boolean }): Promise<void>`, and click actions `TOGGLE_PLAY`, `NEXT`, `OPEN_APP`.

- [ ] **Step 1:** Implement the widget UI: artwork, title and artist, and play/pause and next buttons, with a coral accent on a `#1c1b1d` rounded background. The task handler maps `TOGGLE_PLAY` and `NEXT` to `usePlayer` actions when the JS runtime has a player. Otherwise (the app process is dead, Review Focus 5) it opens the app with `OPEN_APP`.
- [ ] **Step 2:** Run `cd android && ./gradlew assembleDebug`. Expected: BUILD SUCCESSFUL. If the library can't build on Expo 57 / RN 0.86, revert the widget changes and write the reason in the report (status DONE_WITH_CONCERNS).
- [ ] **Step 3:** Run `npx tsc --noEmit` and `npx jest`. Expected: clean, PASS.
- [ ] **Step 4: Commit:** `feat(app): home-screen now-playing widget`.
