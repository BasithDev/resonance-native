// Song menu (mockup screen 7): the same actions everywhere a song is shown.
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '@/db/instance';
import { downloads } from '@/downloads/manager';
import { playlistName, toggleLikeSong, useIsLiked } from '@/library/actions';
import { libraryEvents } from '@/library/events';
import * as repo from '@/library/repo';
import type { DownloadState, Playlist, Song } from '@/library/types';
import { artworkUri, usePlayer } from '@/player/store';
import { colors, font, radii } from '@/theme/tokens';

import { usePlaylistActions } from './PlaylistActions';
import { fmtTime } from './SongRow';
import { showToast } from './Toast';

type IconName = React.ComponentProps<typeof MaterialIcons>['name'];

const STATE_TEXT: Record<DownloadState, string> = {
  none: 'not downloaded',
  queued: 'waiting to download',
  downloading: 'downloading',
  done: 'on phone',
  failed: 'download failed',
};

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

function Option({ icon, label, color = colors.text, iconColor, onPress }: {
  icon: IconName;
  label: string;
  color?: string;
  iconColor?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.opt, pressed && { backgroundColor: colors.s3 }]}>
      <MaterialIcons name={icon} size={20} color={iconColor ?? color} />
      <Text style={[styles.optText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const report = (what: string) => (e: unknown) => {
  console.warn(`[song menu] ${what} failed`, e);
  showToast(`Couldn't ${what}`);
};

/**
 * Bottom sheet for one song; `song` null hides it. Inside a playlist, pass `playlist`
 * to offer "Remove from <playlist>".
 */
export function SongMenu({ song, onClose, playlist }: { song: Song | null; onClose: () => void; playlist?: Playlist }) {
  const insets = useSafeAreaInsets();
  const liked = useIsLiked(song?.youtubeId ?? null);
  const [picking, setPicking] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [shown, setShown] = useState(song);
  if (song !== shown) {
    setShown(song);
    setPicking(false); // every song opens on the main actions
  }

  const actions = usePlaylistActions({
    onCreated: (p) => {
      if (song) void addTo(p, song);
    },
  });

  useEffect(() => {
    if (!picking) return;
    let alive = true;
    getDb()
      .then((db) => repo.listPlaylists(db))
      .then((all) => alive && setPlaylists(all.filter((p) => p.kind === 'user')))
      .catch(report('load playlists'));
    return () => {
      alive = false;
    };
  }, [picking]);

  async function addTo(p: Playlist, s: Song) {
    try {
      await repo.addToPlaylist(await getDb(), p.id, s.youtubeId);
      libraryEvents.emit();
      showToast(`Added to ${playlistName(p)}`);
    } catch (e) {
      report('add to the playlist')(e);
    }
    onClose();
  }

  if (!song) return null;
  const id = song.youtubeId;

  /** Runs the action after closing the sheet. */
  const act = (fn: () => void | Promise<unknown>, what: string) => () => {
    onClose();
    Promise.resolve()
      .then(fn)
      .catch(report(what));
  };

  const confirmRemove = () => {
    onClose();
    Alert.alert(`Remove "${song.title}"?`, 'It leaves your library and every playlist, and its download is deleted.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void downloads.removeSongCompletely(id).catch(report('remove the song')),
      },
    ]);
  };

  const download =
    song.download === 'done' ? (
      <Option icon="delete-outline" label="Remove download (keep in library)" onPress={act(() => downloads.removeDownload(id), 'remove the download')} />
    ) : song.download === 'queued' || song.download === 'downloading' ? (
      <Option icon="close" label="Cancel download" onPress={act(() => downloads.cancel(id), 'cancel the download')} />
    ) : (
      <Option
        icon="download"
        iconColor={colors.mint}
        label={song.download === 'failed' ? 'Retry download' : 'Download to phone'}
        onPress={act(() => downloads.enqueue([id]), 'start the download')}
      />
    );

  const sub = [song.channel, fmtTime(song.durationSec), STATE_TEXT[song.download]].filter(Boolean).join(' · ');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={picking ? () => setPicking(false) : onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close menu" />
      <Animated.View entering={SlideInDown.duration(240)} style={[styles.sheet, { paddingBottom: insets.bottom + 14 }]}>
        <View style={styles.grab} />
        <View style={styles.head}>
          <Image source={artworkUri(song) ?? undefined} style={styles.art} contentFit="cover" />
          <View style={styles.headText}>
            <Text style={styles.title} numberOfLines={1}>
              {song.title}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {sub}
            </Text>
          </View>
        </View>

        {picking ? (
          <ScrollView style={styles.pickList}>
            <Option icon="arrow-back" label="Add to playlist" color={colors.muted} onPress={() => setPicking(false)} />
            <Option icon="add" iconColor={colors.primary} label="New playlist…" onPress={actions.create} />
            {playlists.map((p) => (
              <Option key={p.id} icon="queue-music" label={p.name} onPress={() => void addTo(p, song)} />
            ))}
          </ScrollView>
        ) : (
          <>
            {download}
            <Option icon="skip-next" label="Play next" onPress={act(() => {
              usePlayer.getState().playNext(song);
              showToast('Playing next');
            }, 'queue the song')} />
            <Option icon="queue-music" label="Add to queue" onPress={act(() => {
              usePlayer.getState().enqueue(song);
              showToast('Added to queue');
            }, 'queue the song')} />
            <Option icon="playlist-add" label="Add to playlist…" onPress={() => setPicking(true)} />
            <Option
              icon={liked ? 'favorite' : 'favorite-border'}
              iconColor={liked ? colors.primary : colors.text}
              label={liked ? 'Unlike' : 'Like'}
              onPress={act(() => toggleLikeSong(id), 'update Liked songs')}
            />
            {playlist && playlist.kind === 'user' ? (
              <Option
                icon="playlist-remove"
                label={`Remove from ${playlist.name}`}
                onPress={act(async () => {
                  await repo.removeFromPlaylist(await getDb(), playlist.id, id);
                  libraryEvents.emit();
                }, 'remove it from the playlist')}
              />
            ) : null}
            <Option icon="open-in-new" label="Open in YouTube" onPress={act(() => Linking.openURL(youtubeUrl(id)), 'open YouTube')} />
            <Option icon="delete-forever" label="Remove from library" color={colors.primaryStrong} onPress={confirmRemove} />
          </>
        )}
      </Animated.View>
      {actions.dialog}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: `${colors.bg}b3` },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.s2,
    borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingTop: 8,
  },
  grab: { width: 36, height: 4, borderRadius: 4, backgroundColor: colors.s4, alignSelf: 'center', marginTop: 4, marginBottom: 10 },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingBottom: 12, marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.s4,
  },
  art: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.s4 },
  headText: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 15 },
  sub: { color: colors.muted, fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  pickList: { maxHeight: 360 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, paddingVertical: 12 },
  optText: { fontFamily: font.medium, fontSize: 15 },
});
