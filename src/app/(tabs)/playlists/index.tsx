import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
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
    <SafeAreaView className="flex-1 bg-background">
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2">
        <View>
          <Text className="text-primary text-[11px] font-extrabold tracking-widest">COLLECTIONS</Text>
          <Text className="text-white text-[28px] font-black tracking-tight">Your Playlists</Text>
        </View>

        <TouchableOpacity
          className="w-10.5 h-10.5 rounded-full bg-primary items-center justify-center shadow-md"
          onPress={() => setIsCreateOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={24} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* Search Filter Bar */}
      <View className="px-4 py-2">
        <View className="flex-row items-center bg-surfaceContainer px-4 h-11 rounded-full border border-border">
          <Ionicons name="search" size={18} color="#A0A0A0" />
          <TextInput
            className="flex-1 text-white ml-2 text-[14px]"
            placeholder="Find a playlist..."
            placeholderTextColor="#A0A0A0"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color="#A0A0A0" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* 2-Column Grid of Big Playlist Cards */}
      {loading ? (
        <View className="p-8 items-center justify-center">
          <ActivityIndicator size="large" color="#FF5959" />
        </View>
      ) : (
        <FlatList
          key="playlists-2-col-grid"
          data={gridData}
          numColumns={2}
          keyExtractor={(item) => item.id}
          columnWrapperStyle={{ justifyContent: 'space-between', marginBottom: 8 }}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 140 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FF5959"
            />
          }
          ListEmptyComponent={
            gridData.length === 0 ? (
              <View className="p-8 items-center justify-center">
                <Ionicons name="search-outline" size={48} color="#A0A0A0" />
                <Text className="text-white text-[18px] font-bold mt-4">No playlists found</Text>
                <Text className="text-subtext text-[14px] text-center mt-1.5">No playlists match "{searchQuery}"</Text>
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
