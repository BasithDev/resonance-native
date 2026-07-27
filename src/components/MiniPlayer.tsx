import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../context/AudioContext';
import { CoverArt } from './CoverArt';
import { Theme } from '../constants/theme';

export function MiniPlayer() {
  const {
    playerTrack,
    isPlaying,
    isAudioLoading,
    progress,
    togglePlayPause,
    playNext,
    setIsPlayerOpen,
  } = useAudio();

  if (!playerTrack) return null;

  return (
    <TouchableOpacity
      style={styles.container}
      activeOpacity={0.9}
      onPress={() => setIsPlayerOpen(true)}
    >
      {/* Top Progress Rail */}
      <View style={styles.progressRailBackground}>
        <View style={[styles.progressRailFill, { width: `${Math.min(100, progress * 100)}%` }]} />
      </View>

      <View style={styles.inner}>
        <CoverArt url={playerTrack.thumbnailUrl} size={42} borderRadius={8} />

        <View style={styles.info}>
          <Text numberOfLines={1} style={styles.title}>
            {playerTrack.title}
          </Text>
          <Text numberOfLines={1} style={styles.channel}>
            {playerTrack.channel || 'Unknown Artist'}
          </Text>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
          >
            {isAudioLoading ? (
              <ActivityIndicator size="small" color={Theme.colors.primary} />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={22}
                color={Theme.colors.onSurface}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={(e) => {
              e.stopPropagation();
              playNext();
            }}
          >
            <Ionicons name="play-skip-forward" size={20} color={Theme.colors.onSurface} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 84, // Pushed above bottom tabs
    left: Theme.spacing.md,
    right: Theme.spacing.md,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderRadius: Theme.borderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Theme.colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  progressRailBackground: {
    height: 3,
    backgroundColor: Theme.colors.surfaceContainerHighest,
    width: '100%',
  },
  progressRailFill: {
    height: 3,
    backgroundColor: Theme.colors.primary,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: 8,
  },
  info: {
    flex: 1,
    marginLeft: Theme.spacing.md,
    justifyContent: 'center',
  },
  title: {
    color: Theme.colors.onSurface,
    fontSize: 14,
    fontWeight: '700',
  },
  channel: {
    color: Theme.colors.subtext,
    fontSize: 12,
    marginTop: 1,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    padding: 6,
  },
});
