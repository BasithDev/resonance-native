# Resonance

A personal, offline-first Android music player (Expo SDK 57 / React Native 0.86 / TypeScript). Songs are identified by YouTube ID, downloaded as best-available audio with yt-dlp, and played from the phone. Android only, portrait, dark theme. Sideloaded APK, not published. Personal use only (YouTube ToS).

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
