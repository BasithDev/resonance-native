import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';
import { CoverArt } from './CoverArt';

interface PlaylistCardProps {
  playlist: {
    id: string;
    name: string;
    songCount?: number;
    songs?: any[];
    coverUrl?: string;
  };
  onPress: () => void;
  onPlayPress?: () => void;
}

export function PlaylistCard({ playlist, onPress, onPlayPress }: PlaylistCardProps) {
  const count = playlist.songCount ?? playlist.songs?.length ?? 0;
  const firstWithThumb = playlist.songs?.find((s: any) => s.thumbnailUrl || s.coverUrl);
  const coverUrl =
    playlist.coverUrl ||
    firstWithThumb?.thumbnailUrl ||
    firstWithThumb?.coverUrl ||
    null;
  const isAllSongs = playlist.id === 'all-songs';

  return (
    <TouchableOpacity
      style={[styles.gridCardWindow, isAllSongs && styles.allSongsGridCard]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Square Cover Artwork Box */}
      <View style={styles.squareCoverBox}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.coverImage} resizeMode="cover" />
        ) : isAllSongs ? (
          <View style={styles.allSongsCoverOverlay}>
            <Ionicons name="musical-notes" size={44} color="#ffffff" />
          </View>
        ) : (
          <View style={styles.fallbackCoverBox}>
            <Ionicons name="albums-outline" size={40} color={Theme.colors.primary} />
          </View>
        )}

        {/* Floating Circular Play FAB Button on Artwork */}
        {onPlayPress && (
          <TouchableOpacity
            style={styles.playFabOverlay}
            onPress={(e) => {
              e.stopPropagation();
              onPlayPress();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={18} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Playlist Metadata Info */}
      <View style={styles.metaContainer}>
        <Text style={styles.playlistName} numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text style={styles.trackCountBadge}>
          {count} {count === 1 ? 'track' : 'tracks'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gridCardWindow: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceContainer,
    borderRadius: Theme.borderRadius.lg,
    padding: 10,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    marginHorizontal: 4,
  },
  allSongsGridCard: {
    borderColor: 'rgba(255, 89, 89, 0.4)',
    backgroundColor: Theme.colors.surfaceContainerHigh,
  },
  squareCoverBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Theme.borderRadius.md,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: Theme.colors.surfaceContainerHighest,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  allSongsCoverOverlay: {
    width: '100%',
    height: '100%',
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackCoverBox: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.surfaceContainerHigh,
  },
  playFabOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 6,
  },
  metaContainer: {
    marginTop: 10,
    paddingHorizontal: 2,
  },
  playlistName: {
    color: Theme.colors.onSurface,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  trackCountBadge: {
    color: Theme.colors.subtext,
    fontSize: 12,
    fontWeight: '600',
  },
});
