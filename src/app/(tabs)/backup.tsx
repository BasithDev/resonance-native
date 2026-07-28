import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
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
    } catch (e) {}
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
    } catch (e) {}
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
        const parsed = JSON.parse(text);
        songsToImport = parsed.songs || (Array.isArray(parsed) ? parsed : []);
        playlistsToCreate = parsed.playlists || [];
      } else if (text.includes(',')) {
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
            } catch (err) {}
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
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 140 }}>
        {/* Header */}
        <View className="mb-1">
          <Text className="text-primary text-[11px] font-extrabold tracking-widest">DATA PORTABILITY</Text>
          <Text className="text-white text-[28px] font-black tracking-tight">Export & Restore</Text>
        </View>

        <Text className="text-subtext text-[14px] leading-5 mb-4">
          Backup your music library, export playlists as JSON/CSV spreadsheets, or restore from a backup file.
        </Text>

        {/* Summary Stats Cards */}
        <View className="flex-row gap-3 mb-5">
          <View className="flex-1 flex-row items-center bg-surfaceContainer rounded-2xl p-4 border border-border gap-3">
            <View className="w-10 h-10 rounded-full bg-primary/15 items-center justify-center">
              <Ionicons name="musical-notes" size={22} color="#FF5959" />
            </View>
            <View className="flex-1">
              <Text className="text-subtext text-[11px] font-semibold">Master Library</Text>
              <Text className="text-white text-[15px] font-extrabold mt-0.5">
                {loading ? '...' : `${songs.length} Tracks`}
              </Text>
            </View>
          </View>

          <View className="flex-1 flex-row items-center bg-surfaceContainer rounded-2xl p-4 border border-border gap-3">
            <View className="w-10 h-10 rounded-full bg-primary/15 items-center justify-center">
              <Ionicons name="albums" size={22} color="#FF5959" />
            </View>
            <View className="flex-1">
              <Text className="text-subtext text-[11px] font-semibold">Custom Playlists</Text>
              <Text className="text-white text-[15px] font-extrabold mt-0.5">
                {loading ? '...' : `${playlists.length} Playlists`}
              </Text>
            </View>
          </View>
        </View>

        {/* EXPORT SECTION */}
        <View className="bg-surfaceContainer rounded-2xl p-4 border border-border">
          <View className="flex-row items-center gap-2.5 mb-1">
            <Ionicons name="cloud-download-outline" size={22} color="#FF5959" />
            <Text className="text-white text-[17px] font-extrabold">Export Library Data</Text>
          </View>

          <Text className="text-subtext text-[13px] mb-4">
            Select collection to export as JSON or CSV:
          </Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
            <TouchableOpacity
              className={`px-3.5 py-2 rounded-full border ${
                selectedPlaylistId === 'all'
                  ? 'bg-primary border-primary'
                  : 'bg-surfaceContainerHigh border-border'
              }`}
              onPress={() => setSelectedPlaylistId('all')}
            >
              <Text
                className={`text-[13px] ${
                  selectedPlaylistId === 'all' ? 'text-white font-bold' : 'text-subtext font-semibold'
                }`}
              >
                Entire Library ({songs.length})
              </Text>
            </TouchableOpacity>

            {playlists.map((pl) => (
              <TouchableOpacity
                key={pl.id}
                className={`px-3.5 py-2 rounded-full border ${
                  selectedPlaylistId === pl.id
                    ? 'bg-primary border-primary'
                    : 'bg-surfaceContainerHigh border-border'
                }`}
                onPress={() => setSelectedPlaylistId(pl.id)}
              >
                <Text
                  className={`text-[13px] ${
                    selectedPlaylistId === pl.id ? 'text-white font-bold' : 'text-subtext font-semibold'
                  }`}
                >
                  {pl.name} ({(pl.songs || []).length})
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View className="flex-row gap-2.5 mt-1">
            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center py-3 rounded-full bg-primary gap-1.5"
              onPress={handleExportJSON}
            >
              <Ionicons name="code-download-outline" size={18} color="#ffffff" />
              <Text className="text-white text-[13px] font-bold">JSON Backup</Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-1 flex-row items-center justify-center py-3 rounded-full bg-surfaceContainerHigh gap-1.5"
              onPress={handleExportCSV}
            >
              <Ionicons name="document-text-outline" size={18} color="#ffffff" />
              <Text className="text-white text-[13px] font-bold">CSV Spreadsheet</Text>
            </TouchableOpacity>
          </View>

          {exportData !== '' && (
            <View className="mt-4">
              <TextInput
                className="bg-surfaceContainerHigh text-subtext text-[11px] h-25 rounded-xl p-3"
                style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}
                multiline
                editable={false}
                value={exportData}
              />
            </View>
          )}
        </View>

        {/* IMPORT & RESTORE SECTION */}
        <View className="bg-surfaceContainer rounded-2xl p-4 border border-border mt-5">
          <View className="flex-row items-center gap-2.5 mb-1">
            <Ionicons name="cloud-upload-outline" size={22} color="#FF5959" />
            <Text className="text-white text-[17px] font-extrabold">Import & Restore Library</Text>
          </View>

          <Text className="text-subtext text-[13px] mb-4">
            Upload a .json / .csv backup file from storage or paste URLs below:
          </Text>

          <TouchableOpacity
            className="border-2 border-dashed border-primary bg-primary/5 rounded-xl p-4 items-center justify-center mb-4"
            onPress={handlePickDocument}
            activeOpacity={0.8}
          >
            <Ionicons name="folder-open-outline" size={32} color="#FF5959" />
            {selectedFileName ? (
              <View className="bg-primary/15 px-3 py-1.5 rounded-md mt-1.5">
                <Text className="text-primary text-[13px] font-bold" numberOfLines={1}>
                  📄 {selectedFileName}
                </Text>
              </View>
            ) : (
              <>
                <Text className="text-white text-[13px] font-bold mt-1.5">Tap to select .json or .csv backup file</Text>
                <Text className="text-subtext text-[11px] mt-0.5">Opens system File Manager</Text>
              </>
            )}
          </TouchableOpacity>

          <TextInput
            className="bg-surfaceContainerHigh text-white text-[13px] min-h-[90px] rounded-xl p-3 mb-4 border border-border"
            style={{ textAlignVertical: 'top' }}
            multiline
            numberOfLines={5}
            placeholder='Or paste JSON payload {"songs": [...]} or YouTube URLs line-by-line...'
            placeholderTextColor="#A0A0A0"
            value={importJson}
            onChangeText={(txt) => {
              setImportJson(txt);
              if (!txt) setSelectedFileName(null);
            }}
          />

          <TouchableOpacity
            className={`bg-primary flex-row items-center justify-center py-3.5 rounded-full gap-2 ${
              isImporting ? 'opacity-60' : ''
            }`}
            onPress={handleRestore}
            disabled={isImporting}
          >
            {isImporting ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Ionicons name="refresh-circle-outline" size={20} color="#ffffff" />
                <Text className="text-white text-[14px] font-bold">Execute Restore & Import</Text>
              </>
            )}
          </TouchableOpacity>

          {statusMsg !== '' && (
            <Text className="text-primary text-[13px] font-semibold text-center mt-2.5">{statusMsg}</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
