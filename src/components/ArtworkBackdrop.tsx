import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';

/** Blurred, saturated artwork behind the player, fading into the background colour. */
export function ArtworkBackdrop({ uri, opacity = 0.55 }: { uri: string | null; opacity?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {uri ? (
        <Image
          source={uri}
          style={[styles.art, { opacity }]}
          contentFit="cover"
          blurRadius={40}
          transition={400}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.fade]} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Overscan so the blur has no soft edges.
  art: { position: 'absolute', top: -40, left: -40, right: -40, bottom: -40 },
  fade: { experimental_backgroundImage: `linear-gradient(180deg, ${colors.bg}00 0%, ${colors.bg}ee 70%)` },
});
