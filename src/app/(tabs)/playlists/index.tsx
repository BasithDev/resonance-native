import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../../../context/AudioContext';
import { PlaylistCard } from '../../../components/PlaylistCard';
import { CreatePlaylistModal } from '../../../components/CreatePlaylistModal';
import { Theme } from '../../../constants/theme';
import * as api from '../../../services/api';

export default function PlaylistsScreen() {
  const router = useRouter();
  const { playTrack } = useAudio();
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [allSongs, setAllSongs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    try {
      setLoading(true);
      await api.initApi();
      const [plData, songData] = await Promise.all([
        api.getPlaylists().catch(() => []),
        api.getSongs().catch(() => []),
      ]);
      setPlaylists(Array.isArray(plData) ? plData : []);
      setAllSongs(Array.isArray(songData) ? songData : []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleCreatePlaylist(name: string) {
    try {
      const res = await api.createPlaylist(name);
      setIsCreateOpen(false);
      await loadData();
      if (res?.id) {
        router.push(`/playlists/${res.id}` as any);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create playlist');
    }
  }

  async function handlePlayPlaylist(playlistId: string) {
    try {
      if (playlistId === 'all-songs') {
        if (allSongs.length > 0) {
          await playTrack(allSongs[0], allSongs);
        }
        return;
      }
      const details = await api.getPlaylistDetails(playlistId);
      const songs = details?.songs || [];
      if (songs.length > 0) {
        await playTrack(songs[0], songs);
      } else {
        Alert.alert('Empty Playlist', 'Add some songs to this playlist first!');
      }
    } catch (e) {
      console.error(e);
    }
  }

  const filteredPlaylists = playlists.filter((p) =>
    p.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const firstSongWithThumb = allSongs.find((s) => s.thumbnailUrl || s.coverUrl);
  const defaultAllSongsPlaylist = {
    id: 'all-songs',
    name: 'All Songs',
    songCount: allSongs.length,
    songs: allSongs,
    coverUrl: firstSongWithThumb?.thumbnailUrl || firstSongWithThumb?.coverUrl || null,
  };

  const gridData = searchQuery
    ? filteredPlaylists
    : [defaultAllSongsPlaylist, ...filteredPlaylists];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>COLLECTIONS</Text>
          <Text style={styles.headerTitle}>Your Playlists</Text>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={() => setIsCreateOpen(true)} activeOpacity={0.8}>
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Search Filter Bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Theme.colors.subtext} />
          <TextInput
            style={styles.searchInput}
            placeholder="Find a playlist..."
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
      </View>

      {/* 2-Column Grid of Big Playlist Cards */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          key="playlists-2-col-grid"
          data={gridData}
          numColumns={2}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Theme.colors.primary}
            />
          }
          ListEmptyComponent={
            gridData.length === 0 ? (
              <View style={styles.centerContainer}>
                <Ionicons name="search-outline" size={48} color={Theme.colors.subtext} />
                <Text style={styles.emptyTitle}>No playlists found</Text>
                <Text style={styles.emptySubtitle}>No playlists match "{searchQuery}"</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <PlaylistCard
              playlist={item}
              onPress={() => router.push(`/playlists/${item.id}` as any)}
              onPlayPress={() => handlePlayPlaylist(item.id)}
            />
          )}
        />
      )}

      <CreatePlaylistModal
        visible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={handleCreatePlaylist}
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
    paddingHorizontal: Theme.spacing.md,
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
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Theme.colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  searchRow: {
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.sm,
  },
  searchBar: {
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
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  listContent: {
    paddingHorizontal: Theme.spacing.md - 4,
    paddingBottom: 140,
  },
  centerContainer: {
    padding: Theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
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
