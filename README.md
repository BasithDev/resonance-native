# Resonance

A personal, offline-first Android music player (Expo SDK 57 / React Native 0.86 / TypeScript). Songs are identified by YouTube ID, downloaded as best-available audio with yt-dlp, and played from the phone. Android only, portrait, dark theme. Sideloaded APK from GitHub Releases, not on the Play Store. Personal use only (YouTube ToS).

## Download (Android)

**[Download the latest APK](https://github.com/BasithDev/resonance-native/releases/latest)**: open the latest release and tap `resonance-vX.Y.Z.apk`.

1. Download the APK on your Android phone (64-bit).
2. Open it and allow "Install unknown apps" for your browser when asked.
3. The app checks for new versions once a day (or from Settings → Check for updates) and shows the changelog when an update is available. Install the new APK over the old one; your library and downloads stay.

See [CHANGELOG.md](CHANGELOG.md) for what's new.

## Prerequisites

- JDK 17 at `~/.local/jdk/jdk-17*`
- Android SDK at `~/Android/Sdk`
- Node + npm (`npm install`)

```sh
export JAVA_HOME=$(ls -d ~/.local/jdk/jdk-17*)
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
```

## Dev build

```sh
npx expo run:android
```

## Release build

`android/` is generated and git-ignored. Release signing is injected into it by the config plugin `plugins/withReleaseSigning.js` during prebuild.

```sh
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

`-PreactNativeArchitectures=arm64-v8a` builds only for 64-bit phones, which gives a smaller, faster build.

Install on a connected phone:

```sh
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

### Publishing a release

APKs are published as GitHub Releases on `BasithDev/resonance-native`; the app's update check reads the latest one.

1. Bump `expo.version` in `app.json` (e.g. `1.0.1`) and `expo.android.versionCode` by 1.
2. Add a `## v1.0.1` section to `CHANGELOG.md`. It becomes the release notes and the text of the in-app update pop-up.
3. Commit, then run:

```sh
npm run release -- 1.0.1
```

`scripts/release.sh` checks that the version matches `app.json`, the tree is clean, the release does not exist yet, the changelog section exists and the keystore is in place. It then runs the release build above (JDK at `~/.local/jdk/jdk-17.0.20.1+1`, SDK at `~/Android/Sdk`), copies the APK to `dist/resonance-v1.0.1.apk` (git-ignored), tags `v1.0.1`, pushes the tag and creates the GitHub release with `gh` (must be logged in), marked as latest.

### Keystore

The release keystore and its passwords live outside the repo:

- `~/.resonance/resonance-release.keystore` (alias `resonance`, valid 10000 days)
- `~/.resonance/keystore.properties` (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`; chmod 600). `storeFile` must be an absolute path

Back both up somewhere safe. If you lose them you cannot update the installed app in place: Android will refuse an APK signed with a different key, and you would have to uninstall (losing downloads) first. If `keystore.properties` is missing, prebuild prints a warning and the release APK is debug-signed instead.

## Sync (Plan 2)

Sync talks to the backend over your LAN.

- Phone and computer must be on the same Wi-Fi.
- The backend must be running on port 4000.
- Run the backend migration first: `pnpm db:migrate`.
- If `ufw` is on, open the port: `sudo ufw allow 4000/tcp`.

## Troubleshooting

If songs stop loading or downloading ("YouTube changed something"), open Settings and tap Update next to yt-dlp (needs internet).
