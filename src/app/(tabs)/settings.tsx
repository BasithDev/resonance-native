import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../../context/AudioContext';
import * as api from '../../services/api';

export default function SettingsScreen() {
  const { serverUrl, setIsServerModalOpen } = useAudio();

  async function handleExport() {
    try {
      const data = await api.exportLibrary();
      Alert.alert(
        'Library Exported',
        `Export file ready with ${data?.songs?.length || 0} tracks and ${data?.playlists?.length || 0} playlists!`
      );
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Failed to export library');
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
        <View className="mb-5">
          <Text className="text-primary text-[11px] font-extrabold tracking-widest">PREFERENCES & PORTABILITY</Text>
          <Text className="text-white text-[26px] font-extrabold">Settings</Text>
        </View>

        {/* Server Connection Section */}
        <Text className="text-subtext text-[11px] font-extrabold tracking-wider mt-4 mb-2">SERVER CONNECTION</Text>
        <TouchableOpacity
          className="flex-row items-center bg-surfaceContainer p-4 rounded-2xl mb-4 border border-border"
          onPress={() => setIsServerModalOpen(true)}
          activeOpacity={0.7}
        >
          <View className="w-11 h-11 rounded-full bg-surfaceContainerHigh items-center justify-center">
            <Ionicons name="server-outline" size={22} color="#FF5959" />
          </View>
          <View className="flex-1 ml-4">
            <Text className="text-white text-[15px] font-bold mb-0.5">Backend Server URL</Text>
            <Text className="text-subtext text-[12px]" numberOfLines={1}>
              {serverUrl}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#A0A0A0" />
        </TouchableOpacity>

        {/* Data Portability Section */}
        <Text className="text-subtext text-[11px] font-extrabold tracking-wider mt-4 mb-2">PORTABILITY & BACKUPS</Text>
        <TouchableOpacity className="flex-row items-center bg-surfaceContainer p-4 rounded-2xl mb-4 border border-border" onPress={handleExport} activeOpacity={0.7}>
          <View className="w-11 h-11 rounded-full bg-surfaceContainerHigh items-center justify-center">
            <Ionicons name="cloud-download-outline" size={22} color="#FF5959" />
          </View>
          <View className="flex-1 ml-4">
            <Text className="text-white text-[15px] font-bold mb-0.5">Export Full Library (JSON)</Text>
            <Text className="text-subtext text-[12px]">
              Backup all songs, playlists, and metadata into a portable JSON document.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#A0A0A0" />
        </TouchableOpacity>

        {/* About App */}
        <Text className="text-subtext text-[11px] font-extrabold tracking-wider mt-4 mb-2">ABOUT</Text>
        <View className="bg-surfaceContainer p-5 rounded-2xl border border-border">
          <View className="flex-row items-center gap-3.5 mb-4">
            <View className="w-12 h-12 rounded-xl bg-surfaceContainerHigh items-center justify-center">
              <Ionicons name="musical-notes" size={28} color="#FF5959" />
            </View>
            <View>
              <Text className="text-white text-[17px] font-extrabold">Resonance Mobile</Text>
              <Text className="text-primary text-[12px] font-semibold mt-0.5">Version 1.0.0 (Expo SDK 57)</Text>
            </View>
          </View>
          <Text className="text-subtext text-[13px] leading-5">
            High-Performance YouTube Audio Player & Music Library for React Native.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
