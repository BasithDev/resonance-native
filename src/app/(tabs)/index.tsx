// Library home (mockup screen 1): greeting, filters, play buttons, playlists carousel, all songs.
import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePlaylistActions } from '@/components/PlaylistActions';
import { GRID_GAP, openPlaylist, PlaylistCard, useGridCellWidth } from '@/components/PlaylistCard';
import { PressableScale } from '@/components/PressableScale';
import { SongMenu } from '@/components/SongMenu';
import { SONG_ROW_H, SongRow } from '@/components/SongRow';
import { getDb } from '@/db/instance';
import type { Song } from '@/library/types';
import { useLibrary } from '@/library/useLibrary';
import { usePlaylistSongs } from '@/library/usePlaylistSongs';
import { runSuperShuffle } from '@/player/superShuffle';
import { usePlayer } from '@/player/store';
import { formatDuration } from '@/stats/format';
import { getStats } from '@/stats/queries';
import { colors, font, layout, radii } from '@/theme/tokens';

type Filter = 'all' | 'playlists' | 'liked';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'playlists', label: 'Playlists' },
  { key: 'liked', label: 'Liked' },
];

/** Rows past this many appear without a stagger. */
const STAGGER_ROWS = 12;

function greeting(hour: number): string {
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Today's listening time, re-read whenever the screen is shown. */
function useListenedToday(): number | null {
  const [sec, setSec] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      getDb()
        .then((db) => getStats(db, Date.now()))
        .then((s) => alive && setSec(s.todaySec))
        .catch((e) => console.warn('[library] listened-today stat failed', e));
      return () => {
        alive = false;
      };
    }, []),
  );
  return sec;
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const { songs, playlists, loaded } = useLibrary();
  const liked = usePlaylistSongs('liked')[0] ?? [];
  const today = useListenedToday();
  const playSongs = usePlayer((s) => s.playSongs);
  const [filter, setFilter] = useState<Filter>('all');
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const cellWidth = useGridCellWidth();
  const playlistActions = usePlaylistActions();

  const shown = filter === 'liked' ? liked : filter === 'all' ? songs : [];
  const source = filter === 'liked' ? { label: 'Liked songs' } : undefined;

  const header = (
    <View>
      <View style={styles.top}>
        <Text style={styles.h1}>{greeting(new Date().getHours())}</Text>
        <PressableScale onPress={() => router.push('/sync')} style={styles.sync} accessibilityRole="button" accessibilityLabel="Sync">
          <MaterialIcons name="sync" size={20} color={colors.text} />
        </PressableScale>
      </View>

      <View style={styles.pills}>
        <PressableScale onPress={() => router.push('/stats')} style={styles.pill} accessibilityRole="button" accessibilityLabel="Listening stats">
          <MaterialIcons name="schedule" size={15} color={colors.primary} />
          <Text style={styles.pillText}>Listened today {today === null ? '–' : formatDuration(today)}</Text>
        </PressableScale>
        <PressableScale onPress={() => void runSuperShuffle()} style={styles.pill} accessibilityRole="button">
          <MaterialIcons name="all-inclusive" size={15} color={colors.primary} />
          <Text style={styles.pillText}>Super shuffle</Text>
        </PressableScale>
      </View>

      <View style={styles.chips}>
        {FILTERS.map((f) => (
          <PressableScale
            key={f.key}
            onPress={() => setFilter(f.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
            style={[styles.chip, filter === f.key && styles.chipOn]}>
            <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
          </PressableScale>
        ))}
      </View>

      {filter !== 'playlists' ? (
        <View style={styles.buttons}>
          <PressableScale
            disabled={shown.length === 0}
            onPress={() => playSongs(shown, 0, { source })}
            style={[styles.btn, styles.btnPrimary, shown.length === 0 && styles.disabled]}
            accessibilityRole="button">
            <MaterialIcons name="play-arrow" size={20} color={colors.onPrimary} />
            <Text style={[styles.btnText, { color: colors.onPrimary }]}>Play all</Text>
          </PressableScale>
          <PressableScale
            disabled={shown.length === 0}
            onPress={() => playSongs(shown, Math.floor(Math.random() * shown.length), { shuffle: true, source })}
            style={[styles.btn, shown.length === 0 && styles.disabled]}
            accessibilityRole="button">
            <MaterialIcons name="shuffle" size={18} color={colors.text} />
            <Text style={styles.btnText}>Shuffle all</Text>
          </PressableScale>
        </View>
      ) : null}

      {filter === 'all' && playlists.length > 0 ? (
        <>
          <View style={styles.sec}>
            <Text style={styles.secText}>Your playlists</Text>
            <Pressable onPress={() => router.push('/playlists')} hitSlop={8} accessibilityRole="button">
              <Text style={styles.secLink}>See all</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
            {playlists.map((p, i) => (
              <Animated.View key={p.id} entering={FadeInDown.delay(Math.min(i, 6) * 40)}>
                <PlaylistCard playlist={p} variant="carousel" onPress={() => openPlaylist(p)} />
              </Animated.View>
            ))}
          </ScrollView>
        </>
      ) : null}

      {filter === 'all' ? <Text style={[styles.sec, styles.secText]}>All songs · {songs.length}</Text> : null}
      {filter === 'liked' ? <Text style={[styles.sec, styles.secText]}>Liked songs · {liked.length}</Text> : null}
    </View>
  );

  if (filter === 'playlists') {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
        <FlatList
          key="grid"
          data={playlists}
          keyExtractor={(p) => p.id}
          numColumns={2}
          ListHeaderComponent={header}
          columnWrapperStyle={styles.gridRow}
          contentContainerStyle={{ paddingBottom: layout.miniPlayer + 12 }}
          renderItem={({ item, index }) => (
            <Animated.View style={{ width: cellWidth }} entering={FadeInDown.delay(Math.min(index, STAGGER_ROWS) * 30)}>
              <PlaylistCard
                playlist={item}
                variant="grid"
                onPress={() => openPlaylist(item)}
                onLongPress={() => playlistActions.openOptions(item)}
              />
            </Animated.View>
          )}
        />
        {playlistActions.dialog}
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <FlatList
        key={filter}
        data={shown}
        keyExtractor={(s) => s.youtubeId}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingBottom: layout.miniPlayer + 12 }}
        ListEmptyComponent={
          loaded ? (
            <Text style={styles.empty}>
              {filter === 'liked' ? 'Songs you ♥ show up here.' : 'Your library is empty. Find songs in Search.'}
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={index < STAGGER_ROWS ? FadeInDown.delay(index * 30) : undefined} style={{ height: SONG_ROW_H }}>
            <SongRow song={item} onPress={() => playSongs(shown, index, { source })} onMenu={() => setMenuSong(item)} />
          </Animated.View>
        )}
      />
      <SongMenu song={menuSong} onClose={() => setMenuSong(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 4 },
  h1: { color: colors.text, fontFamily: font.bold, fontSize: 26, letterSpacing: -0.4 },
  sync: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.s3, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12,
    borderRadius: radii.pill, backgroundColor: colors.s2,
  },
  pillText: { color: colors.text, fontFamily: font.medium, fontSize: 12 },
  chips: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: colors.s3 },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontFamily: font.medium, fontSize: 13 },
  chipTextOn: { color: colors.onPrimary, fontFamily: font.bold },
  buttons: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  btn: {
    flex: 1, height: 44, borderRadius: radii.md, backgroundColor: colors.s3,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnText: { color: colors.text, fontFamily: font.bold, fontSize: 14 },
  disabled: { opacity: 0.4 },
  sec: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  secText: { color: colors.text, fontFamily: font.bold, fontSize: 15 },
  secLink: { color: colors.primary, fontFamily: font.medium, fontSize: 13 },
  carousel: { gap: 12, paddingHorizontal: 16, paddingBottom: 4 },
  gridRow: { gap: GRID_GAP, paddingHorizontal: 16, marginBottom: 14 },
  empty: { color: colors.muted, fontFamily: font.regular, fontSize: 14, textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
});
