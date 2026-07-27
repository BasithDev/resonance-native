# 🎵 Resonance Native — Mobile Audio Player & YouTube Music Library

<div align="center">
  <h3>High-Performance YouTube Music Player & Library for React Native</h3>
  <p>Stream, search, curate playlists, and sync your YouTube music collection with Supabase Cloud Postgres.</p>
</div>

---

## ✨ Features

- **🎵 Master Library**: Browse all imported tracks with instant playback, track filtering, and playlist management.
- **🔍 YouTube Search**: Search YouTube songs and artists live, with 1-click preview streaming and single-tap library ingestion.
- **📑 Playlists & Hero Controls**: Create custom playlists, shuffle, cycle repeat modes (`Loop Off` ➔ `Loop All` ➔ `Loop Single`), and filter tracks within playlists.
- **🔀 Super Shuffle**: Deduplicated cross-playlist shuffle powered by backend algorithm.
- **🔗 Link Resolver**: Paste single video URLs or full YouTube playlist links to extract audio into your library.
- **🎧 Persistent Player**: Glassmorphic Mini-Player bar and expandable Full-Screen Player overlay with artwork glow, -10s/+10s seek controls, timeline scrubber, and active queue drawer.
- **⚡ Cloud Postgres & Auto-Discovery**: Powered by Supabase Cloud Postgres with automatic server connection auto-discovery and fallback.

---

## 🛠️ Tech Stack

- **Framework**: [Expo SDK 57](https://expo.dev/) + [React Native 0.86](https://reactnative.dev/)
- **Navigation**: [Expo Router v57](https://docs.expo.dev/router/introduction/) (File-based tabs & stack routing)
- **Audio Engine**: `expo-audio` (Background audio playback & lock screen media controls)
- **Database & Sync**: [Supabase Cloud Postgres](https://supabase.com/) + Drizzle ORM
- **UI & Icons**: `@expo/vector-icons`, `react-native-safe-area-context`, custom dark design system tokens (`#141315` background, Coral Red `#ff5959` accent).
- **Package Manager**: `pnpm`

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure the **Resonance Backend** server (`resonance-backend`) is running.

### 2. Installation
```bash
git clone https://github.com/BasithDev/resonance-native.git
cd resonance-native
pnpm install
```

### 3. Running the App
```bash
pnpm start
# or for tunnel mode across Wi-Fi networks:
pnpm expo start --tunnel
```

Scan the QR code with **Expo Go** on iOS or Android!

---

## 📱 Server Connection
The app defaults to your local or cloud backend server. You can change the backend host anytime by tapping the **Hardware Chip icon** at the top right of the Library screen or via **Settings ➔ Backend Server URL**.
