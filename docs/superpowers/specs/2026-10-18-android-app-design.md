# Resonance Android app — design

Date: 2026-10-18 · Status: awaiting approval
Mockups (approved): `.superpowers/brainstorm/488684-1792338272/content/a-all-pages.html` (direction A, screens 1–13)

## 1. Intent

The owner listens to their favourite music, which lives on YouTube, mostly while travelling by train or bus. Spotify and YouTube Music are rejected for two reasons: ads (or a subscription) and dropped playback when the signal fluctuates. The Android app's job: **music that never stops because of the network, in the best quality YouTube offers, with no ads.**

The existing web app (and its backend) stays as-is and remains the main place for building the library at a desk. The phone is a full copy of the web library plus offline playback, kept in step with a manual **Sync**.

The current `app/` (Expo) is discarded entirely; nothing from its UI is reused.

## 2. Goals

1. Downloaded songs play with zero connectivity — no buffering, no errors, no stops.
2. Same library as the web: songs and playlists; search, add, remove and organise on the phone too (searching needs internet).
3. Explicit downloads: per song, per whole playlist, and automatically for liked songs. Downloaded songs are also listed in an **Offline** section.
4. Online, non-downloaded songs stream directly; offline they are shown greyed and skipped.
5. Manual two-way sync with the web over the same Wi-Fi via QR code (web shows QR, phone scans).
6. Background playback with lock-screen/notification controls and headphone/Bluetooth buttons.
7. A modern, animated UI following direction A (§6), using the web's colour theme.
8. **Sleep timer**: stop after 15 / 30 / 45 / 60 minutes or at the end of the current song.
9. **Super shuffle**: one tap shuffles every song that is in any playlist, each song once (no duplicates when a song is in several playlists), matching the web's feature. Offline, it uses only downloaded songs.
10. **Listening stats**: the phone records listening time locally (including offline) and shows it (§6 screen 14). At sync, the phone's listening history is sent to the backend's existing `listen_logs`, so the web's insights include phone listening too. Stats flow phone → web only.
11. **Home-screen widget** (if feasible on Expo 57 — last in the build order): artwork, title, play/pause, next.

## 3. Non-goals (v1)

- iPhone. Android only.
- Importing YouTube/YouTube Music playlists automatically (songs are added by hand; pasting a playlist URL in Search is fine).
- Automatic/background sync, cloud hosting, accounts, multi-user.
- Lyrics, equaliser (candidates for later).
- Play Store distribution. The app is sideloaded for personal use.

## 4. Anti-goals (failure even if it "works")

- A downloaded song stops, stutters or errors because the signal dropped.
- Getting on the bus and finding songs that were meant to be on the phone aren't.
- It feels like more effort than opening YouTube.
- Sync silently loses or resurrects things the owner changed.

## 5. Architecture (decided)

### 5.1 The phone is self-contained
The app does **not** need the backend to search, stream or download. It embeds **yt-dlp on the device** via the Android library `youtubedl-android` (the one the Seal app uses), wrapped in a local Expo native module (Kotlin, Expo Modules API). Requests come from the phone's own connection, which YouTube does not treat as a bot.

The module must provide at least: YouTube search, resolve-to-stream-URL (for online playback), download-to-file with progress and cancel, yt-dlp version, and in-app yt-dlp update.

Consequence: the app needs a development/production build (not Expo Go), and the APK grows (estimate 30–60 MB).

### 5.2 Local data
- The library (songs, playlists, membership, likes, download state) lives in an on-device database and is the source of truth on the phone.
- Downloaded audio is stored in the app's private storage. Format: best audio available (Opus/WebM, ≈160 kbps on YouTube; M4A fallback).
- Artwork for downloaded songs must also be available offline.

### 5.3 The backend's only role for the phone: sync
The backend (Node/Express/Postgres, already running on the owner's computer) gains:
- a **pairing endpoint** returning a short-lived one-time code plus the computer's Wi-Fi (LAN) address(es); the web turns this into a QR code;
- a **sync endpoint** that, given a valid code, exchanges changes with the phone and returns the result summary;
- **deletion tracking**: the existing web/backend delete paths (delete song, delete playlist, remove song from playlist) must record deletions so they can be propagated.

The backend already listens on `0.0.0.0:4000`. The owner's firewall must allow port 4000 on the LAN (one-time setup, documented in the README).

### 5.4 Sync rules (decided with the owner)
- Manual, at home, both devices on the same Wi-Fi. **The web always shows a QR; the phone always scans.** No mode choice.
- QR contains the backend LAN address(es) and a one-time code that expires after a few minutes, so nobody else on the network can sync.
- After sync, phone and web contain the same library.
- **Deletes win.** Removing a song from a playlist, deleting a playlist, or deleting a song from the library on either side is applied to the other side, even if the other side touched that item in the meantime. "Deletes win" applies to changes made between the same two syncs; re-adding a song later works normally.
- Deleting a song from the library also deletes its downloaded file from the phone.
- Only library data (plus the phone's listening history, one-way to the web) syncs. Audio files never move between computer and phone.

*Builder's call (constraints only):* the exact protocol and identity scheme. Requirements: songs are identified by YouTube ID; playlists created on either side keep one stable identity across both; renames resolve to the most recent change; must handle a phone that has never synced and a phone that hasn't synced for weeks.

### 5.5 Web changes
- A **Sync** entry (sidebar) opening a screen/modal that shows the QR, waits for the phone, then shows the summary (+ from phone, + to phone, removed).
- Liked songs appear on the web as a playlist named "Liked songs" (my call; keeps the web change minimal).
- Otherwise the web is unchanged.

## 6. UI (direction A — approved)

Visual language: album art sets the mood. Blurred-artwork backgrounds on the player and playlist headers, rounded cards, a floating mini-player pill, gentle depth. Colours from the web theme: near-black surfaces (`#0f0e10` → `#363436`), coral primary (`#ffb3af`, strong `#ff5959`), mint for "downloaded/offline" (`#5adcb2`), Inter font. Dark only.

Bottom navigation: **Library · Search · Offline · Settings**. Sync is the ⟳ button on Library (and in Settings).

| # | Screen | Must have |
|---|---|---|
| 1 | Library | Greeting, chips (All / Playlists / Liked), Play all / Shuffle all / **Super shuffle**, small "listened today" stat linking to screen 14, playlists carousel with download counts, all songs; ⟳ Sync |
| 2 | Search | Library matches first, then YouTube; tap = play now, + = save (becomes ✓); accepts pasted video/playlist links |
| 3 | Playlists | Grid, cover = first song's art, "⬇ ALL" badge when fully downloaded, + to create, long-press rename/delete, **Super shuffle** button |
| 4 | Playlist detail | Blurred header, Play / Shuffle / download-all, filter, per-song state (⬇ downloaded, progress ring, ☁ not downloaded), reorder |
| 5 | Now Playing | Expands from mini-player (shared-element style), artwork-tinted background, like, seek bar (waveform-styled), shuffle/prev/play/next/repeat, sleep timer, queue, add to playlist, swipe art to skip, swipe down to close |
| 6 | Queue | Sheet from the player; reorder, swipe to remove; offline-unavailable songs shown greyed and skipped |
| 7 | Song menu | Download / remove download, play next, add to queue, add to playlist, like, open in YouTube, remove from library |
| 8 | Lock screen / notification | Standard Android media controls; plays with screen off |
| 9 | Offline | Downloaded songs, storage used, download queue with pause/resume, Play offline / Shuffle |
| 10 | Signal drop | Banner "You're offline — playing from your phone"; greyed songs; Search disabled; playback uninterrupted |
| 11 | Sync scan | Camera opens immediately; hint about same Wi-Fi |
| 12 | Sync result | Counts each way + removed; offer to download newly added songs now |
| 14 | Listening stats (new, not in mockups — follow direction A) | Time listened today / this week / month / year / all time, most played songs, song of the day; works offline |
| 15 | Home-screen widget (new) | Artwork, title, play/pause, next; tapping opens the app |
| 13 | Settings | Sync (last synced), download on mobile data (default **off**), auto-download liked songs, audio quality (best), storage / clear downloads, yt-dlp version + Update |

Motion: mini-player → full player expansion, art crossfade/slide on skip, play/pause morph, list press feedback, download icon filling as it downloads, banner slide in/out. Smooth on a mid-range Android phone.

## 7. Constraints

- Android only, portrait. Sideloaded APK.
- Expo SDK 57 / React Native 0.86 era, TypeScript (matches the existing projects). Per `app/AGENTS.md`, check the versioned Expo v57 docs before writing code.
- Personal use only (YouTube ToS); not distributed.
- The web app and backend keep working exactly as today for existing features.

## 8. Calls I made (owner can veto)

1. Rebuild **inside the existing `app/` git repo** (delete all files, keep `.git`) so the old app stays recoverable from history. Deleting the folder outright would also delete its git history.
2. "Liked" is a special playlist that syncs like any other.
3. Downloads default to Wi-Fi only.
4. Online playback of non-downloaded songs streams on the phone (no backend involved).
5. Lyrics and equaliser are out of v1. Sleep timer, super shuffle, listening stats and the widget were added by the owner after the mockups.
6. Stats screen and widget have no mockup; they follow direction A. The widget is built last and dropped from v1 only if Expo 57 can't support it reasonably.

## 9. Left to the builder

- Audio/playback library choice (must satisfy §2.6 with both local files and remote stream URLs on Expo 57).
- On-device database choice and schema.
- Sync protocol details within §5.4.
- Animation library details, component structure, state management.
- Build/sideload method (local Gradle build or EAS).
- Order of work, with one recommendation: **prove the on-device yt-dlp module first** (search, stream, download on a real phone). It is the highest-risk piece, and everything else depends on it.
