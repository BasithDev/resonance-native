import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Theme } from '../constants/theme';
import { useAudio } from '../context/AudioContext';

export function ServerConfigModal() {
  const { serverUrl, isServerModalOpen, setIsServerModalOpen, updateServerUrl } = useAudio();
  const [url, setUrl] = useState(serverUrl);

  useEffect(() => {
    setUrl(serverUrl);
  }, [serverUrl, isServerModalOpen]);

  async function handleSave() {
    if (!url.trim()) return;
    await updateServerUrl(url.trim());
    setIsServerModalOpen(false);
  }

  return (
    <Modal visible={isServerModalOpen} transparent animationType="fade" onRequestClose={() => setIsServerModalOpen(false)}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Backend Server Settings</Text>
          <Text style={styles.subtitle}>
            Enter your local PC IP address so Expo Go on your mobile device can reach the backend.
          </Text>

          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="http://192.168.1.50:4000"
            placeholderTextColor={Theme.colors.subtext}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setIsServerModalOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>Save URL</Text>
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
    marginBottom: 6,
  },
  subtitle: {
    color: Theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
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
  saveBtn: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Theme.borderRadius.full,
  },
  saveText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
