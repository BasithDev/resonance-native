# Resonance Android — Plan 1: Foundation (offline player) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A sideloadable Android app that searches YouTube, saves songs into a local library and playlists, downloads them, and plays them offline with background and lock-screen controls. Direction A UI, screens 1–10 and 13 (without sync).

**Architecture:** Expo SDK 57 app (TypeScript, expo-router) with a local Expo native module wrapping `youtubedl-android` (yt-dlp on device). Library lives in expo-sqlite behind a small `Db` interface, so the logic is unit-tested in Node with better-sqlite3. Playback: a single-track engine interface with the queue logic in pure TypeScript. expo-audio first, `@rntp/player` as the fallback, decided by an on-device spike (Task 4).

**Tech Stack:** Expo 57, React Native 0.86, TypeScript, expo-router, expo-sqlite, expo-file-system, expo-network, expo-audio (or @rntp/player), react-native-reanimated, react-native-gesture-handler, zustand, expo-image, @expo-google-fonts/inter, Kotlin + `io.github.junkfood02.youtubedl-android:library:0.18.1`, Jest (jest-expo) + better-sqlite3 for tests.

**Spec:** `docs/superpowers/specs/2026-10-18-android-app-design.md` (read it alongside this plan). Mockups: `.superpowers/brainstorm/488684-1792338272/content/a-all-pages.html`.

**Follow-up plans (not in this plan):** Plan 2: Sync (backend pairing/sync endpoints, web QR screen, app screens 11–12, deletion tracking in backend). Plan 3: sleep timer, super shuffle, listening stats (screen 14), home-screen widget (screen 15).

## Global Constraints

- Android only, portrait, dark theme only. Sideloaded APK; not published.
- Before writing Expo code, check the versioned docs: https://docs.expo.dev/versions/v57.0.0/ (per `app/AGENTS.md`).
- Rebuild inside the existing `app/` git repo: delete tracked files, keep `.git`, work on branch `rebuild-android`.
- App name `Resonance`; Android package `com.basith.resonance`.
- Theme tokens (exact): surfaces `#0f0e10`, `#1c1b1d`, `#201f21`, `#2b292c`, `#363436`; text `#e6e1e4`, muted `#a8a2a6`; primary `#ffb3af` (on-primary `#410005`); strong primary `#ff5959`; downloaded/offline mint `#5adcb2` (on-mint `#003829`). Font: Inter.
- Downloads: best audio only (`-f bestaudio[ext=webm]/bestaudio`), no ffmpeg module. Wi-Fi only by default (`downloadOnCellular = false`); `autoDownloadLiked = true` by default.
- Songs are identified by YouTube ID everywhere; playlists by UUID; the Liked playlist has the fixed id `liked`.
- Every deletion (song from library, playlist, song from playlist) writes a tombstone from day one. Plan 2 sync depends on it.
- Personal use only (YouTube ToS).

## Review Focus

1. **The signal drops while a non-downloaded song is streaming.** Playback should move on to the next downloaded song. It must not stall or crash. (Test in Task 6.)
2. **The stream URL has expired** after the app sat paused for hours. On play, the app re-resolves the URL and resumes at the same position. (Test in Task 6.)
3. **The app is killed mid-download.** On next launch the song must not stay stuck as "downloading": it goes back to `queued` and any partial file is deleted. (Test in Task 7.)
4. **A song is removed from the library while it's downloading or playing.** The download is cancelled, the files are deleted, and the player skips it. (Tests in Tasks 6 and 7.)
5. **yt-dlp extraction fails** (outdated yt-dlp or a 403). The user sees "YouTube changed something — update yt-dlp in Settings". One failed song doesn't block the rest of the download queue. (Test in Task 7.)

---

## File Structure (app/)

```
app/
  app.json                       name, package, android-only, plugins (expo-router, expo-sqlite, audio lib, expo-font)
  modules/ytdlp/                 local Expo module (Kotlin) — yt-dlp on device
    expo-module.config.json
    android/build.gradle         + youtubedl-android dependency
    android/src/main/java/com/basith/ytdlp/YtdlpModule.kt
    index.ts                     typed JS API (see Task 3 Interfaces)
  src/
    app/                         expo-router routes
      _layout.tsx                providers, fonts, DB init, MiniPlayer overlay
      (tabs)/_layout.tsx         Library · Search · Offline · Settings
      (tabs)/index.tsx           screen 1 Library
      (tabs)/search.tsx          screen 2
      (tabs)/offline.tsx         screen 9
      (tabs)/settings.tsx        screen 13
      playlists/index.tsx        screen 3
      playlists/[id].tsx         screen 4
      player.tsx                 screen 5 (+ queue sheet, screen 6)
      dev.tsx                    hidden debug screen for native module checks (removed in Task 11)
    theme/tokens.ts
    db/types.ts                  Db interface
    db/expoDb.ts                 expo-sqlite adapter
    db/migrations.ts
    library/types.ts
    library/repo.ts              all library reads/writes + tombstones
    player/queue.ts              pure queue logic
    player/engine.ts             PlayerEngine interface + chosen implementation
    player/store.ts              zustand store: queue + engine + stream resolution
    downloads/rules.ts           pure download-permission rules
    downloads/manager.ts         download queue
    net/connectivity.ts          online / wifi state
    settings/store.ts            persisted settings
    youtube/client.ts            thin wrapper around modules/ytdlp + error mapping
    components/                  SongRow, MiniPlayer, SongMenu, PlaylistCard, OfflineBanner, ArtworkBackdrop, ...
  test/sqliteAdapter.ts          better-sqlite3 implementation of Db for Jest
```

---

### Task 1: Android toolchain and phone

The owner's machine has no Android SDK and Java 11; React Native 0.86 needs JDK 17+.

**Files:** none in the repo. This task sets up the machine.

- [ ] **Step 1: Install JDK 17** (`sudo apt install openjdk-17-jdk`) and set `JAVA_HOME`. Verify that `java -version` prints 17.
- [ ] **Step 2: Install the Android command-line tools** into `~/Android/Sdk`, then run `sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0"` (use the versions the Expo 57 docs require). Export `ANDROID_HOME=$HOME/Android/Sdk` and add `platform-tools` to `PATH` in `~/.bashrc`.
- [ ] **Step 3: Owner action.** Enable Developer options → USB debugging on the phone, connect it, and accept the prompt.
- [ ] **Step 4: Verify.** Run `adb devices`. Expected: one line ending in `device`.

### Task 2: Fresh app scaffold, theme, tabs, tests

**Files:**
- Delete: every tracked file in `app/` (keep `.git`)
- Create: Expo 57 default-template project in `app/`, `src/theme/tokens.ts`, `src/app/_layout.tsx`, `src/app/(tabs)/_layout.tsx`, four placeholder tab screens, `jest.config.js`, `test/sqliteAdapter.ts`
- Test: `src/theme/tokens.test.ts`

**Interfaces:**
- Produces: `colors` (keys `bg, s1, s2, s3, s4, text, muted, primary, onPrimary, primaryStrong, mint, onMint`), `radii` (`sm 8, md 12, lg 16, xl 22, pill 999`), `font` family names. These come from `src/theme/tokens.ts`.

- [ ] **Step 1:** In `app/`, run `git checkout -b rebuild-android`, then `git rm -r -q .` (this keeps `.git`). Create the project with `npx create-expo-app@latest . --template default@sdk-57`. Set `name: "Resonance"` and `android.package: "com.basith.resonance"`. Set orientation to portrait and `userInterfaceStyle: "dark"`. Move routes under `src/app` if the template doesn't already put them there.
- [ ] **Step 2: Write the failing test** `tokens.test.ts`. It asserts `colors.primary === '#ffb3af'`, `colors.primaryStrong === '#ff5959'`, `colors.mint === '#5adcb2'` and `colors.bg === '#0f0e10'`.
- [ ] **Step 3:** Run `npx jest src/theme`. Expected: FAIL (the module isn't found).
- [ ] **Step 4:** Create `tokens.ts` with every Global Constraints colour. Load Inter through `@expo-google-fonts/inter` in `_layout.tsx`. The tabs are Library, Search, Offline and Settings, with labels and icons as on mockup screen 1.
- [ ] **Step 5:** Run `npx jest`. Expected: PASS.
- [ ] **Step 6:** Run `npx expo run:android` on the phone. Expected: the app opens with four dark tabs.
- [ ] **Step 7: Commit:** `feat: fresh Expo 57 scaffold with Resonance theme and tabs`.

### Task 3: yt-dlp native module (highest risk — do before anything else depends on it)

**Files:**
- Create: `modules/ytdlp/**` (via `npx create-expo-module@latest --local ytdlp`), `src/youtube/client.ts`, `src/app/dev.tsx`
- Test: `src/youtube/client.test.ts`

**Interfaces:**
- Produces (`modules/ytdlp/index.ts`):
  ```ts
  type YtTrack = { youtubeId: string; title: string; channel: string | null; durationSec: number | null; thumbnailUrl: string };
  search(query: string, limit = 20): Promise<YtTrack[]>          // ytsearchN:, --flat-playlist -J
  playlistEntries(url: string): Promise<YtTrack[]>                // --flat-playlist -J
  videoInfo(urlOrId: string): Promise<YtTrack>
  resolveStream(youtubeId: string): Promise<{ url: string }>      // -f bestaudio, getInfo(request).getUrl()
  download(jobId: string, youtubeId: string, destDir: string): Promise<{ path: string; sizeBytes: number }>
                                                                  // -f bestaudio[ext=webm]/bestaudio -o destDir/<id>.%(ext)s
  cancel(jobId: string): void                                     // destroyProcessById
  version(): Promise<string>
  update(): Promise<'updated' | 'up-to-date'>                     // UpdateChannel.STABLE
  addProgressListener(cb: (e: { jobId: string; percent: number; etaSec: number }) => void): Subscription
  ```
  Native rejections use codes `EXTRACTION_FAILED`, `NETWORK`, `CANCELLED`.
- Produces (`src/youtube/client.ts`): the same functions, with errors mapped to `YoutubeError { kind: 'extraction' | 'network' | 'cancelled'; message: string }`. For `extraction`, `message` is exactly `YouTube changed something — update yt-dlp in Settings`.

- [ ] **Step 1: Write the failing test** `client.test.ts`, with the native module mocked:
  - `maps EXTRACTION_FAILED to extraction kind with update message`: rejecting with code `EXTRACTION_FAILED` yields `{kind:'extraction', message:'YouTube changed something — update yt-dlp in Settings'}`.
  - `maps NETWORK and CANCELLED codes`.
  - `search passes limit through and returns tracks unchanged`.
- [ ] **Step 2:** Run `npx jest src/youtube`. Expected: FAIL.
- [ ] **Step 3:** Implement `YtdlpModule.kt`. `init` goes in `OnCreate` with the application context. Every call runs off the main thread (AsyncFunction + coroutine). Parse `-J` JSON for the tracks: the thumbnail falls back to `https://i.ytimg.com/vi/<id>/hqdefault.jpg`. Report progress through a module event. Add `android:extractNativeLibs="true"` and the ABI filters `arm64-v8a, armeabi-v7a`. Then implement `client.ts`.
- [ ] **Step 4:** Run `npx jest`. Expected: PASS.
- [ ] **Step 5: On-device check** through `dev.tsx`, which has buttons for each call. Expected on the phone:
  - searching "aane wala star" returns 20 results;
  - `resolveStream('eIeIkZ5Li88')` returns an `https://` URL;
  - `download` creates `<id>.webm` larger than 500 KB, with progress events rising to 100;
  - `cancel` during a download rejects with `cancelled`;
  - `version()` prints a date-style version.
- [ ] **Step 6: Commit:** `feat: on-device yt-dlp Expo module`.

### Task 4: Playback engine spike and implementation

**Files:**
- Create: `src/player/engine.ts`
- Test: on-device checklist (below). Record the decision as a comment at the top of `engine.ts`.

**Interfaces:**
- Produces:
  ```ts
  type EngineStatus = { playing: boolean; buffering: boolean; positionSec: number; durationSec: number; ended: boolean; error: string | null };
  type RemoteCommand = 'play' | 'pause' | 'next' | 'previous' | { seekTo: number };
  interface PlayerEngine {
    load(src: { uri: string; title: string; artist: string | null; artworkUri: string | null }, autoplay: boolean, startSec?: number): Promise<void>;
    play(): void; pause(): void; seekTo(sec: number): void;
    onStatus(cb: (s: EngineStatus) => void): () => void;
    onRemote(cb: (c: RemoteCommand) => void): () => void;
  }
  export const engine: PlayerEngine;
  ```

- [ ] **Step 1:** Implement `engine` on expo-audio. Use a single `AudioPlayer` with `replace(source)`, `setAudioModeAsync({ shouldPlayInBackground: true, interruptionMode: 'doNotMix' })`, `setActiveForLockScreen(true, metadata)`, and the config plugin with `enableBackgroundPlayback: true`.
- [ ] **Step 2: On-device checklist.** Use a temporary button in `dev.tsx` that plays a downloaded file, then a resolved stream URL. Every item must pass:
  - (a) the notification shows title, artist and artwork;
  - (b) **the notification/lock screen offers next and previous, and tapping them fires `onRemote('next'/'previous')`**;
  - (c) a Bluetooth/headset button play-pause works;
  - (d) with the screen off, playback continues for 10 minutes or more;
  - (e) both the local file and the stream play.
- [ ] **Step 3:** If (b) or anything else fails, re-implement the same interface on `@rntp/player` (non-commercial licence) and repeat Step 2. Record which library passed, and why, at the top of `engine.ts`.
- [ ] **Step 4: Commit:** `feat: playback engine with lock-screen controls (<chosen lib>)`.

### Task 5: Local database and library repository

**Files:**
- Create: `src/db/types.ts`, `src/db/expoDb.ts`, `src/db/migrations.ts`, `src/library/types.ts`, `src/library/repo.ts`
- Test: `src/library/repo.test.ts` (uses `test/sqliteAdapter.ts`)

**Interfaces:**
- Consumes: `YtTrack` (Task 3) as the input to `addSong`.
- Produces:
  ```ts
  interface Db { exec(sql: string): Promise<void>; run(sql: string, p?: unknown[]): Promise<void>;
                 all<T>(sql: string, p?: unknown[]): Promise<T[]>; first<T>(sql: string, p?: unknown[]): Promise<T | null>;
                 tx(fn: () => Promise<void>): Promise<void> }
  type DownloadState = 'none' | 'queued' | 'downloading' | 'done' | 'failed';
  type Song = { youtubeId: string; title: string; channel: string | null; durationSec: number | null; thumbnailUrl: string | null;
                addedAt: number; download: DownloadState; filePath: string | null; artPath: string | null; sizeBytes: number | null; downloadError: string | null };
  type Playlist = { id: string; name: string; kind: 'user' | 'liked'; createdAt: number; updatedAt: number; songCount: number; downloadedCount: number; coverUrl: string | null };
  // repo.ts — every function takes db first
  migrate(db), addSong(db, t: YtTrack): Song (idempotent upsert), listSongs(db): Song[] (newest first), getSong(db, id),
  removeSong(db, id): Song | null, createPlaylist(db, name, newId = randomUUID): Playlist, renamePlaylist(db, id, name),
  deletePlaylist(db, id), listPlaylists(db): Playlist[] (liked first), getPlaylistSongs(db, id): Song[] (by position),
  addToPlaylist(db, playlistId, youtubeId), removeFromPlaylist(db, playlistId, youtubeId), reorderPlaylist(db, id, youtubeIds: string[]),
  toggleLike(db, youtubeId): boolean, isLiked(db, youtubeId), setDownload(db, id, patch: Partial<Pick<Song,'download'|'filePath'|'artPath'|'sizeBytes'|'downloadError'>>),
  listByDownload(db, states: DownloadState[]): Song[], resetInterruptedDownloads(db): Song[] (downloading → queued),
  listTombstones(db): { kind: 'song' | 'playlist' | 'membership'; key: string; deletedAt: number }[]
  ```
  Tables: `songs`, `playlists` (Liked seeded with id `liked`, kind `liked`), `playlist_songs(playlist_id, youtube_id, position, added_at)`, `tombstones(kind, key, deleted_at)`, `kv(key, value)`.

- [ ] **Step 1: Write the failing tests:**
  - `addSong is idempotent by youtubeId`: adding twice gives one row, and the title updates to the second value.
  - `liked playlist exists after migrate with id 'liked'`.
  - `toggleLike adds to and removes from liked`: it returns `true`, then `false`, and `getPlaylistSongs(db,'liked')` goes 1 → 0.
  - `removeSong deletes memberships and writes a song tombstone`: the song is in two playlists, both memberships disappear, and `listTombstones` contains `{kind:'song', key:id}`.
  - `deletePlaylist writes a playlist tombstone; liked cannot be deleted` (deleting it throws).
  - `removeFromPlaylist writes membership tombstone key "<playlistId>:<youtubeId>"`.
  - `addToPlaylist appends at the end and ignores duplicates`; `reorderPlaylist persists order`.
  - `listPlaylists counts downloadedCount from download='done'`.
  - `resetInterruptedDownloads moves downloading to queued and returns them`.
- [ ] **Step 2:** Run `npx jest src/library`. Expected: FAIL.
- [ ] **Step 3:** Implement the migrations, `repo.ts` and the expo-sqlite adapter (`openDatabaseAsync('resonance.db')`). Each multi-statement change goes in a `tx`. `addSong` stamps `addedAt` only on insert. Every function that changes a playlist bumps its `updatedAt`.
- [ ] **Step 4:** Run `npx jest`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat: local library database with tombstones`.

### Task 6: Queue logic, player store, mini-player, Now Playing, queue sheet

**Files:**
- Create: `src/player/queue.ts`, `src/player/store.ts`, `src/net/connectivity.ts`, `src/components/MiniPlayer.tsx`, `src/components/ArtworkBackdrop.tsx`, `src/app/player.tsx`
- Test: `src/player/queue.test.ts`, `src/player/store.test.ts`

**Interfaces:**
- Consumes: `engine` (Task 4), `youtube.resolveStream` (Task 3), `Song` (Task 5).
- Produces:
  ```ts
  type RepeatMode = 'off' | 'all' | 'one';
  type QueueState = { original: Song[]; items: Song[]; index: number; shuffle: boolean; repeat: RepeatMode };
  start(songs: Song[], startIndex: number, shuffle: boolean): QueueState
  advance(q, reason: 'ended' | 'user', playable: (s: Song) => boolean): QueueState | null   // null = stop
  back(q, playable): QueueState
  toggleShuffle(q), cycleRepeat(q), playNext(q, s), enqueue(q, s), removeAt(q, i), move(q, from, to), removeSongEverywhere(q, youtubeId)
  // store.ts (zustand) — usePlayer
  { queue: QueueState | null; status: EngineStatus; playSongs(songs, index, opts?: { shuffle?: boolean }); togglePlay(); next(); previous();
    seek(sec); toggleShuffle(); cycleRepeat(); playNext(s); enqueue(s); removeFromQueue(i); moveInQueue(from, to); onSongRemoved(youtubeId) }
  // connectivity.ts — useConnectivity: { online: boolean; wifi: boolean }
  ```
  `playable(s) = s.download === 'done' || online`.

- [ ] **Step 1: Write the failing queue tests:**
  - `start with shuffle keeps the chosen song first`, and the other songs are a permutation of the rest.
  - `toggleShuffle off restores original order with current song selected`.
  - `advance 'ended' with repeat one stays on the same index`; `advance 'user' with repeat one moves on`.
  - `advance at end: repeat off → null, repeat all → index 0`.
  - `advance skips unplayable songs` (Review Focus 1): items [A done, B none, C done] offline → from A to C.
  - `advance returns null when nothing ahead is playable offline`.
  - `removeSongEverywhere drops the song and keeps current track` (Review Focus 4).
  - `playNext inserts after current; enqueue appends; move reorders`.
- [ ] **Step 2: Write the failing store tests**, with the engine, youtube client and connectivity faked:
  - `plays local file for downloaded songs without resolving`: `resolveStream` is not called, and `load` gets `file://…`.
  - `resolves stream for non-downloaded song when online`.
  - `on load error with an http source, re-resolves once and resumes at last position` (Review Focus 2): the second `load` has `startSec` equal to the last position.
  - `when connectivity goes offline mid-stream, ended/error advances to next downloaded song` (Review Focus 1).
  - `remote 'next' from engine.onRemote calls next()`.
  - `onSongRemoved for the current song skips to the next playable`.
- [ ] **Step 3:** Run `npx jest src/player`. Expected: FAIL.
- [ ] **Step 4:** Implement `queue.ts`, `store.ts` and `connectivity.ts` (expo-network). While the current track plays, the store prefetches the next track's stream URL. It caches stream URLs for 4 hours and re-resolves on error.
- [ ] **Step 5:** Run `npx jest`. Expected: PASS.
- [ ] **Step 6:** Build the UI to match mockup screens 5, 6 and 8:
  - The mini-player pill floats above the tabs.
  - Tapping it, or swiping up, expands into `player.tsx` with a Reanimated shared transition on the artwork. Swiping down closes the player.
  - The background is the blurred artwork via `ArtworkBackdrop`, using expo-image `blurRadius`.
  - The progress bar is waveform-styled and draggable.
  - Swiping the art left or right skips. The play/pause control morphs between states.
  - The queue opens as a bottom sheet from the player, with drag to reorder and swipe to remove.
  - Songs that can't play offline are greyed out.
- [ ] **Step 7: On-device check.** Play a queue of three songs. Lock the phone and skip from the lock screen, then switch to airplane mode while streaming. Expected: the next downloaded song plays, with no error dialog.
- [ ] **Step 8: Commit:** `feat: queue, player store, mini and full player`.

### Task 7: Download manager and Offline screen

**Files:**
- Create: `src/downloads/rules.ts`, `src/downloads/manager.ts`, `src/settings/store.ts`, `src/app/(tabs)/offline.tsx`
- Test: `src/downloads/rules.test.ts`, `src/downloads/manager.test.ts`

**Interfaces:**
- Consumes: the repo (Task 5), the youtube client (Task 3), `useConnectivity` and `usePlayer.onSongRemoved` (Task 6).
- Produces:
  ```ts
  canDownloadNow(c: { online: boolean; wifi: boolean; cellularAllowed: boolean }): boolean
  // manager.ts
  downloads.enqueue(youtubeIds: string[]); downloads.cancel(youtubeId); downloads.removeDownload(youtubeId);   // keep in library
  downloads.removeSongCompletely(youtubeId);   // cancel + delete files + repo.removeSong + player.onSongRemoved
  downloads.resume(); downloads.onStartup();   // resetInterruptedDownloads + delete partial files + resume
  useDownloads(): { active: { youtubeId: string; percent: number } | null; queuedCount: number; paused: boolean }
  // settings/store.ts — useSettings: { downloadOnCellular: boolean (false); autoDownloadLiked: boolean (true); set(k, v) }
  ```
  Files: audio in `Paths.document/audio/`, artwork in `Paths.document/art/<id>.jpg`. One download at a time. Liking a song with `autoDownloadLiked` on enqueues it.

- [ ] **Step 1: Write the failing tests:**
  - `rules: wifi → true; cellular with cellularAllowed=false → false; offline → false`.
  - `manager downloads audio then artwork and marks done with sizeBytes`.
  - `one failing song is marked failed with the update message and the next song still downloads` (Review Focus 5).
  - `onStartup resets interrupted downloads to queued and deletes partial files` (Review Focus 3).
  - `removeSongCompletely during an active download cancels the job and deletes both files` (Review Focus 4).
  - `pauses when connectivity becomes disallowed and resumes when allowed`.
- [ ] **Step 2:** Run `npx jest src/downloads`. Expected: FAIL.
- [ ] **Step 3:** Implement `rules.ts`, `manager.ts` and the settings (persisted in the `kv` table).
- [ ] **Step 4:** Run `npx jest`. Expected: PASS.
- [ ] **Step 5:** Build screen 9 as in the mockup: songs-on-phone count, storage bar (with free space from expo-file-system), active download card with percent and pause/resume, "Play offline" and "Shuffle", and the list of downloaded songs.
- [ ] **Step 6: On-device check.** Queue five songs on Wi-Fi, then force-stop the app mid-download and reopen it. Expected: downloads resume and nothing is stuck at a fixed percentage.
- [ ] **Step 7: Commit:** `feat: download manager and Offline screen`.

### Task 8: Library, Playlists, Playlist detail, Song menu

**Files:**
- Create: `src/app/(tabs)/index.tsx`, `src/app/playlists/index.tsx`, `src/app/playlists/[id].tsx`, `src/components/SongRow.tsx`, `src/components/SongMenu.tsx`, `src/components/PlaylistCard.tsx`, `src/library/useLibrary.ts`
- Test: `src/library/useLibrary.test.ts`

**Interfaces:**
- Consumes: the repo (Task 5), `usePlayer` (Task 6), `downloads` (Task 7).
- Produces: `useLibrary(): { songs, playlists, refresh() }`, which re-reads after any repo write through a simple change-event emitter (`libraryEvents.emit()` after every write in the UI layer). `<SongRow song onPress onMenu showIndex? />` shows ⬇ in mint for done, a progress ring while downloading, and ☁ greyed for none.

- [ ] **Step 1: Write the failing test** `useLibrary refreshes after libraryEvents.emit` (render the hook with the test adapter, add a song, emit, expect the new length).
- [ ] **Step 2:** Run `npx jest src/library/useLibrary`. Expected: FAIL.
- [ ] **Step 3:** Implement the hook and emitter.
- [ ] **Step 4:** Run `npx jest`. Expected: PASS.
- [ ] **Step 5:** Build screens 1, 3, 4 and 7 to match the mockups:
  - **Library (1):** greeting, chips (All / Playlists / Liked), Play all, Shuffle all, a playlists carousel showing "⬇ x/y", and all songs. Leave the ⟳ button in place without wiring; Plan 2 connects it.
  - **Playlists (3):** grid with a + button. Long-press renames or deletes; the Liked playlist can't be renamed or deleted.
  - **Playlist detail (4):** blurred header, Play, Shuffle, download-all (mint), a filter box, and long-press drag to reorder.
  - **Song menu (7):** a bottom sheet with download / remove download, play next, add to queue, add to playlist (picker), like, open in YouTube, and remove from library (confirm first, then `downloads.removeSongCompletely`).
  - Lists animate in, and press states use scale feedback.
- [ ] **Step 6: On-device check.** Create a playlist, add three songs, reorder them, download the whole playlist, like a song, then remove a song from the library. Expected: counts update everywhere, and the removed song's file is gone (check on the Offline screen).
- [ ] **Step 7: Commit:** `feat: library, playlists and song menu screens`.

### Task 9: Search (screen 2)

**Files:**
- Create: `src/app/(tabs)/search.tsx`, `src/youtube/parseInput.ts`
- Test: `src/youtube/parseInput.test.ts`

**Interfaces:**
- Consumes: `youtube.search`, `playlistEntries` and `videoInfo` (Task 3), `repo.addSong` (Task 5), `usePlayer.playSongs` (Task 6).
- Produces: `parseInput(text: string): { kind: 'query'; q: string } | { kind: 'video'; id: string } | { kind: 'playlist'; url: string }`.

- [ ] **Step 1: Write the failing tests:**
  - `watch?v=` → video;
  - `youtu.be/<id>` → video;
  - `music.youtube.com/watch?v=<id>&list=…` → **playlist** (a `list` parameter means playlist);
  - `youtube.com/playlist?list=` → playlist;
  - `shorts/<id>` → video;
  - plain text → query, trimmed.
- [ ] **Step 2:** Run `npx jest src/youtube/parseInput`. Expected: FAIL.
- [ ] **Step 3:** Implement `parseInput`.
- [ ] **Step 4:** Run `npx jest`. Expected: PASS.
- [ ] **Step 5:** Build screen 2:
  - Library matches appear instantly as you type. YouTube results come after a 400 ms debounce, once you submit or stop typing.
  - Tapping a result plays it immediately without saving. **+** saves it to the library, and the icon animates into a ✓.
  - A pasted video shows one result.
  - A pasted playlist shows its tracks with "Add all" and "Add all to new playlist".
  - Search is disabled while offline, with the hint "Search needs internet".
- [ ] **Step 6: On-device check.** Search, play a result, save it, then paste a playlist URL and add everything to a new playlist. Expected: the songs appear in Library and in the new playlist.
- [ ] **Step 7: Commit:** `feat: search screen with link and playlist paste`.

### Task 10: Offline state and Settings

**Files:**
- Create: `src/components/OfflineBanner.tsx`, `src/app/(tabs)/settings.tsx`
- Modify: `src/app/_layout.tsx` (mount the banner)

**Interfaces:**
- Consumes: `useConnectivity` (Task 6), `useSettings` and `downloads` (Task 7), `youtube.version` and `update` (Task 3).

- [ ] **Step 1:** Build screen 10. The banner reads "You're offline — playing from your phone", in mint, and slides in and out with Reanimated. Non-downloaded rows grey out through `SongRow`'s existing logic, and the Search tab dims.
- [ ] **Step 2:** Build screen 13 without the sync section (Plan 2 adds it):
  - toggles for "Download on mobile data" (default off) and "Auto-download liked songs" (default on);
  - audio quality shown as "Best available (≈160 kbps)", read-only;
  - storage used, with "Clear all downloads" (confirm first, then remove every file and set the state to `none`);
  - a yt-dlp row showing `version()` with an Update button that calls `update()` and shows "Updated" or "Already up to date".
- [ ] **Step 3: On-device check.** Switch to airplane mode. Expected: the banner appears, downloaded songs still play, and Search is disabled. Toggle mobile-data downloads off while on cellular. Expected: the queue pauses.
- [ ] **Step 4: Commit:** `feat: offline banner and settings`.

### Task 11: Release APK and travel test

**Files:**
- Delete: `src/app/dev.tsx`
- Modify: `app.json` (version `1.0.0`); create `app/README.md` (build and install steps, firewall note for Plan 2)

- [ ] **Step 1:** Build a release APK. Run `npx expo prebuild -p android`, generate a keystore (`keytool`), point the release signing config at it (store the keystore outside the repo and document its location in the README), then run `cd android && ./gradlew assembleRelease`.
- [ ] **Step 2:** Run `adb install -r android/app/build/outputs/apk/release/app-release.apk`. Expected: `Success`.
- [ ] **Step 3: Travel test** on the release build. Download a playlist on Wi-Fi, then switch to airplane mode. Play for 30 minutes with the screen off, skipping from the lock screen and with headphones. Expected: no stops, no errors, and artwork visible.
- [ ] **Step 4: Commit:** `chore: release build setup and README`.
