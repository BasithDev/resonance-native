import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '@/db/instance';
import { libraryEvents } from '@/library/events';
import * as repo from '@/library/repo';
import type { Song, YtTrack } from '@/library/types';
import { useConnectivity } from '@/net/connectivity';
import { usePlayer } from '@/player/store';
import { colors, font, layout, radii } from '@/theme/tokens';
import * as youtube from '@/youtube/client';
import { parseInput } from '@/youtube/parseInput';

const DEBOUNCE_MS = 400;

const toTransientSong = (t: YtTrack): Song => ({
  youtubeId: t.youtubeId,
  title: t.title,
  channel: t.channel,
  durationSec: t.durationSec,
  thumbnailUrl: t.thumbnailUrl,
  addedAt: 0,
  download: 'none',
  filePath: null,
  artPath: null,
  sizeBytes: null,
  downloadError: null,
});

function fmtDuration(sec: number | null): string {
  if (sec === null) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

type Remote =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; tracks: YtTrack[]; isPlaylist: boolean; playlistUrl?: string };

/** "+" that pops and turns into a mint check once saved. */
function AddButton({ saved, onPress }: { saved: boolean; onPress: () => void }) {
  const scale = useSharedValue(1);
  const prev = useRef(saved);
  useEffect(() => {
    if (saved && !prev.current) scale.set(withSequence(withTiming(1.35, { duration: 120 }), withTiming(1, { duration: 160 })));
    prev.current = saved;
  }, [saved, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Pressable
      onPress={onPress}
      disabled={saved}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={saved ? 'In library' : 'Save to library'}
      style={[styles.addBtn, saved && styles.addBtnSaved]}>
      <Animated.View style={style}>
        <MaterialIcons name={saved ? 'check' : 'add'} size={20} color={saved ? colors.onMint : colors.primary} />
      </Animated.View>
    </Pressable>
  );
}

function Row({
  title, subtitle, thumb, downloaded, onPlay, right,
}: {
  title: string;
  subtitle: string;
  thumb: string | null;
  downloaded?: boolean;
  onPlay: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPlay} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.s2 }]}>
      <Image source={thumb ? { uri: thumb } : undefined} style={styles.thumb} contentFit="cover" />
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{subtitle}</Text>
      </View>
      {downloaded ? <MaterialIcons name="download-done" size={18} color={colors.mint} /> : null}
      {right}
    </Pressable>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { online } = useConnectivity();
  const playSongs = usePlayer((s) => s.playSongs);

  const [text, setText] = useState('');
  const [songs, setSongs] = useState<Song[]>([]);
  const [remote, setRemote] = useState<Remote>({ status: 'idle' });
  const [nameModal, setNameModal] = useState(false);
  const [playlistName, setPlaylistName] = useState('New playlist');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refreshLibrary = useCallback(async () => {
    setSongs(await repo.listSongs(await getDb()));
  }, []);

  useEffect(() => {
    refreshLibrary().catch(() => {});
    return libraryEvents.subscribe(() => refreshLibrary().catch(() => {}));
  }, [refreshLibrary]);

  const parsed = useMemo(() => parseInput(text), [text]);
  const libraryIds = useMemo(() => new Set(songs.map((s) => s.youtubeId)), [songs]);

  // Library matches are instant (query text only).
  const libraryMatches = useMemo(() => {
    if (parsed.kind !== 'query' || parsed.q === '') return [];
    const q = parsed.q.toLowerCase();
    return songs.filter((s) => s.title.toLowerCase().includes(q) || (s.channel ?? '').toLowerCase().includes(q));
  }, [parsed, songs]);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runRemote = useCallback(async () => {
    if (debounce.current) clearTimeout(debounce.current);
    const id = ++requestId.current;
    const input = parseInput(text);
    if (!online || (input.kind === 'query' && input.q === '')) {
      setRemote({ status: 'idle' });
      return;
    }
    setRemote({ status: 'loading' });
    try {
      let next: Remote;
      if (input.kind === 'video') {
        next = { status: 'done', tracks: [await youtube.videoInfo(input.id)], isPlaylist: false };
      } else if (input.kind === 'playlist') {
        next = { status: 'done', tracks: await youtube.playlistEntries(input.url), isPlaylist: true, playlistUrl: input.url };
      } else {
        next = { status: 'done', tracks: await youtube.search(input.q), isPlaylist: false };
      }
      if (id === requestId.current) setRemote(next);
    } catch (e) {
      if (id === requestId.current) {
        setRemote({ status: 'error', message: e instanceof Error ? e.message : 'Search failed' });
      }
    }
  }, [text, online]);

  // YouTube results follow typing after a 400 ms pause; submitting runs immediately.
  useEffect(() => {
    if (text.trim() === '') {
      requestId.current++;
      setRemote({ status: 'idle' });
      return;
    }
    const t = setTimeout(() => void runRemote(), DEBOUNCE_MS);
    debounce.current = t;
    return () => clearTimeout(t);
  }, [text, runRemote]);

  const save = useCallback(async (tracks: YtTrack[]) => {
    const db = await getDb();
    for (const t of tracks) await repo.addSong(db, t);
    libraryEvents.emit();
    return db;
  }, []);

  const fail = (e: unknown) => setSaveError(e instanceof Error ? e.message : 'Could not save');

  const saveOne = (t: YtTrack) => {
    setSaveError(null);
    save([t]).catch(fail);
  };

  const addAll = async (tracks: YtTrack[]) => {
    setSaveError(null);
    setBusy(true);
    try {
      await save(tracks);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const addAllToNewPlaylist = async (tracks: YtTrack[], name: string) => {
    setSaveError(null);
    setBusy(true);
    try {
      const db = await save(tracks);
      const pl = await repo.createPlaylist(db, name.trim() || 'New playlist');
      for (const t of tracks) await repo.addToPlaylist(db, pl.id, t.youtubeId);
      libraryEvents.emit();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const playTracks = (tracks: YtTrack[], index: number) => {
    // Prefer the library copy so downloaded songs play from file.
    const list = tracks.map((t) => songs.find((s) => s.youtubeId === t.youtubeId) ?? toTransientSong(t));
    playSongs(list, index);
  };

  const remoteTracks = remote.status === 'done' ? remote.tracks : [];
  const isPlaylist = remote.status === 'done' && remote.isPlaylist;
  // Tracks stay in the YouTube section (with a check once saved); drop them from the
  // library section so saving never makes a row jump between sections.
  const shownRemote = remoteTracks;
  const remoteIds = new Set(remoteTracks.map((t) => t.youtubeId));
  const libraryShown = remote.status === 'done' ? libraryMatches.filter((s) => !remoteIds.has(s.youtubeId)) : libraryMatches;

  type Item =
    | { key: string; type: 'label'; text: string }
    | { key: string; type: 'lib'; song: Song; index: number }
    | { key: string; type: 'yt'; track: YtTrack; index: number }
    | { key: string; type: 'actions'; tracks: YtTrack[] }
    | { key: string; type: 'status'; node: React.ReactNode };

  const items: Item[] = [];
  if (libraryShown.length > 0) {
    items.push({ key: 'l-label', type: 'label', text: 'In your library' });
    libraryShown.forEach((song, index) => items.push({ key: `l-${song.youtubeId}`, type: 'lib', song, index }));
  }
  if (!online) {
    // The offline hint sits under the input.
  } else if (remote.status === 'loading') {
    items.push({ key: 'loading', type: 'status', node: <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} /> });
  } else if (remote.status === 'error') {
    items.push({ key: 'error', type: 'status', node: <Text style={styles.hint}>{remote.message}</Text> });
  } else if (remote.status === 'done') {
    if (isPlaylist && remoteTracks.length > 0) {
      items.push({ key: 'actions', type: 'actions', tracks: remoteTracks });
    }
    if (shownRemote.length > 0) {
      items.push({ key: 'y-label', type: 'label', text: isPlaylist ? `${remoteTracks.length} tracks` : 'On YouTube' });
    }
    shownRemote.forEach((track, index) => items.push({ key: `y-${track.youtubeId}-${index}`, type: 'yt', track, index }));
    if (shownRemote.length === 0 && libraryShown.length === 0) {
      items.push({ key: 'empty', type: 'status', node: <Text style={styles.hint}>No results</Text> });
    }
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <Text style={styles.title}>Search</Text>
      <View style={styles.inputWrap}>
        <MaterialIcons name="search" size={20} color={colors.muted} />
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => void runRemote()}
          placeholder="Songs, artists, or paste a YouTube link"
          placeholderTextColor={colors.muted}
          style={styles.input}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          selectionColor={colors.primary}
        />
        {text !== '' ? (
          <Pressable onPress={() => setText('')} hitSlop={8} accessibilityLabel="Clear">
            <MaterialIcons name="close" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>
      {!online ? <Text style={styles.offlineHint}>Search needs internet</Text> : null}
      {saveError ? <Text style={[styles.offlineHint, { color: colors.primaryStrong }]}>{saveError}</Text> : null}

      <FlatList
        data={items}
        keyExtractor={(i) => i.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: layout.miniPlayer + 12 }}
        renderItem={({ item }) => {
          switch (item.type) {
            case 'label':
              return <SectionLabel>{item.text}</SectionLabel>;
            case 'status':
              return <View style={styles.status}>{item.node}</View>;
            case 'lib':
              return (
                <Row
                  title={item.song.title}
                  subtitle={[item.song.channel, fmtDuration(item.song.durationSec)].filter(Boolean).join(' · ')}
                  thumb={item.song.thumbnailUrl}
                  downloaded={item.song.download === 'done'}
                  onPlay={() => playSongs(libraryShown, item.index)}
                />
              );
            case 'yt':
              return (
                <Row
                  title={item.track.title}
                  subtitle={[item.track.channel, fmtDuration(item.track.durationSec)].filter(Boolean).join(' · ')}
                  thumb={item.track.thumbnailUrl}
                  onPlay={() => playTracks(shownRemote, item.index)}
                  right={<AddButton saved={libraryIds.has(item.track.youtubeId)} onPress={() => saveOne(item.track)} />}
                />
              );
            case 'actions':
              return (
                <View style={styles.actions}>
                  <Pressable disabled={busy} onPress={() => void addAll(item.tracks)} style={[styles.chip, styles.chipPrimary]}>
                    <Text style={[styles.chipText, { color: colors.onPrimary }]}>Add all</Text>
                  </Pressable>
                  <Pressable disabled={busy} onPress={() => setNameModal(true)} style={styles.chip}>
                    <Text style={[styles.chipText, { color: colors.primary }]}>Add all to new playlist</Text>
                  </Pressable>
                </View>
              );
          }
        }}
      />

      <Modal transparent animationType="fade" visible={nameModal} onRequestClose={() => setNameModal(false)}>
        <View style={styles.scrim}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>New playlist</Text>
            <TextInput
              value={playlistName}
              onChangeText={setPlaylistName}
              style={styles.dialogInput}
              selectTextOnFocus
              autoFocus
              selectionColor={colors.primary}
              placeholderTextColor={colors.muted}
            />
            <View style={styles.dialogButtons}>
              <Pressable onPress={() => setNameModal(false)} style={styles.dialogBtn}>
                <Text style={[styles.chipText, { color: colors.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setNameModal(false);
                  void addAllToNewPlaylist(remoteTracks, playlistName);
                }}
                style={styles.dialogBtn}>
                <Text style={[styles.chipText, { color: colors.primary }]}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 28, paddingHorizontal: 16, marginBottom: 12 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, paddingHorizontal: 14,
    height: 48, borderRadius: radii.pill, backgroundColor: colors.s3,
  },
  input: { flex: 1, color: colors.text, fontFamily: font.regular, fontSize: 15, padding: 0 },
  offlineHint: { color: colors.muted, fontFamily: font.regular, fontSize: 13, marginHorizontal: 20, marginTop: 8 },
  section: {
    color: colors.muted, fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.8,
    textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  thumb: { width: 48, height: 48, borderRadius: radii.sm, backgroundColor: colors.s3 },
  rowText: { flex: 1 },
  rowTitle: { color: colors.text, fontFamily: font.medium, fontSize: 15 },
  rowSub: { color: colors.muted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  addBtn: {
    width: 34, height: 34, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.s3,
  },
  addBtnSaved: { backgroundColor: colors.mint },
  status: { alignItems: 'center', paddingHorizontal: 24 },
  hint: { color: colors.muted, fontFamily: font.regular, fontSize: 14, textAlign: 'center', marginTop: 24 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 16 },
  chip: { paddingHorizontal: 16, height: 38, borderRadius: radii.pill, backgroundColor: colors.s3, justifyContent: 'center' },
  chipPrimary: { backgroundColor: colors.primary },
  chipText: { fontFamily: font.semibold, fontSize: 14 },
  scrim: { flex: 1, backgroundColor: `${colors.bg}cc`, justifyContent: 'center', padding: 32 },
  dialog: { backgroundColor: colors.s2, borderRadius: radii.xl, padding: 20 },
  dialogTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 18, marginBottom: 12 },
  dialogInput: {
    color: colors.text, fontFamily: font.regular, fontSize: 15, backgroundColor: colors.s3,
    borderRadius: radii.md, paddingHorizontal: 14, height: 46,
  },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  dialogBtn: { paddingHorizontal: 14, paddingVertical: 8 },
});
