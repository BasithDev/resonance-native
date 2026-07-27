import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Theme } from '../constants/theme';

interface CreatePlaylistModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (name: string) => void;
}

export function CreatePlaylistModal({ visible, onClose, onCreate }: CreatePlaylistModalProps) {
  const [name, setName] = useState('');

  function handleSubmit() {
    if (!name.trim()) return;
    onCreate(name.trim());
    setName('');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Create Playlist</Text>
          <TextInput
            style={styles.input}
            placeholder="Playlist name"
            placeholderTextColor={Theme.colors.subtext}
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.createBtn} onPress={handleSubmit}>
              <Text style={styles.createText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: Theme.spacing.lg,
  },
  dialog: {
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  title: {
    color: Theme.colors.onSurface,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Theme.spacing.md,
  },
  input: {
    backgroundColor: Theme.colors.surfaceContainer,
    color: Theme.colors.onSurface,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    marginBottom: Theme.spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Theme.spacing.md,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelText: {
    color: Theme.colors.subtext,
    fontSize: 14,
    fontWeight: '600',
  },
  createBtn: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.full,
  },
  createText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
