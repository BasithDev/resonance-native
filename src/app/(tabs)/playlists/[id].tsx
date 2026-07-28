import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
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
      Alert.alert('Error', 'Failed to remove song from playlist');
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
    <SafeAreaView className="flex-1 bg-background">
      {/* Top Header */}
      <View className="flex-row items-center justify-between px-4 py-2 border-b border-border">
        <TouchableOpacity onPress={handleGoBack} className="p-2">
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>

        <View className="flex-row items-center gap-1.5 flex-1 justify-center mx-2">
          <Text className="text-white text-[17px] font-bold" numberOfLines={1}>
            {playlist?.name || 'Playlist'}
          </Text>
          {id !== 'all-songs' && (
            <TouchableOpacity
              onPress={() => {
                setRenameInput(playlist?.name || '');
                setIsRenameModalOpen(true);
              }}
              className="p-1"
            >
              <Ionicons name="pencil" size={16} color="#FF5959" />
            </TouchableOpacity>
          )}
        </View>

        {id !== 'all-songs' ? (
          <TouchableOpacity onPress={handleDeletePlaylist} className="p-2">
            <Ionicons name="trash-outline" size={22} color="#FF4D4D" />
          </TouchableOpacity>
        ) : (
          <View className="w-9" />
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center p-8">
          <ActivityIndicator size="large" color="#FF5959" />
        </View>
      ) : (
        <FlatList
          data={filteredSongs}
          keyExtractor={(item) => item.id || Math.random().toString()}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 140 }}
          ListHeaderComponent={
            <View>
              {/* Hero Banner */}
              <View className="items-center py-6 border-b border-border mb-4">
                {heroCoverUrl ? (
                  <Image source={{ uri: heroCoverUrl }} className="w-[140px] h-[140px] rounded-2xl mb-4" resizeMode="cover" />
                ) : (
                  <View className="w-[140px] h-[140px] rounded-2xl bg-surfaceContainerHigh items-center justify-center mb-4">
                    <Ionicons name="musical-notes" size={40} color="#FF5959" />
                  </View>
                )}
                <Text className="text-white text-[22px] font-black text-center mb-1">{playlist?.name}</Text>
                <Text className="text-subtext text-[13px] font-semibold mb-4">
                  {songs.length} {songs.length === 1 ? 'track' : 'tracks'}{formatTotalRuntime(songs) ? ` • ${formatTotalRuntime(songs)}` : ''}
                </Text>

                {/* Hero Actions */}
                <View className="flex-row gap-3">
                  <TouchableOpacity
                    className="flex-row items-center gap-1.5 bg-primary px-6 py-2.5 rounded-full"
                    onPress={() => songs.length > 0 && playTrack(songs[0], songs)}
                  >
                    <Ionicons name="play" size={20} color="#ffffff" />
                    <Text className="text-white text-[14px] font-bold">Play</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    className="flex-row items-center gap-1.5 bg-surfaceContainerHigh px-6 py-2.5 rounded-full border border-border"
                    onPress={() => songs.length > 0 && playTrack(songs[0], songs, { shuffle: true })}
                  >
                    <Ionicons name="shuffle" size={20} color="#FF5959" />
                    <Text className="text-white text-[14px] font-bold">Shuffle</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* In-Playlist Search Filter */}
              <View className="flex-row items-center bg-surfaceContainer px-4 h-11 rounded-full border border-border mb-3">
                <Ionicons name="search" size={18} color="#A0A0A0" />
                <TextInput
                  className="flex-1 text-white ml-2 text-[14px]"
                  placeholder="Search inside playlist..."
                  placeholderTextColor="#A0A0A0"
                  value={filterQuery}
                  onChangeText={setFilterQuery}
                />
              </View>
            </View>
          }
          ListEmptyComponent={
            <View className="py-12 items-center justify-center">
              <Text className="text-subtext text-[14px]">No songs in this playlist yet.</Text>
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
        <View className="flex-1 bg-black/70 justify-center p-5">
          <View className="bg-surfaceContainerHigh rounded-2xl p-5 border border-border items-center">
            <View className="w-13 h-13 rounded-full bg-error/15 items-center justify-center mb-3">
              <Ionicons name="trash-outline" size={28} color="#FF4D4D" />
            </View>
            <Text className="text-white text-[18px] font-bold mb-1">Delete Playlist?</Text>
            <Text className="text-subtext text-[13px] text-center mb-5 leading-5">
              Are you sure you want to delete "{playlist?.name}"? This action cannot be undone.
            </Text>

            <View className="flex-row gap-3 w-full">
              <TouchableOpacity
                className="flex-1 py-3 rounded-full bg-surfaceContainer border border-border items-center"
                onPress={() => setIsDeleteModalOpen(false)}
                disabled={isDeleting}
              >
                <Text className="text-subtext text-[14px] font-semibold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className={`flex-1 py-3 rounded-full bg-error items-center ${isDeleting ? 'opacity-60' : ''}`}
                onPress={confirmDeletePlaylist}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text className="text-white text-[14px] font-bold">Delete</Text>
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
        <View className="flex-1 bg-black/70 justify-center p-5">
          <View className="bg-surfaceContainerHigh rounded-2xl p-5 border border-border items-center">
            <View className="w-13 h-13 rounded-full bg-primary/15 items-center justify-center mb-3">
              <Ionicons name="pencil" size={26} color="#FF5959" />
            </View>
            <Text className="text-white text-[18px] font-bold mb-1">Rename Playlist</Text>

            <TextInput
              className="w-full bg-surfaceContainer text-white px-4 py-2.5 rounded-xl text-[15px] my-4 border border-border"
              value={renameInput}
              onChangeText={setRenameInput}
              placeholder="Playlist name..."
              placeholderTextColor="#A0A0A0"
              autoFocus
            />

            <View className="flex-row gap-3 w-full">
              <TouchableOpacity
                className="flex-1 py-3 rounded-full bg-surfaceContainer border border-border items-center"
                onPress={() => setIsRenameModalOpen(false)}
              >
                <Text className="text-subtext text-[14px] font-semibold">Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-1 py-3 rounded-full bg-primary items-center"
                onPress={handleRenamePlaylist}
              >
                <Text className="text-white text-[14px] font-bold">Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
