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
  onAddPress?: () => void;
  isAddLoading?: boolean;
}

function formatDuration(sec?: number) {
  if (!sec || isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function SongItem({
  track,
  isPlaying,
  isCurrent,
  onPress,
  onMorePress,
  onAddPress,
  isAddLoading,
}: SongItemProps) {
  return (
    <TouchableOpacity
      style={[styles.container, isCurrent && styles.activeContainer]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {/* Cover Artwork Thumbnail */}
      <CoverArt url={track.thumbnailUrl} size={50} borderRadius={10} />

      {/* Track Info */}
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

      {/* Active Playing Equalizer Indicator */}
      {isCurrent && (
        <View style={styles.playingBadge}>
          <Ionicons
            name={isPlaying ? 'stats-chart' : 'pause'}
            size={16}
            color={Theme.colors.primary}
          />
        </View>
      )}

      {/* Add Button Embedded Inside Card (Icon Only) */}
      {onAddPress && (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onAddPress();
          }}
          style={styles.addBtnInsideIconOnly}
          disabled={isAddLoading}
          activeOpacity={0.8}
        >
          {isAddLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="add" size={20} color="#ffffff" />
          )}
        </TouchableOpacity>
      )}

      {/* 3-Dot Context Options Menu */}
      {onMorePress && (
        <TouchableOpacity
          onPress={onMorePress}
          style={styles.moreButton}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="ellipsis-vertical" size={18} color={Theme.colors.subtext} />
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
    paddingHorizontal: 12,
    borderRadius: Theme.borderRadius.md,
    marginBottom: 8,
    backgroundColor: Theme.colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  activeContainer: {
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderColor: 'rgba(255, 89, 89, 0.4)',
  },
  infoContainer: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    color: Theme.colors.onSurface,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
    letterSpacing: -0.2,
  },
  activeTitle: {
    color: Theme.colors.primary,
  },
  channel: {
    color: Theme.colors.subtext,
    fontSize: 13,
    fontWeight: '500',
  },
  playingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 89, 89, 0.15)',
    marginRight: 4,
  },
  moreButton: {
    padding: 6,
  },
  addBtnInsideIconOnly: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
});
