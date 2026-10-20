import { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useConnectivity } from '@/net/connectivity';
import { colors, font } from '@/theme/tokens';

export const OFFLINE_TEXT = "You're offline — playing from your phone";
const BAR_HEIGHT = 30;

/** Mint strip at the top of the app that slides in while the phone has no internet. */
export function OfflineBanner() {
  const { online } = useConnectivity();
  const insets = useSafeAreaInsets();
  const open = useSharedValue(online ? 0 : 1);

  useEffect(() => {
    open.value = withTiming(online ? 0 : 1, { duration: 250 });
  }, [online, open]);

  const style = useAnimatedStyle(() => ({
    height: open.value * (BAR_HEIGHT + insets.top),
    opacity: open.value,
  }));

  return (
    <Animated.View pointerEvents="none" accessibilityLiveRegion="polite" style={[styles.bar, style]}>
      <Text style={[styles.text, { marginTop: insets.top }]} numberOfLines={1}>{OFFLINE_TEXT}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.mint, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  text: { color: colors.onMint, fontFamily: font.semibold, fontSize: 13, height: BAR_HEIGHT, lineHeight: BAR_HEIGHT },
});
