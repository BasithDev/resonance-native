import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as api from '../services/api';

interface AddToPlaylistModalProps {
  visible: boolean;
  song: any;
  onClose: () => void;
  onAdded?: () => void;
}

export function AddToPlaylistModal({ visible, song, onClose, onAdded }: AddToPlaylistModalProps) {
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      loadPlaylists();
    }
  }, [visible]);

  async function loadPlaylists() {
    setLoading(true);
    try {
      const data = await api.getPlaylists();
      setPlaylists(data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(playlistId: string) {
    if (!song?.id) return;
    setAddingId(playlistId);
    try {
      await api.addSongToPlaylist(playlistId, song.id);
      if (onAdded) onAdded();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setAddingId(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-black/70 justify-end">
        <View className="bg-surfaceContainerHigh rounded-t-2xl p-5 max-h-[60%]">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-white text-[18px] font-bold">Add to Playlist</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#FF5959" className="my-5" />
          ) : playlists.length === 0 ? (
            <Text className="text-subtext text-center my-5">No playlists found. Create one first!</Text>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id}
              className="max-h-[300px]"
              renderItem={({ item }) => (
                <TouchableOpacity
                  className="flex-row items-center py-3.5 px-2 border-b border-border"
                  onPress={() => handleAdd(item.id)}
                  disabled={addingId === item.id}
                >
                  <Ionicons name="musical-notes" size={20} color="#FF5959" />
                  <Text className="text-white text-[16px] font-semibold ml-3 flex-1">{item.name}</Text>
                  {addingId === item.id && (
                    <ActivityIndicator size="small" color="#FF5959" />
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
