import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { artworkUri, selectCurrent, usePlayer } from '@/player/store';
import { colors, font, layout, radii } from '@/theme/tokens';

import { PlayPauseIcon } from './PlayPauseIcon';

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Where the pill's artwork sits on screen, so the player can fly its artwork
 * out of the pill on open and back into it on close.
 */
export const miniArt: { rect: Rect | null } = { rect: null };

const ART = 38;
const PAD = 10;

/** The pill is laid out in the full-window root view, so its frame is in window coordinates. */
function trackArt(pill: Rect) {
  miniArt.rect = { x: pill.x + PAD, y: pill.y + (pill.height - ART) / 2, width: ART, height: ART };
}

function openPlayer() {
  router.push('/player');
}

/** Three bouncing bars while music plays. */
function EqBars() {
  return (
    <View style={styles.bars}>
      {[0, 200, 400].map((delay) => (
        <EqBar key={delay} delay={delay} />
      ))}
    </View>
  );
}

function EqBar({ delay }: { delay: number }) {
  const h = useSharedValue(3);
  useEffect(() => {
    h.set(withDelay(delay, withRepeat(withSequence(withTiming(12, { duration: 450 }), withTiming(3, { duration: 450 })), -1)));
  }, [delay, h]);
  const style = useAnimatedStyle(() => ({ height: h.get() }));
  return <Animated.View style={[styles.bar, style]} />;
}

/** The floating "now playing" pill. Tap or swipe up to open the player. */
export function MiniPlayer({ bottom }: { bottom: number }) {
  const song = usePlayer(selectCurrent);
  const playing = usePlayer((s) => s.status.playing);
  const buffering = usePlayer((s) => s.status.buffering);
  const progress = usePlayer((s) => (s.status.durationSec > 0 ? s.status.positionSec / s.status.durationSec : 0));
  const togglePlay = usePlayer((s) => s.togglePlay);

  const toggle = Gesture.Tap().onEnd(() => scheduleOnRN(togglePlay));
  const tap = Gesture.Tap().requireExternalGestureToFail(toggle).onEnd(() => scheduleOnRN(openPlayer));
  const swipeUp = Gesture.Pan()
    .activeOffsetY(-12)
    .failOffsetX([-24, 24])
    .onEnd((e) => {
      if (e.translationY < -24 || e.velocityY < -500) scheduleOnRN(openPlayer);
    });

  if (!song) return null;
  return (
    <GestureDetector gesture={Gesture.Exclusive(swipeUp, tap)}>
      <View style={[styles.pill, { bottom }]} onLayout={(e) => trackArt(e.nativeEvent.layout)}>
        <Image source={artworkUri(song)} style={styles.art} contentFit="cover" transition={200} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {song.title}
          </Text>
          <Text style={styles.channel} numberOfLines={1}>
            {song.channel ?? ''}
          </Text>
        </View>
        {buffering ? <ActivityIndicator size="small" color={colors.primary} /> : playing ? <EqBars /> : null}
        <GestureDetector gesture={toggle}>
          <View style={styles.button} hitSlop={8} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'}>
            <PlayPauseIcon playing={playing} size={26} color={colors.text} />
          </View>
        </GestureDetector>
        <View style={styles.track}>
          <View style={[styles.progress, { width: `${Math.min(100, progress * 100)}%` }]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: layout.miniPlayer,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: PAD,
    overflow: 'hidden',
    elevation: 10,
    experimental_backgroundImage: `linear-gradient(90deg, ${colors.miniPlayerGlow}, ${colors.s3})`,
    backgroundColor: colors.s3,
  },
  art: { width: ART, height: ART, borderRadius: 9, backgroundColor: colors.s4 },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 13 },
  channel: { color: colors.muted, fontFamily: font.regular, fontSize: 11 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 12 },
  bar: { width: 3, borderRadius: 2, backgroundColor: colors.primary },
  button: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  track: { position: 'absolute', left: 14, right: 14, bottom: 0, height: 2, backgroundColor: colors.trackLine },
  progress: { height: 2, backgroundColor: colors.primary },
});
