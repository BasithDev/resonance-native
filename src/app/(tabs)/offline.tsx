import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '@/db/instance';
import { freeDiskSpace } from '@/downloads/files';
import { downloads, useDownloads, type PauseReason } from '@/downloads/manager';
import { libraryEvents } from '@/library/events';
import * as repo from '@/library/repo';
import type { Song } from '@/library/types';
import { artworkUri, usePlayer } from '@/player/store';
import { colors, font, layout, radii } from '@/theme/tokens';

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(n / 1e3))} KB`;
}

const PAUSE_TEXT: Record<PauseReason, string> = {
  user: 'Paused',
  offline: 'Waiting for internet',
  cellular: 'Paused on mobile data · allow it in Settings',
  network: 'Connection trouble · retrying soon',
};

function StorageCard({ count, usedBytes, freeBytes }: { count: number; usedBytes: number; freeBytes: number | null }) {
  const total = usedBytes + (freeBytes ?? 0);
  const share = total > 0 ? Math.min(1, usedBytes / total) : 0;
  return (
    <View style={styles.card}>
      <View style={styles.between}>
        <Text style={styles.cardText}>
          <Text style={styles.bold}>{count} {count === 1 ? 'song' : 'songs'}</Text> on this phone
        </Text>
        <Text style={styles.muted}>{fmtBytes(usedBytes)}</Text>
      </View>
      <View style={styles.track}>
        {/* At least a sliver, so a few songs still show on a big phone. */}
        <View style={[styles.fill, { width: `${usedBytes > 0 ? Math.max(share * 100, 1) : 0}%` }]} />
      </View>
      {freeBytes !== null ? <Text style={[styles.muted, styles.small]}>Phone storage: {fmtBytes(freeBytes)} free</Text> : null}
    </View>
  );
}

function DownloadCard({ activeSong }: { activeSong: Song | null }) {
  const { active, queuedCount, paused, pauseReason } = useDownloads();
  if (!active && queuedCount === 0) return null;
  const waiting = queuedCount > 0 ? `${queuedCount} waiting` : null;
  const title = active ? `Downloading · ${Math.round(active.percent)}%` : paused && pauseReason ? PAUSE_TEXT[pauseReason] : 'Starting downloads';
  const subtitle = [active ? activeSong?.title : null, waiting].filter(Boolean).join(' · ');
  // Offline / mobile-data pauses lift on their own; a network backoff can be retried now.
  const action = pauseReason === 'user' ? 'Resume' : pauseReason === 'network' ? 'Retry now' : pauseReason === null ? 'Pause' : null;
  return (
    <View style={[styles.card, styles.downloadCard]}>
      <MaterialIcons name={paused ? 'pause-circle-outline' : 'downloading'} size={26} color={colors.mint} />
      <View style={styles.flex}>
        <Text style={[styles.cardText, styles.bold]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={[styles.muted, styles.small]} numberOfLines={1}>{subtitle}</Text> : null}
        {active ? (
          <View style={[styles.track, styles.thinTrack]}>
            <View style={[styles.fill, { width: `${Math.min(100, active.percent)}%` }]} />
          </View>
        ) : null}
      </View>
      {action ? (
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          onPress={() => (action === 'Pause' ? downloads.pause() : downloads.resume())}>
          <Text style={styles.action}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function SongRow({ song, onPress, onLongPress, failed }: { song: Song; onPress?: () => void; onLongPress?: () => void; failed?: boolean }) {
  const art = artworkUri(song);
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.s2 }]}>
      <Image source={art ? { uri: art } : undefined} style={styles.thumb} contentFit="cover" />
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>{song.title}</Text>
        <Text style={styles.muted} numberOfLines={1}>
          {failed ? (song.downloadError ?? 'Download failed') : song.sizeBytes !== null ? fmtBytes(song.sizeBytes) : (song.channel ?? '')}
        </Text>
      </View>
      {failed ? (
        <Pressable hitSlop={8} accessibilityRole="button" onPress={() => void downloads.enqueue([song.youtubeId])}>
          <Text style={styles.action}>Retry</Text>
        </Pressable>
      ) : (
        <MaterialIcons name="download-done" size={18} color={colors.mint} />
      )}
    </Pressable>
  );
}

export default function OfflineScreen() {
  const insets = useSafeAreaInsets();
  const playSongs = usePlayer((s) => s.playSongs);
  const [songs, setSongs] = useState<Song[]>([]);
  const [freeBytes, setFreeBytes] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setSongs(await repo.listByDownload(await getDb(), ['done', 'downloading', 'failed']));
    try {
      setFreeBytes(freeDiskSpace());
    } catch {
      setFreeBytes(null);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    return libraryEvents.subscribe(() => refresh().catch(() => {}));
  }, [refresh]);

  const done = songs.filter((s) => s.download === 'done');
  const failed = songs.filter((s) => s.download === 'failed');
  const activeId = useDownloads().active?.youtubeId;
  const activeSong = songs.find((s) => s.youtubeId === activeId) ?? null;
  const usedBytes = done.reduce((sum, s) => sum + (s.sizeBytes ?? 0), 0);

  const confirmRemove = (song: Song) =>
    Alert.alert(song.title, 'Remove the download? The song stays in your library and streams when online.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove download', style: 'destructive', onPress: () => void downloads.removeDownload(song.youtubeId) },
    ]);

  type Item = { key: string; type: 'song'; song: Song; index: number } | { key: string; type: 'failed'; song: Song } | { key: string; type: 'label'; text: string };
  const items: Item[] = done.map((song, index) => ({ key: song.youtubeId, type: 'song', song, index }));
  if (failed.length > 0) {
    items.push({ key: 'failed-label', type: 'label', text: "Couldn't download" });
    failed.forEach((song) => items.push({ key: `f-${song.youtubeId}`, type: 'failed', song }));
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        contentContainerStyle={{ paddingBottom: layout.miniPlayer + 12 }}
        ListHeaderComponent={
          <>
            <Text style={styles.title}>Offline</Text>
            <StorageCard count={done.length} usedBytes={usedBytes} freeBytes={freeBytes} />
            <DownloadCard activeSong={activeSong} />
            <View style={styles.buttons}>
              <Pressable
                disabled={done.length === 0}
                onPress={() => playSongs(done, 0)}
                style={[styles.btn, styles.btnPrimary, done.length === 0 && styles.disabled]}>
                <MaterialIcons name="play-arrow" size={20} color={colors.onPrimary} />
                <Text style={[styles.btnText, { color: colors.onPrimary }]}>Play offline</Text>
              </Pressable>
              <Pressable
                disabled={done.length === 0}
                onPress={() => playSongs(done, Math.floor(Math.random() * done.length), { shuffle: true })}
                style={[styles.btn, done.length === 0 && styles.disabled]}>
                <MaterialIcons name="shuffle" size={18} color={colors.text} />
                <Text style={styles.btnText}>Shuffle</Text>
              </Pressable>
            </View>
            {done.length === 0 ? <Text style={styles.empty}>Songs you download play here with no signal.</Text> : null}
          </>
        }
        renderItem={({ item }) => {
          if (item.type === 'label') return <Text style={styles.section}>{item.text}</Text>;
          if (item.type === 'failed') return <SongRow song={item.song} failed />;
          return <SongRow song={item.song} onPress={() => playSongs(done, item.index)} onLongPress={() => confirmRemove(item.song)} />;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 28, paddingHorizontal: 16, marginBottom: 12 },
  card: { backgroundColor: colors.s2, borderRadius: radii.lg, padding: 14, marginHorizontal: 16, marginBottom: 10 },
  downloadCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardText: { color: colors.text, fontFamily: font.regular, fontSize: 14 },
  bold: { fontFamily: font.bold },
  muted: { color: colors.muted, fontFamily: font.regular, fontSize: 13 },
  small: { fontSize: 12, marginTop: 6 },
  track: { height: 6, borderRadius: radii.pill, backgroundColor: colors.s4, marginTop: 10, overflow: 'hidden' },
  thinTrack: { height: 4, marginTop: 8 },
  fill: { height: '100%', backgroundColor: colors.mint },
  flex: { flex: 1 },
  action: { color: colors.primary, fontFamily: font.semibold, fontSize: 14 },
  buttons: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  btn: {
    flex: 1, height: 44, borderRadius: radii.md, backgroundColor: colors.s3,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnText: { color: colors.text, fontFamily: font.bold, fontSize: 14 },
  disabled: { opacity: 0.4 },
  empty: { color: colors.muted, fontFamily: font.regular, fontSize: 14, textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
  section: {
    color: colors.muted, fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.8,
    textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  thumb: { width: 48, height: 48, borderRadius: radii.sm, backgroundColor: colors.s3 },
  rowTitle: { color: colors.text, fontFamily: font.medium, fontSize: 15 },
});
