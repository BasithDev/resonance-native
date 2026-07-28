import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../../context/AudioContext';
import { CoverArt } from '../../components/CoverArt';
import { Theme } from '../../constants/theme';
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
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>INGESTION</Text>
          <Text style={styles.headerTitle}>Import Link</Text>
        </View>

        <Text style={styles.description}>
          Paste any YouTube song video URL or full Playlist link below to extract audio & add to your library.
        </Text>

        {/* Input Card */}
        <View style={styles.card}>
          <View style={styles.inputRow}>
            <Ionicons name="link" size={20} color={Theme.colors.primary} />
            <TextInput
              style={styles.input}
              placeholder="https://youtube.com/watch?v=..."
              placeholderTextColor={Theme.colors.subtext}
              value={url}
              onChangeText={setUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {url.length > 0 && (
              <TouchableOpacity onPress={() => setUrl('')}>
                <Ionicons name="close-circle" size={18} color={Theme.colors.subtext} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[styles.resolveBtn, loading && { opacity: 0.6 }]}
            onPress={handleResolve}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="search" size={18} color="#ffffff" />
                <Text style={styles.resolveBtnText}>Resolve Link</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Preview Output */}
        {previewData && (
          <View style={styles.previewCard}>
            <Text style={styles.previewLabel}>PREVIEW RESULT</Text>

            {previewData.type === 'video' ? (
              <View style={styles.videoPreview}>
                <CoverArt url={previewData.thumbnailUrl} size={72} borderRadius={12} />
                <View style={styles.previewInfo}>
                  <Text style={styles.previewTitle} numberOfLines={2}>
                    {previewData.title}
                  </Text>
                  <Text style={styles.previewChannel}>{previewData.channel || 'Artist'}</Text>

                  <TouchableOpacity
                    style={styles.previewPlayBtn}
                    onPress={() => playTrack(previewData)}
                  >
                    <Ionicons name="play" size={16} color={Theme.colors.primary} />
                    <Text style={styles.previewPlayText}>Preview Play</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.playlistPreview}>
                <Ionicons name="albums-outline" size={32} color={Theme.colors.primary} />
                <Text style={styles.previewTitle}>{previewData.title || 'YouTube Playlist'}</Text>
                <Text style={styles.previewChannel}>
                  {previewData.songs?.length || 0} tracks extracted
                </Text>

                {previewData.songs && previewData.songs.length > 0 && (
                  <ScrollView style={{ maxHeight: 220, width: '100%', marginTop: 12 }}>
                    {previewData.songs.map((s: any, idx: number) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 }}>
                        <CoverArt url={s.thumbnailUrl} size={36} borderRadius={6} />
                        <Text style={{ color: Theme.colors.onSurface, fontSize: 13, flex: 1 }} numberOfLines={1}>
                          {s.title}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.importBtn, importing && { opacity: 0.6 }]}
              onPress={handleImport}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={20} color="#ffffff" />
                  <Text style={styles.importBtnText}>Import to Library</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.lg,
    paddingBottom: 140,
  },
  header: {
    marginBottom: 4,
  },
  headerSubtitle: {
    color: Theme.colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  headerTitle: {
    color: Theme.colors.onSurface,
    fontSize: 26,
    fontWeight: '800',
  },
  description: {
    color: Theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Theme.spacing.lg,
  },
  card: {
    backgroundColor: Theme.colors.surfaceContainer,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderRadius: Theme.borderRadius.md,
    paddingHorizontal: Theme.spacing.md,
    height: 48,
    marginBottom: Theme.spacing.md,
  },
  input: {
    flex: 1,
    color: Theme.colors.onSurface,
    marginLeft: 10,
    fontSize: 14,
  },
  resolveBtn: {
    backgroundColor: Theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.full,
    gap: 8,
  },
  resolveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  previewCard: {
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.lg,
    marginTop: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  previewLabel: {
    color: Theme.colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: Theme.spacing.md,
  },
  videoPreview: {
    flexDirection: 'row',
    marginBottom: Theme.spacing.lg,
  },
  previewInfo: {
    flex: 1,
    marginLeft: Theme.spacing.md,
  },
  previewTitle: {
    color: Theme.colors.onSurface,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  previewChannel: {
    color: Theme.colors.subtext,
    fontSize: 13,
    marginBottom: 8,
  },
  previewPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  previewPlayText: {
    color: Theme.colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  playlistPreview: {
    alignItems: 'center',
    paddingVertical: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  importBtn: {
    backgroundColor: Theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: Theme.borderRadius.full,
    gap: 8,
  },
  importBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
});
