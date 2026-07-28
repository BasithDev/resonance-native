import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity } from 'react-native';
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
      <View className="flex-1 bg-black/70 justify-center p-5">
        <View className="bg-surfaceContainerHigh rounded-2xl p-5 border border-border">
          <Text className="text-white text-[18px] font-bold mb-1.5">Backend Server Settings</Text>
          <Text className="text-subtext text-[13px] leading-5 mb-4">
            Enter your local PC IP address so Expo Go on your mobile device can reach the backend.
          </Text>

          <TextInput
            className="bg-surfaceContainer text-white rounded-xl px-4 py-3 text-[15px] border border-border mb-5"
            value={url}
            onChangeText={setUrl}
            placeholder="http://192.168.1.50:4000"
            placeholderTextColor="#A0A0A0"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View className="flex-row justify-end gap-3">
            <TouchableOpacity className="px-4 py-2.5" onPress={() => setIsServerModalOpen(false)}>
              <Text className="text-subtext text-[14px] font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-primary px-5 py-2.5 rounded-full" onPress={handleSave}>
              <Text className="text-white text-[14px] font-bold">Save URL</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
