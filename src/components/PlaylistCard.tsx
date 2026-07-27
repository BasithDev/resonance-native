import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';

interface PlaylistCardProps {
  playlist: {
    id: string;
    name: string;
    songCount?: number;
    songs?: any[];
  };
  onPress: () => void;
  onPlayPress?: () => void;
}

export function PlaylistCard({ playlist, onPress, onPlayPress }: PlaylistCardProps) {
  const count = playlist.songCount ?? playlist.songs?.length ?? 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.iconContainer}>
        <Ionicons name="musical-notes" size={28} color={Theme.colors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.name} numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text style={styles.count}>
          {count} {count === 1 ? 'track' : 'tracks'}
        </Text>
      </View>
      {onPlayPress && (
        <TouchableOpacity style={styles.playButton} onPress={onPlayPress}>
          <Ionicons name="play" size={18} color="#ffffff" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainer,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: Theme.borderRadius.md,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    marginLeft: Theme.spacing.md,
  },
  name: {
    color: Theme.colors.onSurface,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  count: {
    color: Theme.colors.subtext,
    fontSize: 13,
  },
  playButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
