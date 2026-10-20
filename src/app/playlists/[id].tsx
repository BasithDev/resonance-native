// Playlist detail (mockup screen 4): blurred header, Play / Shuffle / download all,
// filter, and long-press drag to reorder.
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, type NativeGesture, ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeInDown, type SharedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArtworkBackdrop } from '@/components/ArtworkBackdrop';
import { usePlaylistActions } from '@/components/PlaylistActions';
import { PlaylistCover } from '@/components/PlaylistCard';
import { PressableScale } from '@/components/PressableScale';
import { type Drag, IDLE_DRAG, moveItem, reorderPan, useDragSlotStyle } from '@/components/reorder';
import { SongMenu } from '@/components/SongMenu';
import { SONG_ROW_H, SongRow } from '@/components/SongRow';
import { showToast } from '@/components/Toast';
import { getDb } from '@/db/instance';
import { downloads } from '@/downloads/manager';
import { playlistName } from '@/library/actions';
import { libraryEvents } from '@/library/events';
import * as repo from '@/library/repo';
import type { Song } from '@/library/types';
import { useLibrary } from '@/library/useLibrary';
import { artworkUri, usePlayer } from '@/player/store';
import { formatDuration } from '@/stats/format';
import { colors, font, layout, radii } from '@/theme/tokens';

const LONG_PRESS_MS = 300;

/** The playlist's songs in order, re-read after every library write. */
function usePlaylistSongs(id: string) {
  const [songs, setSongs] = useState<Song[] | null>(null);
  useEffect(() => {
    let alive = true;
    let seq = 0;
    const load = () => {
      const mine = ++seq;
      getDb()
        .then((db) => repo.getPlaylistSongs(db, id))
        .then((s) => alive && mine === seq && setSongs(s))
        .catch((e) => console.warn('[playlist] load failed', e));
    };
    load();
    const off = libraryEvents.subscribe(load);
    return () => {
      alive = false;
      off();
    };
  }, [id]);
  return [songs, setSongs] as const;
}

function DraggableRow({
  song, pos, count, drag, scroll, enabled, onMove, onPress, onMenu,
}: {
  song: Song;
  pos: number;
  count: number;
  drag: SharedValue<Drag>;
  scroll: NativeGesture;
  enabled: boolean;
  onMove: (from: number, to: number) => void;
  onPress: () => void;
  onMenu: () => void;
}) {
  const slot = useDragSlotStyle(drag, pos, SONG_ROW_H);
  const pan = reorderPan({ pos, count, rowHeight: SONG_ROW_H, drag, scroll, onMove })
    .activateAfterLongPress(LONG_PRESS_MS)
    .enabled(enabled);
  return (
    <Animated.View style={[styles.slot, slot]}>
      <GestureDetector gesture={pan}>
        <Animated.View entering={pos < 12 ? FadeInDown.delay(pos * 30) : undefined}>
          <SongRow
            song={song}
            showIndex={pos + 1}
            onPress={onPress}
            onMenu={onMenu}
            // While reordering is possible, a long press lifts the row instead of opening the menu.
            onLongPress={enabled ? () => {} : undefined}
          />
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

export default function PlaylistScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { playlists, loaded } = useLibrary();
  const playlist = playlists.find((p) => p.id === id) ?? null;
  const [songs, setSongs] = usePlaylistSongs(id);
  const [filter, setFilter] = useState('');
  const [menuSong, setMenuSong] = useState<Song | null>(null);
  const playSongs = usePlayer((s) => s.playSongs);
  const actions = usePlaylistActions(); // a deleted playlist closes this screen (effect below)

  const drag = useSharedValue<Drag>(IDLE_DRAG);
  const scroll = useMemo(() => Gesture.Native(), []);
  useLayoutEffect(() => {
    drag.set(IDLE_DRAG); // the moved row is now in its new place
  }, [songs, drag]);

  // The playlist was deleted (here or by a sync): leave.
  useEffect(() => {
    if (loaded && !playlist) router.back();
  }, [loaded, playlist]);

  const all = songs ?? [];
  const q = filter.trim().toLowerCase();
  const filtering = q.length > 0;
  const shown = filtering
    ? all.filter((s) => s.title.toLowerCase().includes(q) || (s.channel ?? '').toLowerCase().includes(q))
    : all;

  if (!playlist) return <View style={styles.root} />;
  const name = playlistName(playlist);
  const source = { label: name };
  const totalSec = all.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);
  const onPhone = all.filter((s) => s.download === 'done').length;
  const toDownload = all.filter((s) => s.download === 'none' || s.download === 'failed');
  const allOnPhone = all.length > 0 && onPhone === all.length;
  const cover = all[0] ? artworkUri(all[0]) : null;

  const play = (index: number, shuffle = false) => {
    if (all.length > 0) playSongs(all, index, { shuffle, source });
  };

  const downloadAll = () => {
    if (toDownload.length === 0) {
      showToast(allOnPhone ? 'Every song is on the phone' : 'Already downloading');
      return;
    }
    void downloads.enqueue(toDownload.map((s) => s.youtubeId)).catch(() => showToast("Couldn't start the downloads"));
    showToast(`Downloading ${toDownload.length} ${toDownload.length === 1 ? 'song' : 'songs'}`);
  };

  const move = (from: number, to: number) => {
    const next = moveItem(all, from, to);
    setSongs(next);
    void (async () => {
      await repo.reorderPlaylist(await getDb(), playlist.id, next.map((s) => s.youtubeId));
      libraryEvents.emit();
    })().catch((e) => {
      console.warn('[playlist] reorder failed', e);
      showToast("Couldn't save the new order");
      libraryEvents.emit(); // re-read the saved order
    });
  };

  return (
    <View style={styles.root}>
      <GestureDetector gesture={scroll}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: layout.miniPlayer + 12 + insets.bottom }}>
          <View style={styles.backdrop}>
            <ArtworkBackdrop uri={cover} opacity={0.5} />
          </View>

          <View style={[styles.nav, { paddingTop: insets.top + 4 }]}>
            <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={styles.navBtn}>
              <MaterialIcons name="arrow-back" size={24} color={colors.text} />
            </Pressable>
            <Pressable
              onPress={() => actions.openOptions(playlist)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Playlist options"
              style={styles.navBtn}>
              <MaterialIcons name="more-horiz" size={24} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.hero}>
            <View style={styles.coverShadow}>
              <PlaylistCover playlist={playlist} size={112} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.title} numberOfLines={2}>
                {name}
              </Text>
              <Text style={styles.meta}>
                {all.length} {all.length === 1 ? 'song' : 'songs'}
                {totalSec > 0 ? ` · ${formatDuration(totalSec)}` : ''}
              </Text>
              {all.length > 0 ? (
                <Text style={styles.onPhone}>
                  ⬇ {allOnPhone ? 'All on phone' : `${onPhone} of ${all.length} on phone`}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.buttons}>
            <PressableScale
              disabled={all.length === 0}
              onPress={() => play(0)}
              style={[styles.btn, styles.btnPrimary, all.length === 0 && styles.disabled]}
              accessibilityRole="button">
              <MaterialIcons name="play-arrow" size={20} color={colors.onPrimary} />
              <Text style={[styles.btnText, { color: colors.onPrimary }]}>Play</Text>
            </PressableScale>
            <PressableScale
              disabled={all.length === 0}
              onPress={() => play(Math.floor(Math.random() * all.length), true)}
              style={[styles.btn, all.length === 0 && styles.disabled]}
              accessibilityRole="button">
              <MaterialIcons name="shuffle" size={18} color={colors.text} />
              <Text style={styles.btnText}>Shuffle</Text>
            </PressableScale>
            <PressableScale
              disabled={all.length === 0}
              onPress={downloadAll}
              style={[styles.btn, styles.dlBtn, all.length === 0 && styles.disabled]}
              accessibilityRole="button"
              accessibilityLabel="Download the whole playlist">
              <MaterialIcons name={allOnPhone ? 'download-done' : 'download'} size={20} color={colors.mint} />
            </PressableScale>
          </View>

          <View style={styles.filter}>
            <MaterialIcons name="search" size={18} color={colors.muted} />
            <TextInput
              value={filter}
              onChangeText={setFilter}
              placeholder="Filter in playlist"
              placeholderTextColor={colors.muted}
              cursorColor={colors.primary}
              selectionColor={colors.primary}
              style={styles.filterInput}
            />
            {filtering ? (
              <Pressable onPress={() => setFilter('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear filter">
                <MaterialIcons name="close" size={18} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>

          {songs !== null && all.length === 0 ? (
            <Text style={styles.empty}>
              {playlist.kind === 'liked' ? 'Songs you ♥ show up here.' : 'No songs yet. Add some from a song’s ⋯ menu.'}
            </Text>
          ) : null}
          {filtering && shown.length === 0 && all.length > 0 ? <Text style={styles.empty}>No matches</Text> : null}

          <View style={{ height: shown.length * SONG_ROW_H }}>
            {shown.map((s, pos) => (
              <DraggableRow
                key={s.youtubeId}
                song={s}
                pos={pos}
                count={shown.length}
                drag={drag}
                scroll={scroll}
                enabled={!filtering}
                onMove={move}
                onPress={() => play(all.indexOf(s))}
                onMenu={() => setMenuSong(s)}
              />
            ))}
          </View>
        </ScrollView>
      </GestureDetector>

      <SongMenu song={menuSong} onClose={() => setMenuSong(null)} playlist={playlist} />
      {actions.dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, height: 340, overflow: 'hidden' },
  nav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  navBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'flex-end', gap: 14, paddingHorizontal: 16, paddingTop: 8 },
  coverShadow: { borderRadius: radii.lg, elevation: 12, backgroundColor: colors.s3 },
  heroText: { flex: 1, minWidth: 0, paddingBottom: 2 },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 24, letterSpacing: -0.4 },
  meta: { color: colors.muted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  onPhone: { color: colors.mint, fontFamily: font.medium, fontSize: 13, marginTop: 4 },
  buttons: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  btn: {
    flex: 1, height: 44, borderRadius: radii.md, backgroundColor: colors.s3,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  btnPrimary: { backgroundColor: colors.primary },
  dlBtn: { flex: 0, width: 48 },
  btnText: { color: colors.text, fontFamily: font.bold, fontSize: 14 },
  disabled: { opacity: 0.4 },
  filter: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6,
    height: 40, borderRadius: radii.md, backgroundColor: colors.s2, paddingHorizontal: 12,
  },
  filterInput: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 14, paddingVertical: 0 },
  empty: { color: colors.muted, fontFamily: font.regular, fontSize: 14, textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },
  slot: { position: 'absolute', left: 0, right: 0, height: SONG_ROW_H, backgroundColor: colors.bg },
});
