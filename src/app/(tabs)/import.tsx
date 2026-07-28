import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../../context/AudioContext';
import { CoverArt } from '../../components/CoverArt';
import * as api from '../../services/api';

export default function ImportScreen() {
  const { playTrack } = useAudio();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  async function handleResolve() {
    if (!url.trim()) return;
    setLoading(true);
    setPreviewData(null);
    try {
      if (url.includes('list=')) {
        const res = await api.previewPlaylist(url.trim());
        setPreviewData({ type: 'playlist', ...res });
      } else {
        const res = await api.previewVideo(url.trim());
        setPreviewData({ type: 'video', ...res });
      }
    } catch (e: any) {
      console.error(e);
      Alert.alert('Resolution Error', e.message || 'Failed to resolve YouTube link.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!previewData) return;
    setImporting(true);
    try {
      const songsToImport =
        previewData.type === 'playlist' ? previewData.songs || [] : [previewData];
      await api.batchImportSongs(songsToImport);
      Alert.alert('Success!', `Imported ${songsToImport.length} track(s) to your library.`);
      setPreviewData(null);
      setUrl('');
    } catch (e: any) {
      Alert.alert('Import Failed', e.message || 'Error saving tracks.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 140 }}>
        <View className="mb-1">
          <Text className="text-primary text-[11px] font-extrabold tracking-widest">INGESTION</Text>
          <Text className="text-white text-[26px] font-extrabold">Import Link</Text>
        </View>

        <Text className="text-subtext text-[14px] leading-5 mb-5">
          Paste any YouTube song video URL or full Playlist link below to extract audio & add to your library.
        </Text>

        {/* Input Card */}
        <View className="bg-surfaceContainer rounded-2xl p-4 border border-border">
          <View className="flex-row items-center bg-surfaceContainerHigh rounded-xl px-4 h-12 mb-4">
            <Ionicons name="link" size={20} color="#FF5959" />
            <TextInput
              className="flex-1 text-white ml-2.5 text-[14px]"
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor="#A0A0A0"
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {url.length > 0 && (
              <TouchableOpacity onPress={() => setUrl('')}>
                <Ionicons name="close-circle" size={18} color="#A0A0A0" />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            className={`bg-primary flex-row items-center justify-center py-3 rounded-full gap-2 ${
              loading ? 'opacity-60' : ''
            }`}
            onPress={handleResolve}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="search" size={18} color="#ffffff" />
                <Text className="text-white text-[14px] font-bold">Resolve Link</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Preview Output */}
        {previewData && (
          <View className="bg-surfaceContainerHigh rounded-2xl p-5 mt-5 border border-border">
            <Text className="text-primary text-[11px] font-extrabold tracking-wider mb-4">PREVIEW RESULT</Text>

            {previewData.type === 'video' ? (
              <View className="flex-row mb-5">
                <CoverArt url={previewData.thumbnailUrl} size={72} borderRadius={12} />
                <View className="flex-1 ml-4">
                  <Text className="text-white text-[15px] font-bold mb-1" numberOfLines={2}>
                    {previewData.title}
                  </Text>
                  <Text className="text-subtext text-[13px] mb-2">{previewData.channel || 'Artist'}</Text>

                  <TouchableOpacity
                    className="flex-row items-center gap-1"
                    onPress={() => playTrack(previewData)}
                  >
                    <Ionicons name="play" size={16} color="#FF5959" />
                    <Text className="text-primary text-[13px] font-semibold">Preview Play</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View className="items-center py-4 mb-4">
                <Ionicons name="albums-outline" size={32} color="#FF5959" />
                <Text className="text-white text-[15px] font-bold mt-2">{previewData.title || 'YouTube Playlist'}</Text>
                <Text className="text-subtext text-[13px] mt-0.5">
                  {previewData.songs?.length || 0} tracks extracted
                </Text>

                {previewData.songs && previewData.songs.length > 0 && (
                  <ScrollView style={{ maxHeight: 220, width: '100%', marginTop: 12 }}>
                    {previewData.songs.map((s: any, idx: number) => (
                      <View key={idx} className="flex-row items-center gap-2.5 py-1.5">
                        <CoverArt url={s.thumbnailUrl} size={36} borderRadius={6} />
                        <Text className="text-white text-[13px] flex-1" numberOfLines={1}>
                          {s.title}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            <TouchableOpacity
              className={`bg-primary flex-row items-center justify-center py-3.5 rounded-full gap-2 ${
                importing ? 'opacity-60' : ''
              }`}
              onPress={handleImport}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color="#ffffff" />
                  <Text className="text-white text-[15px] font-bold">Import to Library</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
