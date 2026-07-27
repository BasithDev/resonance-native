import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudio, Track } from '../../context/AudioContext';
import { SongItem } from '../../components/SongItem';
import { AddToPlaylistModal } from '../../components/AddToPlaylistModal';
import { Theme } from '../../constants/theme';
import * as api from '../../services/api';

export default function LibraryScreen() {
  const { playTrack, playerTrack, isPlaying, superShufflePlay, setIsServerModalOpen } = useAudio();
  const [songs, setSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSong, setSelectedSong] = useState<Track | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    loadSongs();
  }, []);

  async function loadSongs() {
    try {
      setLoading(true);
      await api.initApi();
      const data = await api.getSongs();
      setSongs(data || []);
    } catch (err: any) {
      console.error('Error fetching songs:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadSongs();
    setRefreshing(false);
  }

  async function handleDeleteSong(song: Track) {
    if (!song.id) return;
    Alert.alert('Delete Song', `Are you sure you want to remove "${song.title}" from your library?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteSong(song.id!);
            setSongs((prev) => prev.filter((s) => s.id !== song.id));
          } catch (e) {
            Alert.alert('Error', 'Failed to delete song');
          }
        },
      },
    ]);
  }

  const filteredSongs = songs.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.channel?.toLowerCase().includes(q)
    );
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>YOUR COLLECTION</Text>
          <Text style={styles.headerTitle}>Master Library</Text>
        </View>

        <TouchableOpacity style={styles.serverBtn} onPress={() => setIsServerModalOpen(true)}>
          <Ionicons name="hardware-chip-outline" size={20} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Action Banners */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: Theme.colors.primary }]}
          onPress={() => {
            if (songs.length > 0) playTrack(songs[0], songs);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={22} color="#ffffff" />
          <Text style={styles.actionCardText}>Play All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: Theme.colors.surfaceContainerHigh }]}
          onPress={superShufflePlay}
          activeOpacity={0.8}
        >
          <Ionicons name="shuffle" size={22} color={Theme.colors.primary} />
          <Text style={[styles.actionCardText, { color: Theme.colors.onSurface }]}>
            Super Shuffle
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search filter bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={18} color={Theme.colors.subtext} />
        <TextInput
          style={styles.searchInput}
          placeholder="Filter tracks or artists..."
          placeholderTextColor={Theme.colors.subtext}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={Theme.colors.subtext} />
          </TouchableOpacity>
        )}
      </View>

      {/* Song List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
        </View>
      ) : filteredSongs.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="musical-notes-outline" size={48} color={Theme.colors.subtext} />
          <Text style={styles.emptyTitle}>No songs found</Text>
          <Text style={styles.emptySubtitle}>
            Import YouTube links using the Import tab to get started.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredSongs}
          keyExtractor={(item) => item.id || item.youtubeId || Math.random().toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Theme.colors.primary}
            />
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
                  Alert.alert(
                    item.title,
                    'Choose an action',
                    [
                      {
                        text: 'Add to Playlist',
                        onPress: () => {
                          setSelectedSong(item);
                          setIsAddModalOpen(true);
                        },
                      },
                      {
                        text: 'Delete Song',
                        style: 'destructive',
                        onPress: () => handleDeleteSong(item),
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ]
                  );
                }}
              />
            );
          }}
        />
      )}

      <AddToPlaylistModal
        visible={isAddModalOpen}
        song={selectedSong}
        onClose={() => setIsAddModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
  },
  headerSubtitle: {
    color: Theme.colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  headerTitle: {
    color: Theme.colors.onSurface,
    fontSize: 26,
    fontWeight: '800',
  },
  serverBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.lg,
    marginVertical: Theme.spacing.sm,
  },
  actionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.full,
    gap: 8,
  },
  actionCardText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainer,
    marginHorizontal: Theme.spacing.lg,
    marginVertical: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.md,
    height: 42,
    borderRadius: Theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  searchInput: {
    flex: 1,
    color: Theme.colors.onSurface,
    marginLeft: Theme.spacing.sm,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 140, // Account for MiniPlayer bottom bar
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Theme.spacing.xl,
  },
  emptyTitle: {
    color: Theme.colors.onSurface,
    fontSize: 18,
    fontWeight: '700',
    marginTop: Theme.spacing.md,
  },
  emptySubtitle: {
    color: Theme.colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
  },
});
