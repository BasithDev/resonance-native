import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  TextInput,
  Alert,
  Image,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAudio, Track } from '../../../context/AudioContext';
import { SongItem } from '../../../components/SongItem';
import { Theme } from '../../../constants/theme';
import * as api from '../../../services/api';

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { playTrack, playerTrack, isPlaying } = useAudio();

  const [playlist, setPlaylist] = useState<any>(null);
  const [songs, setSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const isDeletingRef = useRef(false);

  useEffect(() => {
    isDeletingRef.current = false;
    if (id && id !== 'index' && id !== 'undefined') {
      loadDetails();
    }
  }, [id]);

  function handleGoBack() {
    router.replace('/(tabs)/playlists/index' as any);
  }

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        handleGoBack();
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [])
  );

  async function loadDetails() {
    if (!id || id === 'index' || id === 'undefined' || isDeletingRef.current) return;
    try {
      setLoading(true);
      if (id === 'all-songs') {
        const data = await api.getSongs();
        const songsList = data || [];
        const firstThumb = songsList.find((s: any) => s.thumbnailUrl || s.coverUrl);
        setPlaylist({
          id: 'all-songs',
          name: 'All Songs',
          coverUrl: firstThumb?.thumbnailUrl || firstThumb?.coverUrl,
        });
        setSongs(songsList);
      } else {
        const data = await api.getPlaylistDetails(id as string);
        if (isDeletingRef.current) return;
        const songsList = data?.songs || [];
        const firstThumb = songsList.find((s: any) => s.thumbnailUrl || s.coverUrl);
        setPlaylist({
          ...data,
          coverUrl: data?.coverUrl || firstThumb?.thumbnailUrl || firstThumb?.coverUrl,
        });
        setSongs(songsList);
      }
    } catch (e: any) {
      if (isDeletingRef.current || e?.status === 404 || e?.message?.includes('404')) {
        return;
      }
      console.error('Error loading playlist details:', e);
      Alert.alert('Error', 'Failed to load playlist details.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletePlaylist() {
    if (id === 'all-songs') {
      Alert.alert('System Collection', '"All Songs" is a default collection and cannot be deleted.');
      return;
    }

    Alert.alert('Delete Playlist', `Are you sure you want to delete "${playlist?.name || 'this playlist'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            isDeletingRef.current = true;
            await api.deletePlaylist(id as string);
            handleGoBack();
          } catch (e: any) {
            isDeletingRef.current = false;
            console.error('Delete playlist error:', e);
            Alert.alert('Delete Failed', e?.message || 'Failed to delete playlist');
          }
        },
      },
    ]);
  }

  async function handleRemoveSong(songId: string) {
    try {
      await api.removeSongFromPlaylist(id as string, songId);
      setSongs((prev) => prev.filter((s) => s.id !== songId));
    } catch (e) {
      Alert.alert('Error', 'Failed to remove song from playlist.');
    }
  }

  const filteredSongs = songs.filter((s) => {
    if (!filterQuery.trim()) return true;
    const q = filterQuery.toLowerCase();
    return s.title?.toLowerCase().includes(q) || s.channel?.toLowerCase().includes(q);
  });

  const heroCoverUrl =
    playlist?.coverUrl ||
    songs.find((s) => s.thumbnailUrl || s.coverUrl)?.thumbnailUrl ||
    songs.find((s) => s.thumbnailUrl || s.coverUrl)?.coverUrl;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={handleGoBack} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={Theme.colors.onSurface} />
        </TouchableOpacity>

        <Text style={styles.topBarTitle} numberOfLines={1}>
          {playlist?.name || 'Playlist'}
        </Text>

        {id !== 'all-songs' ? (
          <TouchableOpacity onPress={handleDeletePlaylist} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={22} color={Theme.colors.error} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 34 }} />
        )}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredSongs}
          keyExtractor={(item) => item.id || Math.random().toString()}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
              {/* Hero Banner */}
              <View style={styles.heroSection}>
                {heroCoverUrl ? (
                  <Image source={{ uri: heroCoverUrl }} style={styles.heroCoverImage} resizeMode="cover" />
                ) : (
                  <View style={styles.heroIconBox}>
                    <Ionicons name="musical-notes" size={40} color={Theme.colors.primary} />
                  </View>
                )}
                <Text style={styles.heroTitle}>{playlist?.name}</Text>
                <Text style={styles.heroSub}>
                  {songs.length} {songs.length === 1 ? 'track' : 'tracks'}
                </Text>

                {/* Hero Actions */}
                <View style={styles.heroActions}>
                  <TouchableOpacity
                    style={[styles.heroBtn, { backgroundColor: Theme.colors.primary }]}
                    onPress={() => songs.length > 0 && playTrack(songs[0], songs)}
                  >
                    <Ionicons name="play" size={20} color="#ffffff" />
                    <Text style={styles.heroBtnText}>Play</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.heroBtn, { backgroundColor: Theme.colors.surfaceContainerHigh }]}
                    onPress={() => songs.length > 0 && playTrack(songs[0], songs, { shuffle: true })}
                  >
                    <Ionicons name="shuffle" size={20} color={Theme.colors.primary} />
                    <Text style={[styles.heroBtnText, { color: Theme.colors.onSurface }]}>
                      Shuffle
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* In-Playlist Search Filter */}
              <View style={styles.searchBar}>
                <Ionicons name="search" size={18} color={Theme.colors.subtext} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search inside playlist..."
                  placeholderTextColor={Theme.colors.subtext}
                  value={filterQuery}
                  onChangeText={setFilterQuery}
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No songs in this playlist yet.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const currentId = playerTrack?.id || playerTrack?.youtubeId;
            const itemMatches = currentId && (item.id === currentId || item.youtubeId === currentId);

            return (
              <SongItem
                track={item}
                isCurrent={Boolean(itemMatches)}
                isPlaying={Boolean(itemMatches && isPlaying)}
                onPress={() => playTrack(item, songs)}
                onMorePress={() => {
                  Alert.alert(item.title, 'Playlist Options', [
                    {
                      text: 'Remove from Playlist',
                      style: 'destructive',
                      onPress: () => handleRemoveSong(item.id!),
                    },
                    { text: 'Cancel', style: 'cancel' },
                  ]);
                }}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.sm,
  },
  iconBtn: {
    padding: 6,
  },
  topBarTitle: {
    color: Theme.colors.onSurface,
    fontSize: 17,
    fontWeight: '700',
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: Theme.spacing.lg,
  },
  heroIconBox: {
    width: 84,
    height: 84,
    borderRadius: 20,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  heroCoverImage: {
    width: 110,
    height: 110,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  heroTitle: {
    color: Theme.colors.onSurface,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  heroSub: {
    color: Theme.colors.subtext,
    fontSize: 14,
    marginBottom: Theme.spacing.lg,
  },
  heroActions: {
    flexDirection: 'row',
    gap: Theme.spacing.md,
  },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.full,
    gap: 8,
  },
  heroBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainer,
    marginHorizontal: Theme.spacing.lg,
    marginVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.md,
    height: 40,
    borderRadius: Theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  searchInput: {
    flex: 1,
    color: Theme.colors.onSurface,
    marginLeft: Theme.spacing.sm,
    fontSize: 13,
  },
  listContent: {
    paddingBottom: 140,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    padding: Theme.spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: Theme.colors.subtext,
    fontSize: 14,
  },
});
