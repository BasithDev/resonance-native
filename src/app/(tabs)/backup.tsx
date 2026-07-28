import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Theme } from '../../constants/theme';
import * as api from '../../services/api';

export default function BackupScreen() {
  const [songs, setSongs] = useState<any[]>([]);
  const [playlists, setPlaylists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('all');

  const [exportData, setExportData] = useState<string>('');
  const [importJson, setImportJson] = useState<string>('');
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string>('');

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setLoading(true);
      await api.initApi();
      const [fetchedSongs, fetchedPlaylists] = await Promise.all([
        api.getSongs().catch(() => []),
        api.getPlaylists().catch(() => []),
      ]);
      setSongs(Array.isArray(fetchedSongs) ? fetchedSongs : []);
      setPlaylists(Array.isArray(fetchedPlaylists) ? fetchedPlaylists : []);
    } catch (err) {
      console.error('Error loading library stats:', err);
    } finally {
      setLoading(false);
    }
  }

  // ---------- Document Picker (Select JSON or CSV file) ----------
  async function handlePickDocument() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        setSelectedFileName(file.name);

        // Fetch local file URI content as text
        const response = await fetch(file.uri);
        const textContent = await response.text();
        setImportJson(textContent);
        Alert.alert('File Loaded!', `Successfully loaded "${file.name}". Tap Restore to import.`);
      }
    } catch (e: any) {
      Alert.alert('File Error', e.message || 'Failed to read selected file.');
    }
  }

  // ---------- JSON Export ----------
  async function handleExportJSON() {
    let exportSongs = songs;
    let exportPlaylists = playlists;

    if (selectedPlaylistId !== 'all') {
      const pl = playlists.find((p) => p.id === selectedPlaylistId);
      if (pl) {
        exportPlaylists = [pl];
        exportSongs = pl.songs || [];
      }
    }

    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      appName: 'Resonance',
      songsCount: exportSongs.length,
      playlistsCount: exportPlaylists.length,
      songs: exportSongs.map((s) => ({
        id: s.id,
        youtubeId: s.youtubeId,
        title: s.title,
        channel: s.channel,
        durationSec: s.durationSec,
        thumbnailUrl: s.thumbnailUrl,
      })),
      playlists: exportPlaylists.map((p) => ({
        id: p.id,
        name: p.name,
        songIds: (p.songs || []).map((s: any) => s.id || s.youtubeId),
      })),
    };

    const jsonStr = JSON.stringify(payload, null, 2);
    setExportData(jsonStr);

    try {
      await Share.share({
        message: jsonStr,
        title: `resonance-backup-${new Date().toISOString().split('T')[0]}.json`,
      });
    } catch (e) {
      // share dismissed
    }
  }

  // ---------- CSV Export ----------
  async function handleExportCSV() {
    let exportSongs = songs;
    if (selectedPlaylistId !== 'all') {
      const pl = playlists.find((p) => p.id === selectedPlaylistId);
      if (pl) exportSongs = pl.songs || [];
    }

    const headers = ['Title', 'Artist/Channel', 'YouTube ID', 'Duration (Sec)', 'Thumbnail URL'];
    const rows = exportSongs.map((s) => [
      `"${(s.title || '').replace(/"/g, '""')}"`,
      `"${(s.channel || '').replace(/"/g, '""')}"`,
      `"${s.youtubeId || s.id || ''}"`,
      s.durationSec || 0,
      `"${s.thumbnailUrl || ''}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    setExportData(csvContent);

    try {
      await Share.share({
        message: csvContent,
        title: `resonance-library-${new Date().toISOString().split('T')[0]}.csv`,
      });
    } catch (e) {
      // share dismissed
    }
  }

  // ---------- Restore / Import ----------
  async function handleRestore() {
    if (!importJson.trim()) {
      Alert.alert('Empty Payload', 'Please pick a file or paste JSON payload / YouTube URLs.');
      return;
    }

    setIsImporting(true);
    setStatusMsg('Restoring data...');

    try {
      const text = importJson.trim();
      let songsToImport: any[] = [];
      let playlistsToCreate: any[] = [];

      if (text.startsWith('{') || text.startsWith('[')) {
        // Parse JSON payload
        const parsed = JSON.parse(text);
        songsToImport = parsed.songs || (Array.isArray(parsed) ? parsed : []);
        playlistsToCreate = parsed.playlists || [];
      } else if (text.includes(',')) {
        // Parse CSV spreadsheet
        const lines = text.split('\n').filter((l) => l.trim());
        const startIndex = lines[0].toLowerCase().includes('title') ? 1 : 0;
        for (let i = startIndex; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
          if (cols.length >= 3) {
            songsToImport.push({
              title: cols[0] || 'Unknown Track',
              channel: cols[1] || 'Unknown Artist',
              youtubeId: cols[2],
              durationSec: parseInt(cols[3]) || 0,
              thumbnailUrl: cols[4] || '',
            });
          }
        }
      } else {
        // Parse line-by-line YouTube URLs or IDs
        const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
        songsToImport = lines.map((line) => {
          let ytid = line;
          const match = line.match(/(?:v=|\/embed\/|\/1.1\/|youtu\.be\/|\/v\/|watch\?v=|\&v=)([^#\&\?]*)/);
          if (match && match[1]?.length === 11) ytid = match[1];
          return { youtubeId: ytid };
        });
      }

      if (songsToImport.length > 0) {
        setStatusMsg(`Importing ${songsToImport.length} track(s)...`);
        await api.batchImportSongs(songsToImport);
      }

      if (playlistsToCreate.length > 0) {
        setStatusMsg(`Recreating ${playlistsToCreate.length} playlist(s)...`);
        for (const pl of playlistsToCreate) {
          if (pl.name) {
            try {
              const created = await api.createPlaylist(pl.name);
              if (created?.id && Array.isArray(pl.songIds)) {
                for (const songId of pl.songIds) {
                  await api.addSongToPlaylist(created.id, songId).catch(() => {});
                }
              }
            } catch (err) {
              // skip duplicate playlist
            }
          }
        }
      }

      Alert.alert('Restore Complete!', `Restored ${songsToImport.length} track(s) and ${playlistsToCreate.length} playlist(s).`);
      setImportJson('');
      setSelectedFileName(null);
      loadStats();
    } catch (e: any) {
      Alert.alert('Restore Error', e.message || 'Failed to restore library data.');
    } finally {
      setIsImporting(false);
      setStatusMsg('');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>DATA PORTABILITY</Text>
          <Text style={styles.headerTitle}>Export & Restore</Text>
        </View>

        <Text style={styles.description}>
          Backup your music library, export playlists as JSON/CSV spreadsheets, or restore from a backup file.
        </Text>

        {/* Summary Stats Cards */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="musical-notes" size={22} color={Theme.colors.primary} />
            </View>
            <View style={styles.statTextContainer}>
              <Text style={styles.statLabel}>Master Library</Text>
              <Text style={styles.statValue}>
                {loading ? '...' : `${songs.length} Tracks`}
              </Text>
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statIconContainer}>
              <Ionicons name="albums" size={22} color={Theme.colors.primary} />
            </View>
            <View style={styles.statTextContainer}>
              <Text style={styles.statLabel}>Custom Playlists</Text>
              <Text style={styles.statValue}>
                {loading ? '...' : `${playlists.length} Playlists`}
              </Text>
            </View>
          </View>
        </View>

        {/* ── EXPORT SECTION ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="cloud-download-outline" size={22} color={Theme.colors.primary} />
            <Text style={styles.cardTitle}>Export Library Data</Text>
          </View>

          <Text style={styles.cardSubtitle}>
            Select collection to export as JSON or CSV:
          </Text>

          {/* Collection Selector */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectorScroll}
          >
            <TouchableOpacity
              style={[
                styles.selectorPill,
                selectedPlaylistId === 'all' && styles.selectorPillActive,
              ]}
              onPress={() => setSelectedPlaylistId('all')}
            >
              <Text
                style={[
                  styles.selectorText,
                  selectedPlaylistId === 'all' && styles.selectorTextActive,
                ]}
              >
                Entire Library ({songs.length})
              </Text>
            </TouchableOpacity>

            {playlists.map((pl) => (
              <TouchableOpacity
                key={pl.id}
                style={[
                  styles.selectorPill,
                  selectedPlaylistId === pl.id && styles.selectorPillActive,
                ]}
                onPress={() => setSelectedPlaylistId(pl.id)}
              >
                <Text
                  style={[
                    styles.selectorText,
                    selectedPlaylistId === pl.id && styles.selectorTextActive,
                  ]}
                >
                  {pl.name} ({(pl.songs || []).length})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Export Action Buttons */}
          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: Theme.colors.primary }]}
              onPress={handleExportJSON}
            >
              <Ionicons name="code-download-outline" size={18} color="#ffffff" />
              <Text style={styles.exportBtnText}>JSON Backup</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.exportBtn, { backgroundColor: Theme.colors.surfaceContainerHigh }]}
              onPress={handleExportCSV}
            >
              <Ionicons name="document-text-outline" size={18} color={Theme.colors.onSurface} />
              <Text style={[styles.exportBtnText, { color: Theme.colors.onSurface }]}>
                CSV Spreadsheet
              </Text>
            </TouchableOpacity>
          </View>

          {exportData !== '' && (
            <View style={styles.exportResultBox}>
              <TextInput
                style={styles.jsonPreview}
                multiline
                editable={false}
                value={exportData}
              />
            </View>
          )}
        </View>

        {/* ── IMPORT & RESTORE SECTION ── */}
        <View style={[styles.card, { marginTop: Theme.spacing.lg }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="cloud-upload-outline" size={22} color={Theme.colors.primary} />
            <Text style={styles.cardTitle}>Import & Restore Library</Text>
          </View>

          <Text style={styles.cardSubtitle}>
            Upload a .json / .csv backup file from storage or paste URLs below:
          </Text>

          {/* File Picker Dropzone Card */}
          <TouchableOpacity
            style={styles.fileDropzone}
            onPress={handlePickDocument}
            activeOpacity={0.8}
          >
            <Ionicons name="folder-open-outline" size={32} color={Theme.colors.primary} />
            {selectedFileName ? (
              <View style={styles.fileLoadedBadge}>
                <Text style={styles.fileLoadedText} numberOfLines={1}>
                  📄 {selectedFileName}
                </Text>
              </View>
            ) : (
              <>
                <Text style={styles.dropzoneTitle}>Tap to select .json or .csv backup file</Text>
                <Text style={styles.dropzoneSubtitle}>Opens system File Manager</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Or Paste JSON / URLs Text Area */}
          <TextInput
            style={styles.importInput}
            multiline
            numberOfLines={5}
            placeholder='Or paste JSON payload {"songs": [...]} or YouTube URLs line-by-line...'
            placeholderTextColor={Theme.colors.subtext}
            value={importJson}
            onChangeText={(txt) => {
              setImportJson(txt);
              if (!txt) setSelectedFileName(null);
            }}
          />

          <TouchableOpacity
            style={[styles.restoreBtn, isImporting && { opacity: 0.6 }]}
            onPress={handleRestore}
            disabled={isImporting}
          >
            {isImporting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="refresh-circle-outline" size={20} color="#ffffff" />
                <Text style={styles.restoreBtnText}>Execute Restore & Import</Text>
              </>
            )}
          </TouchableOpacity>

          {statusMsg !== '' && (
            <Text style={styles.statusText}>{statusMsg}</Text>
          )}
        </View>
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
    paddingHorizontal: Theme.spacing.md,
    paddingTop: Theme.spacing.md,
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
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  description: {
    color: Theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: Theme.spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.lg,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainer,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    gap: 12,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 89, 89, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTextContainer: {
    flex: 1,
  },
  statLabel: {
    color: Theme.colors.subtext,
    fontSize: 11,
    fontWeight: '600',
  },
  statValue: {
    color: Theme.colors.onSurface,
    fontSize: 15,
    fontWeight: '800',
    marginTop: 2,
  },
  card: {
    backgroundColor: Theme.colors.surfaceContainer,
    borderRadius: Theme.borderRadius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  cardTitle: {
    color: Theme.colors.onSurface,
    fontSize: 17,
    fontWeight: '800',
  },
  cardSubtitle: {
    color: Theme.colors.subtext,
    fontSize: 13,
    marginBottom: Theme.spacing.md,
  },
  selectorScroll: {
    gap: 8,
    paddingBottom: Theme.spacing.md,
  },
  selectorPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.borderRadius.full,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  selectorPillActive: {
    backgroundColor: Theme.colors.primary,
    borderColor: Theme.colors.primary,
  },
  selectorText: {
    color: Theme.colors.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
  selectorTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: Theme.borderRadius.full,
    gap: 6,
  },
  exportBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  exportResultBox: {
    marginTop: Theme.spacing.md,
  },
  jsonPreview: {
    backgroundColor: Theme.colors.surfaceContainerHigh,
    color: Theme.colors.subtext,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    height: 100,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.sm,
  },
  fileDropzone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Theme.colors.primary,
    backgroundColor: 'rgba(255, 89, 89, 0.05)',
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.md,
  },
  dropzoneTitle: {
    color: Theme.colors.onSurface,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 6,
  },
  dropzoneSubtitle: {
    color: Theme.colors.subtext,
    fontSize: 11,
    marginTop: 2,
  },
  fileLoadedBadge: {
    backgroundColor: 'rgba(255, 89, 89, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Theme.borderRadius.md,
    marginTop: 6,
  },
  fileLoadedText: {
    color: Theme.colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  importInput: {
    backgroundColor: Theme.colors.surfaceContainerHigh,
    color: Theme.colors.onSurface,
    fontSize: 13,
    minHeight: 90,
    borderRadius: Theme.borderRadius.md,
    padding: Theme.spacing.sm,
    textAlignVertical: 'top',
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  restoreBtn: {
    backgroundColor: Theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    borderRadius: Theme.borderRadius.full,
    gap: 8,
  },
  restoreBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  statusText: {
    color: Theme.colors.primary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 10,
  },
});
