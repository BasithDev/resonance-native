#!/usr/bin/env bash
# Build a release APK locally and publish it as a GitHub Release.
#
#   ./scripts/release.sh 1.0.1      (or: npm run release -- 1.0.1)
#
# Before running:
#   1. Bump "version" in app.json to the same version (and android.versionCode by 1).
#   2. Add a "## v1.0.1" section to CHANGELOG.md (it becomes the release
#      notes and the in-app "Update available" pop-up).
#   3. Commit everything.
# Needs: JDK 17, Android SDK, gh (logged in), the release keystore in
# ~/.resonance (see README), a clean git tree.
set -euo pipefail

VERSION="${1:?usage: scripts/release.sh <version>  e.g. 1.0.1}"
TAG="v${VERSION}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export JAVA_HOME="$HOME/.local/jdk/jdk-17.0.20.1+1"
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

APP_VERSION="$(node -p "require('./app.json').expo.version")"
if [[ "$APP_VERSION" != "$VERSION" ]]; then
  echo "app.json version is $APP_VERSION, expected $VERSION — bump it first." >&2; exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean — commit first." >&2; exit 1
fi
if gh release view "$TAG" >/dev/null 2>&1; then
  echo "Release $TAG already exists." >&2; exit 1
fi
if [[ ! -x "$JAVA_HOME/bin/java" ]]; then
  echo "No JDK at $JAVA_HOME." >&2; exit 1
fi
if [[ ! -d "$ANDROID_HOME" ]]; then
  echo "No Android SDK at $ANDROID_HOME." >&2; exit 1
fi
# Without it plugins/withReleaseSigning.js leaves the APK debug-signed, and it
# would not install over the real app.
if [[ ! -f "$HOME/.resonance/keystore.properties" ]]; then
  echo "Missing ~/.resonance/keystore.properties — the APK would be debug-signed." >&2; exit 1
fi

# Release notes = the "## vX.Y.Z" section of CHANGELOG.md
NOTES="$(mktemp)"
trap 'rm -f "$NOTES"' EXIT
awk -v tag="## ${TAG}" '
  $0 == tag { found = 1; next }
  found && /^## v/ { exit }
  found { print }
' CHANGELOG.md > "$NOTES"
if ! grep -q '[^[:space:]]' "$NOTES"; then
  echo "No '## ${TAG}' section in CHANGELOG.md." >&2; exit 1
fi

echo "▶ Building ${TAG} (arm64-v8a)…"
npx expo prebuild -p android --clean --no-install
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a)

mkdir -p dist
APK="dist/resonance-${TAG}.apk"
cp android/app/build/outputs/apk/release/app-release.apk "$APK"
echo "  $(du -h "$APK" | cut -f1)  $APK"

echo "▶ Publishing GitHub release ${TAG}…"
git tag -a "$TAG" -m "Resonance ${TAG}"
git push origin "$TAG"
gh release create "$TAG" "$APK" --title "Resonance ${TAG}" --notes-file "$NOTES" --latest

echo "✔ Released ${TAG}"
