import React, { useEffect, useState, useRef } from 'react';
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
  const { playTrack, playerTrack, isPlaying, superShufflePlay, enqueueNext, addToQueue } = useAudio();
  const [songs, setSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSong, setSelectedSong] = useState<Track | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Dynamic YouTube Fallback Search States
  const [ytResults, setYtResults] = useState<Track[]>([]);
  const [isYtSearching, setIsYtSearching] = useState(false);
  const [importingYtId, setImportingYtId] = useState<string | null>(null);

  const searchTimerRef = useRef<any>(null);

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

  // Local filter matches
  const localMatches = songs.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.channel?.toLowerCase().includes(q)
    );
  });

  // Dynamic search handler with YouTube fallback when localMatches is 0
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const q = searchQuery.trim();
    if (!q || localMatches.length > 0) {
      setYtResults([]);
      setIsYtSearching(false);
      return;
    }

    if (q.length >= 2 && localMatches.length === 0) {
      setIsYtSearching(true);
      searchTimerRef.current = setTimeout(async () => {
        try {
          const res = await api.searchYouTube(q);
          const tracks = res?.songs || res || [];
          setYtResults(Array.isArray(tracks) ? tracks : []);
        } catch (err) {
          console.warn('YouTube fallback search error:', err);
          setYtResults([]);
        } finally {
          setIsYtSearching(false);
        }
      }, 400);
    }
  }, [searchQuery, localMatches.length]);

  async function handleImportYtTrack(track: Track) {
    const songId = track.id || track.youtubeId;
    if (!songId) return;
    setImportingYtId(songId);
    try {
      await api.batchImportSongs([track]);
      Alert.alert('Imported!', `"${track.title}" added to your library!`);
      await loadSongs();
    } catch (err: any) {
      Alert.alert('Import Error', err.message || 'Failed to add track.');
    } finally {
      setImportingYtId(null);
    }
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

  const isSearchActive = searchQuery.trim().length > 0;
  const isUsingYtFallback = isSearchActive && localMatches.length === 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Top Branding Header */}
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
      </View>

      {/* Dynamic Search Bar Row */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Theme.colors.subtext} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search library or YouTube..."
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

        {/* Play All Button */}
        <TouchableOpacity
          style={styles.iconActionBtnPrimary}
          onPress={() => {
            if (songs.length > 0) playTrack(songs[0], songs);
          }}
          activeOpacity={0.8}
        >
          <Ionicons name="play" size={20} color="#ffffff" />
        </TouchableOpacity>

        {/* Super Shuffle Button */}
        <TouchableOpacity
          style={styles.iconActionBtnSecondary}
          onPress={superShufflePlay}
          activeOpacity={0.8}
        >
          <Ionicons name="shuffle" size={20} color={Theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>
          {!isSearchActive
            ? 'All Songs'
            : localMatches.length > 0
            ? 'Library Matches'
            : 'YouTube Results'}
        </Text>
        <View style={styles.badgeContainer}>
          <Text style={styles.sectionBadge}>
            {isUsingYtFallback ? ytResults.length : localMatches.length}
          </Text>
        </View>
      </View>

      {/* Main List Rendering */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
        </View>
      ) : isUsingYtFallback ? (
        /* YouTube Fallback Search Results */
        isYtSearching ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={Theme.colors.primary} />
            <Text style={styles.loadingText}>Searching YouTube for "{searchQuery}"...</Text>
          </View>
        ) : ytResults.length > 0 ? (
          <FlatList
            data={ytResults}
            keyExtractor={(item) => item.id || item.youtubeId || Math.random().toString()}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const songId = item.id || item.youtubeId;
              const isImportingThis = importingYtId === songId;

              return (
                <View style={styles.ytResultRow}>
                  <View style={{ flex: 1 }}>
                    <SongItem
                      track={item}
                      onPress={() => playTrack(item, ytResults)}
                      onMorePress={() => handleImportYtTrack(item)}
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.addYtBtn}
                    onPress={() => handleImportYtTrack(item)}
                    disabled={isImportingThis}
                  >
                    {isImportingThis ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="add" size={16} color="#ffffff" />
                        <Text style={styles.addYtBtnText}>Add</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        ) : (
          <View style={styles.centerContainer}>
            <Ionicons name="search-outline" size={48} color={Theme.colors.subtext} />
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptySubtitle}>
              No tracks matched "{searchQuery}" in your library or on YouTube.
            </Text>
          </View>
        )
      ) : localMatches.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="musical-notes-outline" size={48} color={Theme.colors.subtext} />
          <Text style={styles.emptyTitle}>No songs in library</Text>
          <Text style={styles.emptySubtitle}>
            Use the search bar above to find and add songs from YouTube.
          </Text>
        </View>
      ) : (
        /* Local Songs List */
        <FlatList
          data={localMatches}
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
    paddingBottom: 140,
  },
  ytResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addYtBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Theme.borderRadius.full,
    gap: 4,
    marginBottom: 8,
  },
  addYtBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Theme.spacing.xl,
  },
  loadingText: {
    color: Theme.colors.subtext,
    fontSize: 14,
    marginTop: Theme.spacing.md,
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
