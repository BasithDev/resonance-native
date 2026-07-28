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
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudio, Track } from '../../context/AudioContext';
import { SongItem } from '../../components/SongItem';
import { SongCard } from '../../components/SongCard';
import { AddToPlaylistModal } from '../../components/AddToPlaylistModal';
import { Theme } from '../../constants/theme';
import * as api from '../../services/api';

export default function LibraryScreen() {
  const { playTrack, playerTrack, isPlaying, superShufflePlay, enqueueNext, addToQueue } = useAudio();
  const [songs, setSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'recent'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortBy, setSortBy] = useState<'date' | 'title' | 'artist' | 'duration'>('date');
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

  let filteredSongs = songs.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.channel?.toLowerCase().includes(q)
    );
  });

  filteredSongs = [...filteredSongs].sort((a, b) => {
    if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
    if (sortBy === 'artist') return (a.channel || '').localeCompare(b.channel || '');
    if (sortBy === 'duration') return (b.durationSec || 0) - (a.durationSec || 0);
    return 0; // date added (default)
  });

  if (activeFilter === 'recent') {
    filteredSongs = [...filteredSongs].slice(-20).reverse();
  }

  function handleSongOptions(item: Track) {
    Alert.alert(
      item.title,
      'Choose an action',
      [
        {
          text: 'Play Next',
          onPress: () => enqueueNext(item),
        },
        {
          text: 'Add to Queue',
          onPress: () => addToQueue(item),
        },
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
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Branding Header with Equalizer Logo */}
      <View style={styles.header}>
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Ionicons name="pulse" size={22} color="#ffffff" />
          </View>
          <View style={styles.brandTextContainer}>
            <Text style={styles.brandTitle}>Resonance</Text>
            <Text style={styles.brandTagline}>PREMIUM AUDIO</Text>
          </View>
        </View>

        {/* View Mode Toggle Button */}
        <TouchableOpacity
          style={styles.viewToggleBtn}
          onPress={() => setViewMode((m) => (m === 'list' ? 'grid' : 'list'))}
        >
          <Ionicons
            name={viewMode === 'list' ? 'grid-outline' : 'list-outline'}
            size={22}
            color={Theme.colors.onSurface}
          />
        </TouchableOpacity>
      </View>

      {/* Single Aligned Row: Search Bar + Play All Icon + Super Shuffle Icon */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Theme.colors.subtext} />
          <TextInput
            style={styles.searchInput}
            placeholder="Filter tracks..."
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

        {/* Play All Icon Button */}
        <TouchableOpacity
          style={styles.iconActionBtnPrimary}
          onPress={() => {
            if (songs.length > 0) playTrack(songs[0], songs);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={20} color="#ffffff" />
        </TouchableOpacity>

        {/* Super Shuffle Icon Button */}
        <TouchableOpacity
          style={styles.iconActionBtnSecondary}
          onPress={superShufflePlay}
          activeOpacity={0.8}
        >
          <Ionicons name="shuffle" size={20} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Section Header & Sort Selectors */}
      <View style={styles.sectionHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.sectionTitle}>
            {activeFilter === 'recent' ? 'Recently Added' : 'All Songs'}
          </Text>
          <View style={styles.badgeContainer}>
            <Text style={styles.sectionBadge}>{filteredSongs.length}</Text>
          </View>
        </View>

        {/* Sort Selector Scroll */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {(['date', 'title', 'artist', 'duration'] as const).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.sortPill, sortBy === s && styles.sortPillActive]}
              onPress={() => setSortBy(s)}
            >
              <Text style={[styles.sortText, sortBy === s && styles.sortTextActive]}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Song List / Grid */}
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
          key={viewMode === 'grid' ? 'grid-2-col' : 'list-1-col'}
          data={filteredSongs}
          numColumns={viewMode === 'grid' ? 2 : 1}
          keyExtractor={(item) => item.id || item.youtubeId || Math.random().toString()}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={viewMode === 'grid' ? { justifyContent: 'space-between' } : undefined}
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

            if (viewMode === 'grid') {
              return (
                <SongCard
                  track={item}
                  isCurrent={Boolean(itemMatches)}
                  isPlaying={Boolean(itemMatches && isPlaying)}
                  onPress={() => playTrack(item, songs)}
                  onMorePress={() => handleSongOptions(item)}
                />
              );
            }

            return (
              <SongItem
                track={item}
                isCurrent={Boolean(itemMatches)}
                isPlaying={Boolean(itemMatches && isPlaying)}
                onPress={() => playTrack(item, songs)}
                onMorePress={() => handleSongOptions(item)}
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
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  brandTextContainer: {
    justifyContent: 'center',
  },
  brandTitle: {
    color: Theme.colors.primary,
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandTagline: {
    color: Theme.colors.subtext,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: -2,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainer,
    paddingHorizontal: Theme.spacing.md,
    height: 46,
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
  iconActionBtnPrimary: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  iconActionBtnSecondary: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  filterChipRow: {
    flexDirection: 'row',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 4,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  chipActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  chipText: {
    color: Theme.colors.subtext,
    fontSize: 12,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
  },
  sectionTitle: {
    color: Theme.colors.onSurface,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  badgeContainer: {
    backgroundColor: 'rgba(255, 89, 89, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
  },
  sectionBadge: {
    color: Theme.colors.primary,
    fontSize: 13,
    fontWeight: '800',
  },
  listContent: {
    paddingHorizontal: Theme.spacing.md,
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
  viewToggleBtn: {
    padding: 8,
    backgroundColor: Theme.colors.surfaceContainer,
    borderRadius: Theme.borderRadius.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  sortPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  sortPillActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  sortText: {
    color: Theme.colors.subtext,
    fontSize: 11,
    fontWeight: '600',
  },
  sortTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
});
