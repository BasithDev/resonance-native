import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';
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
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <Text style={styles.title}>Add to Playlist</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={Theme.colors.onSurface} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={Theme.colors.primary} style={{ marginVertical: 20 }} />
          ) : playlists.length === 0 ? (
            <Text style={styles.emptyText}>No playlists found. Create one first!</Text>
          ) : (
            <FlatList
              data={playlists}
              keyExtractor={(item) => item.id}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.playlistRow}
                  onPress={() => handleAdd(item.id)}
                  disabled={addingId === item.id}
                >
                  <Ionicons name="musical-notes" size={20} color={Theme.colors.primary} />
                  <Text style={styles.playlistName}>{item.name}</Text>
                  {addingId === item.id && (
                    <ActivityIndicator size="small" color={Theme.colors.primary} />
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

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  dialog: {
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderTopLeftRadius: Theme.borderRadius.lg,
    borderTopRightRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    maxHeight: '60%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.md,
  },
  title: {
    color: Theme.colors.onSurface,
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    color: Theme.colors.subtext,
    textAlign: 'center',
    marginVertical: 20,
  },
  playlistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: Theme.colors.border,
  },
  playlistName: {
    color: Theme.colors.onSurface,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
    flex: 1,
  },
});
