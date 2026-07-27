import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudio, Track } from '../../context/AudioContext';
import { SongItem } from '../../components/SongItem';
import { Theme } from '../../constants/theme';
import * as api from '../../services/api';

export default function SearchScreen() {
  const { playTrack, playerTrack, isPlaying } = useAudio();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await api.searchYouTube(query.trim());
      setResults(res?.songs || res || []);
    } catch (err: any) {
      console.error('Search error:', err);
      Alert.alert('Search Failed', err.message || 'Could not connect to YouTube search API.');
    } finally {
      setLoading(false);
    }
  }

  async function handleImportTrack(track: Track) {
    const songId = track.id || track.youtubeId;
    if (!songId) return;
    setImportingId(songId);
    try {
      await api.batchImportSongs([track]);
      Alert.alert('Success', `"${track.title}" imported into your library!`);
    } catch (err: any) {
      Alert.alert('Import Error', err.message || 'Failed to import track.');
    } finally {
      setImportingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerSubtitle}>DISCOVER</Text>
        <Text style={styles.headerTitle}>YouTube Search</Text>
      </View>

      {/* Search Input Box */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={20} color={Theme.colors.primary} />
        <TextInput
          style={styles.input}
          placeholder="Search songs, artists, or keywords..."
          placeholderTextColor={Theme.colors.subtext}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={18} color={Theme.colors.subtext} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Theme.colors.primary} />
          <Text style={styles.loadingText}>Searching YouTube...</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.centerContainer}>
          <Ionicons name="compass-outline" size={56} color={Theme.colors.subtext} />
          <Text style={styles.emptyTitle}>Explore Millions of Songs</Text>
          <Text style={styles.emptySubtitle}>
            Type any song name, band, or video title above to search.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id || item.youtubeId || Math.random().toString()}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const currentId = playerTrack?.id || playerTrack?.youtubeId;
            const itemId = item.id || item.youtubeId;
            const itemMatches = currentId && itemId === currentId;

            return (
              <SongItem
                track={item}
                isCurrent={Boolean(itemMatches)}
                isPlaying={Boolean(itemMatches && isPlaying)}
                onPress={() => playTrack(item, results)}
                onMorePress={() => {
                  Alert.alert(
                    item.title,
                    'Options',
                    [
                      {
                        text: 'Import to Library',
                        onPress: () => handleImportTrack(item),
                      },
                      { text: 'Cancel', style: 'cancel' },
                    ]
                  );
                }}
              />
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    paddingHorizontal: Theme.spacing.lg,
    paddingTop: Theme.spacing.md,
    paddingBottom: Theme.spacing.sm,
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainer,
    marginHorizontal: Theme.spacing.lg,
    marginVertical: Theme.spacing.sm,
    paddingLeft: Theme.spacing.md,
    paddingRight: 4,
    height: 48,
    borderRadius: Theme.borderRadius.full,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  input: {
    flex: 1,
    color: Theme.colors.onSurface,
    marginLeft: Theme.spacing.sm,
    fontSize: 14,
  },
  searchBtn: {
    backgroundColor: Theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Theme.borderRadius.full,
    marginLeft: 6,
  },
  searchBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 140,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Theme.spacing.xl,
  },
  loadingText: {
    color: Theme.colors.subtext,
    fontSize: 14,
    marginTop: Theme.spacing.md,
  },
  emptyTitle: {
    color: Theme.colors.onSurface,
    fontSize: 18,
    fontWeight: '700',
    marginTop: Theme.spacing.md,
  },
  emptySubtitle: {
    color: Theme.colors.subtext,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
  },
});
