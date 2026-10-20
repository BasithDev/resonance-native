/**
 * Where downloads live: audio in `Paths.document/audio/<id>.<ext>` (named by yt-dlp),
 * artwork in `Paths.document/art/<id>.jpg`. Paths handed out are bare absolute paths
 * (what the library stores); expo-file-system itself works with file:// URIs.
 */
import { Directory, File, Paths } from 'expo-file-system';

import type { DownloadFs } from './manager';

const audioDir = () => new Directory(Paths.document, 'audio');
const artDir = () => new Directory(Paths.document, 'art');

/** `file:///data/.../audio/` → `/data/.../audio` */
export function barePath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');
}

/** Deletes every `<id>.*` in `dir` (including yt-dlp's `.part` leftovers). */
function deleteMatching(dir: Directory, youtubeId: string) {
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    if (entry instanceof File && entry.name.startsWith(`${youtubeId}.`)) {
      try {
        entry.delete();
      } catch {
        // already gone
      }
    }
  }
}

export const expoDownloadFs: DownloadFs = {
  ensureDirs() {
    audioDir().create({ idempotent: true, intermediates: true });
    artDir().create({ idempotent: true, intermediates: true });
  },
  audioDir: () => barePath(audioDir().uri),
  deleteAudio: (id) => deleteMatching(audioDir(), id),
  deleteArt: (id) => deleteMatching(artDir(), id),
  async downloadArt(url, id) {
    const file = await File.downloadFileAsync(url, new File(artDir(), `${id}.jpg`), { idempotent: true });
    return barePath(file.uri);
  },
};

/** Free space on the phone's internal storage, in bytes. */
export function freeDiskSpace(): number {
  return Paths.availableDiskSpace;
}
