import React from 'react';
import { View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CoverArtProps {
  url?: string;
  size?: number;
  borderRadius?: number;
}

export function CoverArt({ url, size = 48, borderRadius = 10 }: CoverArtProps) {
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        className="bg-surfaceContainerHigh"
        style={{ width: size, height: size, borderRadius }}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      className="bg-surfaceContainerHigh items-center justify-center"
      style={{ width: size, height: size, borderRadius }}
    >
      <Ionicons name="musical-notes" size={size * 0.45} color="#FF5959" />
    </View>
  );
}
