import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity } from 'react-native';

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
      <View className="flex-1 bg-black/70 justify-center p-5">
        <View className="bg-surfaceContainerHigh rounded-2xl p-5 border border-border">
          <Text className="text-white text-[18px] font-bold mb-4">Create Playlist</Text>
          <TextInput
            className="bg-surfaceContainer text-white rounded-xl px-4 py-3 text-[15px] border border-border mb-5"
            placeholder="Playlist name"
            placeholderTextColor="#A0A0A0"
            value={name}
            onChangeText={setName}
            autoFocus
          />
          <View className="flex-row justify-end gap-3">
            <TouchableOpacity className="px-4 py-2.5" onPress={onClose}>
              <Text className="text-subtext text-[14px] font-semibold">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity className="bg-primary px-5 py-2.5 rounded-full" onPress={handleSubmit}>
              <Text className="text-white text-[14px] font-bold">Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
