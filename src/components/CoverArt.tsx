import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../constants/theme';

interface CoverArtProps {
  url?: string;
  size?: number;
  borderRadius?: number;
}

export function CoverArt({ url, size = 48, borderRadius = Theme.borderRadius.md }: CoverArtProps) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.image, { width: size, height: size, borderRadius }]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View style={[styles.placeholder, { width: size, height: size, borderRadius }]}>
      <Ionicons name="musical-notes" size={size * 0.45} color={Theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: Theme.colors.surfaceContainerHigh,
  },
  placeholder: {
    backgroundColor: Theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
