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
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAudio, Track } from '../../../context/AudioContext';
import { SongItem } from '../../../components/SongItem';
import { Theme } from '../../../constants/theme';
import * as api from '../../../services/api';

function formatTotalRuntime(songs?: any[]): string {
  if (!songs || songs.length === 0) return '';
  const totalSec = songs.reduce((sum, s) => sum + (s.durationSec || s.duration_sec || 0), 0);
  if (totalSec <= 0) return '';

  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins} min${mins !== 1 ? 's' : ''}`;
}

export default function PlaylistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { playTrack, playerTrack, isPlaying } = useAudio();

  const [playlist, setPlaylist] = useState<any>(null);
  const [songs, setSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameInput, setRenameInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeletingRef = useRef(false);

  useEffect(() => {
    isDeletingRef.current = false;
    if (id && id !== 'index' && id !== 'undefined') {
      loadDetails();
    }
  }, [id]);

  function handleGoBack() {
    router.replace('/playlists' as any);
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

  function handleDeletePlaylist() {
    if (id === 'all-songs') return;
    setIsDeleteModalOpen(true);
  }

  async function confirmDeletePlaylist() {
    try {
      setIsDeleting(true);
      isDeletingRef.current = true;
      await api.deletePlaylist(id as string);
      setIsDeleteModalOpen(false);
      router.replace('/playlists' as any);
    } catch (e: any) {
      setIsDeleting(false);
      isDeletingRef.current = false;
      console.error('Delete playlist error:', e);
      Alert.alert('Delete Failed', e?.message || 'Failed to delete playlist');
    }
  }

  async function handleRenamePlaylist() {
    if (!renameInput.trim() || id === 'all-songs') return;
    try {
      await api.updatePlaylist(id as string, renameInput.trim());
      setPlaylist((prev: any) => ({ ...prev, name: renameInput.trim() }));
      setIsRenameModalOpen(false);
    } catch (e: any) {
      Alert.alert('Error', 'Failed to rename playlist');
    }
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

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.topBarTitle} numberOfLines={1}>
            {playlist?.name || 'Playlist'}
          </Text>
          {id !== 'all-songs' && (
            <TouchableOpacity
              onPress={() => {
                setRenameInput(playlist?.name || '');
                setIsRenameModalOpen(true);
              }}
              style={{ padding: 4 }}
            >
              <Ionicons name="pencil" size={16} color={Theme.colors.primary} />
            </TouchableOpacity>
          )}
        </View>

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
                  {songs.length} {songs.length === 1 ? 'track' : 'tracks'}{formatTotalRuntime(songs) ? ` • ${formatTotalRuntime(songs)}` : ''}
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

      {/* Delete Confirmation Modal */}
      <Modal
        visible={isDeleteModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !isDeleting && setIsDeleteModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalIconCircle}>
              <Ionicons name="trash-outline" size={28} color={Theme.colors.error} />
            </View>
            <Text style={styles.modalTitle}>Delete Playlist?</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to delete "{playlist?.name}"? This action cannot be undone.
            </Text>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelModalBtn]}
                onPress={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, styles.deleteModalBtn, isDeleting && { opacity: 0.6 }]}
                onPress={confirmDeletePlaylist}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.deleteModalBtnText}>Delete</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Rename Playlist Modal */}
      <Modal
        visible={isRenameModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRenameModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={[styles.modalIconCircle, { backgroundColor: 'rgba(255, 89, 89, 0.15)' }]}>
              <Ionicons name="pencil" size={26} color={Theme.colors.primary} />
            </View>
            <Text style={styles.modalTitle}>Rename Playlist</Text>

            <TextInput
              style={{
                width: '100%',
                backgroundColor: Theme.colors.surfaceContainerHigh,
                color: Theme.colors.onSurface,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: Theme.borderRadius.md,
                fontSize: 15,
                marginVertical: 16,
                borderWidth: 1,
                borderColor: Theme.colors.border,
              }}
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="Playlist name..."
              placeholderTextColor={Theme.colors.subtext}
              autoFocus
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.cancelModalBtn]}
                onPress={() => setIsRenameModalOpen(false)}
              >
                <Text style={styles.cancelModalBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: Theme.colors.primary }]}
                onPress={handleRenamePlaylist}
              >
                <Text style={styles.deleteModalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Theme.spacing.md,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: Theme.colors.surfaceContainer,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  modalIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 82, 82, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    color: Theme.colors.onSurface,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  modalMessage: {
    color: Theme.colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelModalBtn: {
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  cancelModalBtnText: {
    color: Theme.colors.onSurface,
    fontSize: 14,
    fontWeight: '700',
  },
  deleteModalBtn: {
    backgroundColor: Theme.colors.error,
  },
  deleteModalBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
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
