import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { playlistName } from '@/library/actions';
import type { Playlist } from '@/library/types';
import { colors, font, radii } from '@/theme/tokens';

import { PressableScale } from './PressableScale';

export function openPlaylist(p: Pick<Playlist, 'id'>) {
  router.push({ pathname: '/playlists/[id]', params: { id: p.id } });
}

/** Grid layout: two columns, 16 side gutters, 12 between. */
export const GRID_GAP = 12;
export function useGridCellWidth(): number {
  const { width } = useWindowDimensions();
  return (width - 32 - GRID_GAP) / 2;
}

const songs = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`;
const fullyDownloaded = (p: Playlist) => p.songCount > 0 && p.downloadedCount === p.songCount;

/** The cover: the first song's art, or a heart for Liked songs. */
export function PlaylistCover({ playlist, size, radius = radii.lg }: { playlist: Playlist; size: number | '100%'; radius?: number }) {
  const box = { width: size, aspectRatio: 1, borderRadius: radius } as const;
  if (playlist.kind === 'liked') {
    return (
      <View style={[box, styles.cover, styles.liked]}>
        <MaterialIcons name="favorite" size={typeof size === 'number' ? size * 0.32 : 34} color={colors.text} />
      </View>
    );
  }
  return (
    <View style={[box, styles.cover]}>
      {playlist.coverUrl ? (
        <Image source={playlist.coverUrl} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <MaterialIcons name="queue-music" size={typeof size === 'number' ? size * 0.32 : 34} color={colors.muted} />
      )}
    </View>
  );
}

/**
 * `carousel`: a fixed-size tile with "⬇ x/y" (mint once all are on the phone).
 * `grid`: fills its column, shows the song count and a "⬇ ALL" badge when fully downloaded.
 */
export function PlaylistCard({
  playlist, variant, onPress, onLongPress,
}: {
  playlist: Playlist;
  variant: 'carousel' | 'grid';
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const all = fullyDownloaded(playlist);
  const name = playlistName(playlist);
  const gridSub =
    playlist.downloadedCount > 0 && !all
      ? `${songs(playlist.songCount)} · ${playlist.downloadedCount} offline`
      : songs(playlist.songCount);
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={name}
      style={variant === 'carousel' ? styles.carousel : styles.grid}>
      <View>
        <PlaylistCover playlist={playlist} size={variant === 'carousel' ? 104 : '100%'} />
        {variant === 'grid' && all ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>⬇ ALL</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {variant === 'carousel' ? (
        <Text style={[styles.sub, all && { color: colors.mint }]} numberOfLines={1}>
          ⬇ {playlist.downloadedCount}/{playlist.songCount}
        </Text>
      ) : (
        <Text style={styles.sub} numberOfLines={1}>
          {gridSub}
        </Text>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  carousel: { width: 104 },
  grid: { flex: 1 },
  cover: { overflow: 'hidden', backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' },
  // Solid primaryStrong always shows; the gradient on top is supported on RN 0.86 Android
  // (ReactViewManager / BackgroundStyleApplicator) and also used by ArtworkBackdrop.
  liked: {
    backgroundColor: colors.primaryStrong,
    experimental_backgroundImage: `linear-gradient(135deg, ${colors.primaryStrong}, ${colors.s3})`,
  },
  badge: {
    position: 'absolute', right: 8, top: 8, backgroundColor: colors.mint,
    borderRadius: radii.pill, paddingHorizontal: 7, paddingVertical: 2,
  },
  badgeText: { color: colors.onMint, fontFamily: font.bold, fontSize: 10 },
  name: { color: colors.text, fontFamily: font.semibold, fontSize: 13, marginTop: 6 },
  sub: { color: colors.muted, fontFamily: font.regular, fontSize: 11, marginTop: 1 },
});
