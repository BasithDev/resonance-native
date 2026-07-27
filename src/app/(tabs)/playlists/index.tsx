import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  useEffect(() => {
    loadPlaylists();
  }, []);

  async function loadPlaylists() {
    try {
      setLoading(true);
      await api.initApi();
      const data = await api.getPlaylists();
      setPlaylists(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadPlaylists();
    setRefreshing(false);
  }

  async function handleCreatePlaylist(name: string) {
    try {
      const res = await api.createPlaylist(name);
      setIsCreateOpen(false);
      await loadPlaylists();
      if (res?.id) {
        router.push(`/playlists/${res.id}` as any);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create playlist');
    }
  }

  async function handlePlayPlaylist(playlistId: string) {
    try {
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerSubtitle}>COLLECTIONS</Text>
          <Text style={styles.headerTitle}>Playlists</Text>
        </View>

        <TouchableOpacity style={styles.addBtn} onPress={() => setIsCreateOpen(true)}>
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
        </View>
      ) : playlists.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="albums-outline" size={56} color={Theme.colors.subtext} />
          <Text style={styles.emptyTitle}>No Playlists Yet</Text>
          <Text style={styles.emptySubtitle}>
            Create your first custom playlist to group your favorite music.
          </Text>
          <TouchableOpacity style={styles.createBigBtn} onPress={() => setIsCreateOpen(true)}>
            <Text style={styles.createBigBtnText}>Create Playlist</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={playlists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Theme.colors.primary}
            />
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
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: Theme.spacing.lg,
    paddingBottom: 140,
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
    marginBottom: Theme.spacing.lg,
  },
  createBigBtn: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.full,
  },
  createBigBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
