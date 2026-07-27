import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';
import { CoverArt } from './CoverArt';
import { Track } from '../context/AudioContext';

interface SongItemProps {
  track: Track;
  isPlaying?: boolean;
  isCurrent?: boolean;
  onPress: () => void;
  onMorePress?: () => void;
}

function formatDuration(sec?: number) {
  if (!sec || isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function SongItem({ track, isPlaying, isCurrent, onPress, onMorePress }: SongItemProps) {
  return (
    <TouchableOpacity
      style={[styles.container, isCurrent && styles.activeContainer]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <CoverArt url={track.thumbnailUrl} size={48} borderRadius={8} />

      <View style={styles.infoContainer}>
        <Text
          numberOfLines={1}
          style={[styles.title, isCurrent && styles.activeTitle]}
        >
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.channel}>
          {track.channel || 'Unknown Artist'} • {formatDuration(track.durationSec)}
        </Text>
      </View>

      {isCurrent && (
        <View style={styles.playingIndicator}>
          <Ionicons
            name={isPlaying ? 'stats-chart' : 'pause'}
            size={18}
            color={Theme.colors.primary}
          />
        </View>
      )}

      {onMorePress && (
        <TouchableOpacity
          onPress={onMorePress}
          style={styles.moreButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={Theme.colors.onSurfaceVariant} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.borderRadius.md,
    marginVertical: 2,
    backgroundColor: 'transparent',
  },
  activeContainer: {
    backgroundColor: Theme.colors.surfaceContainer,
  },
  infoContainer: {
    flex: 1,
    marginLeft: Theme.spacing.md,
    justifyContent: 'center',
  },
  title: {
    color: Theme.colors.onSurface,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 2,
  },
  activeTitle: {
    color: Theme.colors.primary,
  },
  channel: {
    color: Theme.colors.subtext,
    fontSize: 13,
  },
  playingIndicator: {
    marginHorizontal: Theme.spacing.sm,
  },
  moreButton: {
    padding: 6,
  },
});
