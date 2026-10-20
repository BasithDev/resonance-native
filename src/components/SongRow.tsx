import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { downloads } from '@/downloads/manager';
import type { Song } from '@/library/types';
import { useConnectivity } from '@/net/connectivity';
import { artworkUri, isPlayable, selectCurrent, usePlayer } from '@/player/store';
import { colors, font, radii } from '@/theme/tokens';

import { PressableScale } from './PressableScale';

/** Every song row is this tall (the reorderable playlist list relies on it). */
export const SONG_ROW_H = 56;

/** `258` -> `4:18`. */
export function fmtTime(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '';
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** A circular progress ring drawn from two clipped half-rings (no SVG needed). */
export function ProgressRing({ percent, size = 16, stroke = 2.5 }: { percent: number; size?: number; stroke?: number }) {
  const angle = (Math.max(0, Math.min(100, percent)) / 100) * 360;
  const half = size / 2;
  // A half-ring (bottom + left borders) rotated into place inside each clipped half.
  const arc = (rotate: number, left: number) => (
    <View
      style={{
        position: 'absolute', left, top: 0, width: size, height: size, borderRadius: half, borderWidth: stroke,
        borderColor: 'transparent', borderBottomColor: colors.mint, borderLeftColor: colors.mint,
        transform: [{ rotate: `${rotate}deg` }],
      }}
    />
  );
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={`Downloading ${Math.round(percent)}%`}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: half, borderWidth: stroke, borderColor: colors.s4 }} />
      <View style={{ position: 'absolute', left: half, top: 0, width: half, height: size, overflow: 'hidden' }}>
        {arc(Math.min(angle, 180) + 45, -half)}
      </View>
      <View style={{ position: 'absolute', left: 0, top: 0, width: half, height: size, overflow: 'hidden' }}>
        {arc(Math.max(0, angle - 180) - 135, 0)}
      </View>
    </View>
  );
}

/** ⬇ mint when on the phone, a ring while downloading (empty while queued), grey ☁ otherwise. */
export function DownloadBadge({ song }: { song: Song }) {
  // Only this song's progress, so other rows don't re-render on every tick.
  const percent = downloads.store((s) => (s.active?.youtubeId === song.youtubeId ? s.active.percent : 0));
  switch (song.download) {
    case 'done':
      return <MaterialIcons name="download-done" size={18} color={colors.mint} accessibilityLabel="On phone" />;
    case 'downloading':
    case 'queued':
      return <ProgressRing percent={percent} />;
    case 'failed':
      return <MaterialIcons name="error-outline" size={18} color={colors.muted} accessibilityLabel="Download failed" />;
    default:
      return <MaterialIcons name="cloud-queue" size={18} color={colors.muted} style={styles.cloud} accessibilityLabel="Not on phone" />;
  }
}

export function SongRow({
  song, onPress, onMenu, onLongPress, showIndex,
}: {
  song: Song;
  onPress: () => void;
  onMenu: () => void;
  /** Defaults to opening the menu. */
  onLongPress?: () => void;
  /** 1-based number shown before the art (playlist order). */
  showIndex?: number;
}) {
  const { online } = useConnectivity();
  const isCurrent = usePlayer((s) => selectCurrent(s)?.youtubeId === song.youtubeId);
  const playable = isPlayable(song, online);
  const art = artworkUri(song);
  const sub = [song.channel, fmtTime(song.durationSec)].filter(Boolean).join(' · ');
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress ?? onMenu}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={song.title}
      style={styles.row}>
      {showIndex !== undefined ? <Text style={styles.index}>{showIndex}</Text> : null}
      <Image source={art ?? undefined} style={[styles.art, !playable && styles.dim]} contentFit="cover" transition={150} />
      <View style={[styles.text, !playable && styles.dim]}>
        <Text style={[styles.title, isCurrent && { color: colors.primary }]} numberOfLines={1}>
          {song.title}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      <DownloadBadge song={song} />
      <Pressable onPress={onMenu} hitSlop={8} style={styles.menu} accessibilityRole="button" accessibilityLabel="Song options">
        <MaterialIcons name="more-vert" size={20} color={colors.muted} />
      </Pressable>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: { height: SONG_ROW_H, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 4 },
  index: { width: 18, color: colors.muted, fontFamily: font.medium, fontSize: 12, textAlign: 'center' },
  art: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.s3 },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontFamily: font.semibold, fontSize: 14 },
  sub: { color: colors.muted, fontFamily: font.regular, fontSize: 12, marginTop: 1 },
  dim: { opacity: 0.38 },
  cloud: { opacity: 0.6 },
  menu: { width: 36, height: SONG_ROW_H, alignItems: 'center', justifyContent: 'center' },
});
