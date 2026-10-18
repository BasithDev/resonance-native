# Resonance — Plan 2: QR Sync (backend + web + app) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pressing Sync makes the phone and web libraries identical, over the same Wi-Fi via a QR code, with deletes winning.

**Architecture:** The backend owns the merge. The phone sends its full library plus its deletions since the last sync. The backend merges that into Postgres, applying both sides' deletions, and returns the full merged library. The phone then adopts that result exactly. Web deletions are recorded in a new `deletions` table so a stale phone can't resurrect them. Pairing codes live in memory: single use, 5-minute expiry.

**Tech Stack:** Backend: Node/Express 5, Drizzle + Postgres, `node:test`. Web: React 19 + Vite + Tailwind 4, `qrcode.react`. App: Expo 57 (from Plan 1), `expo-camera` (barcode scanning), `expo-build-properties`.

**Spec:** `docs/superpowers/specs/2026-10-18-android-app-design.md` §5.3–5.5, screens 11–12. Plan 1 (`2026-10-18-android-plan-1-foundation.md`) supplies the app's `Db`, `repo`, tombstones and `downloads`.

## Global Constraints

- The web always shows the QR; the phone always scans. There's no mode choice.
- QR payload (exact JSON): `{"v":1,"urls":["http://<lan-ip>:<port>/api", ...],"code":"<code>"}`.
- Pairing code: 8 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, valid for 5 minutes, single use.
- **Deletes win** for changes made between the same two syncs. Removing a song from the library removes it from every playlist on both sides. The Liked playlist can never be deleted.
- Songs are keyed by YouTube ID. Playlists are keyed by UUID, shared across both sides. The Liked playlist's sync id is the literal `liked`.
- Renames and playlist order: the side with the newer `updatedAt` wins.
- After a successful sync, the phone's library equals the backend's library exactly. Phone downloads of songs no longer in the library are deleted.
- Existing web/backend behaviour stays unchanged apart from deletion recording and the "Liked songs" playlist appearing.
- Android must allow cleartext HTTP to the LAN (`android.usesCleartextTraffic: true` through `expo-build-properties`).

## Review Focus

1. **A phone that has never synced** (`lastSyncAt: null`) with an empty library, against a populated web. The phone should receive everything and the web should lose nothing.
2. **A phone that hasn't synced for weeks**, holding songs the web deleted in the meantime. They must not come back. (Test in Task 12.)
3. **The same song added on both sides between syncs.** There's one song afterwards, with no duplicate row and no error. (Test in Task 12.)
4. **An expired or already-used code**, or the phone scanning a QR from another app. The user sees a clear message and nothing changes. (Tests in Tasks 12 and 15.)
5. **A sync interrupted partway** (Wi-Fi drops after the server commits). The backend merge is one transaction. The phone keeps its tombstones until it gets a 200, so retrying is safe and idempotent. (Test in Task 12.)

---

## Sync contract (shared by Tasks 12–15)

```
GET  /api/sync/pair            -> 200 { code, expiresAt: number(ms), urls: string[] }
GET  /api/sync/status?code=    -> 200 { state: 'waiting' | 'done' | 'expired', summary?: SyncSummary }
POST /api/sync                 header X-Sync-Code: <code>
     body SyncRequest          -> 200 SyncResponse | 401 { error:{message:'Sync code expired or already used'} } | 422

SyncSong     = { youtubeId, title, channel: string|null, durationSec: number|null, thumbnailUrl: string|null, addedAt: number(ms) }
SyncPlaylist = { id: string, name: string, kind: 'user'|'liked', updatedAt: number(ms), songs: string[] /* youtubeIds, ordered */ }
Deletion     = { kind: 'song'|'playlist'|'membership', key: string, deletedAt: number(ms) }   // membership key "<playlistId>:<youtubeId>"
Listen       = { youtubeId: string, durationSec: number, playedAt: number(ms) }
SyncRequest  = { v: 1, lastSyncAt: number|null, songs: SyncSong[], playlists: SyncPlaylist[], deletions: Deletion[], listens: Listen[] }
SyncSummary  = { toPhone: { songs: number, playlists: number }, fromPhone: { songs: number, playlists: number },
                 removed: { songs: number, playlists: number } }
SyncResponse = { serverTime: number(ms), songs: SyncSong[], playlists: SyncPlaylist[], summary: SyncSummary }
```

**Merge algorithm** (backend, one transaction). Let `W` be the server deletions with `deleted_at > lastSyncAt` (all of them when `lastSyncAt` is null), and `P` the phone's deletions.
1. Apply `P` to the server: delete the songs, the playlists (skipping liked) and the memberships, recording each in `deletions`.
2. For each phone song: if its id is in `W` (song) or `P` (song), skip it. Otherwise insert it if missing (never overwrite existing metadata).
3. For each phone playlist: skip it if `W` or `P` holds a playlist deletion for its id. If the server doesn't have it, create it with the same id, name and `updatedAt`. If it exists, take name and order from the newer `updatedAt`. Membership is (server ∪ phone) minus every membership deletion in `W ∪ P` minus every deleted song, ordered by the newer side's order with the other side's extra songs appended in their own order.
4. Insert `listens` into `listen_logs` (resolving `song_id` by `youtube_id`, otherwise null).
5. Return the full server library. For the summary, `toPhone` counts songs/playlists in the response that weren't in the request, `fromPhone` counts songs/playlists created on the server in steps 2–3, and `removed` counts deletions applied in step 1 plus server deletions in `W` that matched phone items.

---

### Task 12: Backend — deletion tracking, liked playlist, pairing, sync endpoint

**Repo:** `backend/` (its own git repo; branch `sync`)

**Files:**
- Modify: `src/models/schema.js` (add `deletions(kind text, key text, deleted_at timestamptz default now(), primary key(kind,key))`; on `playlists` add `kind text not null default 'user'` and `updated_at timestamptz not null default now()`), plus a new SQL migration in `drizzle/`
- Modify: `src/services/song.service.js` (`deleteSong`), `src/services/playlist.service.js` (`deletePlaylist`, `removeSongFromPlaylist`, `addSongToPlaylist`, `updatePlaylist` bump `updated_at`; `deletePlaylist` rejects the liked playlist with 400 `Cannot delete "Liked songs"`)
- Create: `src/services/sync.service.js`, `src/services/pairing.service.js`, `src/controllers/sync.controller.js`, `src/routes/sync.routes.js`; mount at `/api/sync` in `src/routes/index.js`
- Create: `test/sync.test.js`, `test/helpers/db.js`; `package.json` script `"test": "node --test test/"`
- Modify: `README.md` (sync section and firewall note: `sudo ufw allow 4000/tcp` if ufw is enabled)

**Interfaces:**
- Produces: the sync contract above. `pairing.createCode(): {code, expiresAt}`, `pairing.consume(code): boolean`, `pairing.status(code)`, `pairing.markDone(code, summary)`. `sync.runSync(request): SyncResponse`. `lanUrls(port): string[]` lists the non-internal IPv4 interfaces as `http://<ip>:<port>/api`.
- Membership deletion key on the server: `<playlistId or 'liked'>:<youtubeId>`. The liked playlist row is created on demand by `ensureLikedPlaylist()` with name `Liked songs`, kind `liked`.

- [ ] **Step 1:** Add the test infrastructure. `test/helpers/db.js` creates a throwaway database `resonance_test_<pid>` on the local socket Postgres (`postgres://basith@localhost/<db>?host=/var/run/postgresql`), applies `drizzle/*.sql` in order, sets `process.env.DATABASE_URL` before the app modules are imported, and drops the database after the run.
- [ ] **Step 2: Write the failing tests** in `test/sync.test.js`:
  - `pair returns 8-char code from the allowed alphabet, expiry 5 minutes, and at least one url ending /api`
  - `sync with unknown code -> 401 'Sync code expired or already used'`; `code cannot be reused -> 401`
  - `first sync of empty phone receives full web library` (Review Focus 1)
  - `phone-added song and playlist appear on server with the same playlist id`
  - `song deleted on web after lastSyncAt is not resurrected by stale phone` (Review Focus 2)
  - `song deleted on phone is deleted on server including memberships; deletion recorded`
  - `deletes win: song in phone deletions is removed even though web added it to another playlist after lastSyncAt`
  - `same song added on both sides yields one row` (Review Focus 3)
  - `rename: newer updatedAt wins`; `order: newer side's order, other side's extras appended`
  - `liked: phone 'liked' maps to server Liked songs playlist; deletePlaylist on it returns 400`
  - `sync is idempotent: replaying the same request returns the same library` (Review Focus 5)
  - `listens are inserted into listen_logs`
  - `status returns waiting, then done with summary after sync`
- [ ] **Step 3:** Run `npm test`. Expected: FAIL.
- [ ] **Step 4:** Implement the migration, the service changes, the pairing service (in-memory `Map`, expired entries purged on access), the sync service following the merge algorithm (one Drizzle transaction), the controller with zod validation of `SyncRequest`, and the routes.
- [ ] **Step 5:** Run `npm test`. Expected: PASS. Then run `node --check` on every changed file.
- [ ] **Step 6: Commit:** `feat(sync): deletion tracking, pairing codes and phone sync endpoint`.

### Task 13: Web — Sync with phone modal

**Repo:** `web/` (branch `sync`)

**Files:**
- Create: `src/components/SyncModal.jsx`
- Modify: `src/components/Sidebar.jsx` (a "Sync with phone" item, icon `phonelink_ring`), `src/App.jsx` (modal state), `src/api/index.js` (`syncPair()`, `syncStatus(code)`), `package.json` (`qrcode.react`)

**Interfaces:**
- Consumes: `GET /api/sync/pair` and `GET /api/sync/status` (Task 12).

- [ ] **Step 1:** Implement `SyncModal`, styled in the web's existing design language:
  - On open, call `syncPair()` and render the QR (`QRCodeSVG`, 240 px, white background with margin) for the exact payload JSON.
  - Show the hint text "Open Resonance on your phone → Sync, and scan this code. Both devices must be on the same Wi-Fi."
  - Show a countdown, and automatically fetch a new code when it expires.
  - Poll `syncStatus` every 1500 ms. On `done`, show the summary ("↓ To phone: X songs, Y playlists · ↑ From phone: … · Removed: …") and refresh the library data that's on screen.
- [ ] **Step 2:** Verify with `npm run build` (expected: builds) and `npx eslint src/components/SyncModal.jsx` (expected: no errors in the new file). Run against a backend on `sync` and check in a browser that the QR renders and a curl POST to `/api/sync` flips the modal to the summary.
- [ ] **Step 3: Commit:** `feat(web): sync with phone QR modal`.

### Task 14: App — sync client (payload parsing, request building, applying the response)

**Repo:** `app/` (branch `rebuild-android`)

**Files:**
- Create: `src/sync/types.ts` (the contract types, copied verbatim), `src/sync/qr.ts`, `src/sync/client.ts`, `src/sync/apply.ts`
- Modify: `src/library/repo.ts` (add `exportForSync(db)`, `clearTombstones(db, upTo: number)`, `replaceLibrary(db, songs, playlists): { removedSongIds: string[] }`, `getLastSyncAt(db)` / `setLastSyncAt(db, t)` in `kv`)
- Test: `src/sync/qr.test.ts`, `src/sync/apply.test.ts`, `src/sync/client.test.ts`

**Interfaces:**
- Consumes: `Db`, `repo` and `listTombstones` (Plan 1 Task 5), `downloads.removeDownload` (Plan 1 Task 7), `listens.unsynced()` / `listens.markSynced(ids)` (Plan 3 Task 17; if Plan 3 hasn't merged yet, send `listens: []` behind a function `collectListens()` returning `[]`).
- Produces: `parseSyncQr(text): { urls: string[]; code: string } | null`, and `runSync(db, payload, deps): Promise<SyncSummary>`. `runSync` tries each url's `/health` (2 s timeout) and uses the first that answers. It posts with a 60 s timeout. On a 200 it calls `replaceLibrary`, removes the downloads of removed songs, clears tombstones up to the request time, saves `lastSyncAt = serverTime`, and marks listens synced. It throws `SyncError { kind: 'expired' | 'unreachable' | 'bad-qr' | 'server'; message }` with these messages: expired → `This code has expired — tap Sync on the web again`; unreachable → `Can't reach your computer — check both are on the same Wi-Fi`.

- [ ] **Step 1: Write the failing tests:**
  - `parseSyncQr accepts the exact payload; rejects non-JSON, v!==1, missing code` (Review Focus 4)
  - `exportForSync includes liked playlist with id 'liked' and tombstones as deletions`
  - `replaceLibrary makes local library equal response and returns removed song ids`
  - `runSync on 401 throws expired and leaves tombstones intact` (Review Focus 5)
  - `runSync on network failure for all urls throws unreachable`
  - `runSync success clears tombstones created before the request, keeps newer ones, stores lastSyncAt`
- [ ] **Step 2:** Run `npx jest src/sync`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx jest`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(app): sync client`.

### Task 15: App — Sync scan and result screens (11–12), Settings sync row

**Files:**
- Create: `src/app/sync.tsx` (scan → syncing → result/error states)
- Modify: `src/app/(tabs)/index.tsx` (wire the ⟳ button to `/sync`), `src/app/(tabs)/settings.tsx` (sync section: "Last synced <relative time>", opens `/sync`), `app.json` (plugins `expo-camera` with the camera permission text `Resonance uses the camera to scan the sync QR code on your computer.`, and `expo-build-properties` with `android.usesCleartextTraffic: true`)

**Interfaces:**
- Consumes: `parseSyncQr`, `runSync` and `SyncError` (Task 14), `downloads.enqueue` (Plan 1 Task 7).

- [ ] **Step 1:** Build screen 11 as in the mockup:
  - The camera opens immediately, with a coral scan frame and an animated scan line.
  - The hint reads "Open Sync on the web and point the camera at the QR code" over "Phone and computer must be on the same Wi-Fi".
  - Handle camera permission denial with a "Grant camera access" button.
  - A non-Resonance QR shows "That's not a Resonance sync code" and keeps scanning.
- [ ] **Step 2:** Build the syncing state (a spinner with "Syncing with your computer…") and screen 12:
  - a ✓ with "All synced";
  - rows for ↓ From web, ↑ From phone and 🗑 Removed;
  - the "Download the N new songs?" card with ⬇ Yes, calling `downloads.enqueue` on the newly added ids;
  - Done.
  Errors show the `SyncError` message with a Try again button.
- [ ] **Step 3:** Run `npx tsc --noEmit` (expected: clean) and `npx jest` (expected: PASS). `cd android && ./gradlew assembleDebug` must succeed.
- [ ] **Step 4: Commit:** `feat(app): sync scan and result screens`.
