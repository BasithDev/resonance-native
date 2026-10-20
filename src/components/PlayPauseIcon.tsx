import { MaterialIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/** Play and pause glyphs that morph (rotate, scale, cross-fade) into each other. */
export function PlayPauseIcon({ playing, size, color }: { playing: boolean; size: number; color: string }) {
  const p = useSharedValue(playing ? 1 : 0);
  useEffect(() => {
    p.set(withTiming(playing ? 1 : 0, { duration: 220 }));
  }, [playing, p]);

  const play = useAnimatedStyle(() => ({
    opacity: 1 - p.get(),
    transform: [{ rotate: `${p.get() * 90}deg` }, { scale: 1 - 0.5 * p.get() }],
  }));
  const pause = useAnimatedStyle(() => ({
    opacity: p.get(),
    transform: [{ rotate: `${(p.get() - 1) * 90}deg` }, { scale: 0.5 + 0.5 * p.get() }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[StyleSheet.absoluteFill, play]}>
        <MaterialIcons name="play-arrow" size={size} color={color} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, pause]}>
        <MaterialIcons name="pause" size={size} color={color} />
      </Animated.View>
    </View>
  );
}
