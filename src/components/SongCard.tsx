import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';
import { Track } from '../context/AudioContext';
import { CoverArt } from './CoverArt';

interface SongCardProps {
  track: Track;
  isPlaying?: boolean;
  isCurrent?: boolean;
  onPress: () => void;
  onMorePress?: () => void;
}

function formatDuration(sec?: number) {
  if (!sec || isNaN(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function SongCard({ track, isPlaying, isCurrent, onPress, onMorePress }: SongCardProps) {
  return (
    <TouchableOpacity
      style={[styles.card, isCurrent && styles.activeCard]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.imageBox}>
        <CoverArt url={track.thumbnailUrl} size={140} borderRadius={14} />
        {isCurrent && (
          <View style={styles.playingOverlay}>
            <Ionicons name={isPlaying ? 'stats-chart' : 'pause'} size={20} color="#ffffff" />
          </View>
        )}
      </View>

      <View style={styles.metaBox}>
        <Text numberOfLines={1} style={[styles.title, isCurrent && styles.activeTitle]}>
          {track.title}
        </Text>
        <Text numberOfLines={1} style={styles.channel}>
          {track.channel || 'Unknown Artist'}
        </Text>
        {track.durationSec ? (
          <Text style={styles.duration}>{formatDuration(track.durationSec)}</Text>
        ) : null}
      </View>

      {onMorePress && (
        <TouchableOpacity style={styles.moreBtn} onPress={onMorePress}>
          <Ionicons name="ellipsis-horizontal" size={16} color={Theme.colors.subtext} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Theme.colors.surfaceContainer,
    borderRadius: Theme.borderRadius.lg,
    padding: 10,
    marginHorizontal: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Theme.colors.border,
    position: 'relative',
  },
  activeCard: {
    borderColor: 'rgba(255, 89, 89, 0.5)',
    backgroundColor: Theme.colors.surfaceContainerHigh,
  },
  imageBox: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Theme.colors.surfaceContainerHighest,
  },
  playingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 89, 89, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaBox: {
    marginTop: 8,
  },
  title: {
    color: Theme.colors.onSurface,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  activeTitle: {
    color: Theme.colors.primary,
  },
  channel: {
    color: Theme.colors.subtext,
    fontSize: 12,
    fontWeight: '500',
  },
  duration: {
    color: Theme.colors.subtext,
    fontSize: 11,
    marginTop: 2,
  },
  moreBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 5,
    borderRadius: 12,
  },
});
