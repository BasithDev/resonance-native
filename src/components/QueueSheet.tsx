import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  type SharedValue, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import type { Song } from '@/library/types';
import { useConnectivity } from '@/net/connectivity';
import { artworkUri, isPlayable, selectCurrent, usePlayer } from '@/player/store';
import { colors, font, radii } from '@/theme/tokens';

import { type Drag, IDLE_DRAG as IDLE, reorderPan, useDragSlotStyle } from './reorder';

const ROW_H = 56;

function QueueRow({
  song, pos, count, playable, drag, scroll, onMove, onRemove,
}: {
  song: Song;
  pos: number;
  count: number;
  playable: boolean;
  drag: SharedValue<Drag>;
  scroll: ReturnType<typeof Gesture.Native>;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}) {
  const style = useDragSlotStyle(drag, pos, ROW_H);
  // The sheet resets `drag` once the queue re-renders.
  const handle = reorderPan({ pos, count, rowHeight: ROW_H, drag, scroll, onMove });

  return (
    <Animated.View style={[styles.rowSlot, style]}>
      <ReanimatedSwipeable
        friction={1.5}
        rightThreshold={72}
        overshootRight={false}
        onSwipeableOpen={onRemove}
        renderRightActions={() => (
          <View style={styles.remove}>
            <Text style={styles.removeText}>Remove</Text>
          </View>
        )}>
        <View style={[styles.row, !playable && styles.dim]}>
          <Image source={artworkUri(song)} style={styles.art} contentFit="cover" />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {song.title}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {playable ? (song.channel ?? '') : 'skipped while offline'}
            </Text>
          </View>
          {!playable ? <MaterialIcons name="cloud-off" size={16} color={colors.muted} /> : null}
          <GestureDetector gesture={handle}>
            <View style={styles.handle} accessibilityLabel="Drag to reorder">
              <MaterialIcons name="drag-handle" size={22} color={colors.muted} />
            </View>
          </GestureDetector>
        </View>
      </ReanimatedSwipeable>
    </Animated.View>
  );
}

/** "Up next" bottom sheet: drag ≡ to reorder, swipe left to remove. */
export function QueueSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const queue = usePlayer((s) => s.queue);
  const current = usePlayer(selectCurrent);
  const moveInQueue = usePlayer((s) => s.moveInQueue);
  const removeFromQueue = usePlayer((s) => s.removeFromQueue);
  const clearUpNext = usePlayer((s) => s.clearUpNext);
  const { online } = useConnectivity();
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true); // stays mounted until the close animation ends

  const y = useSharedValue(height);
  const drag = useSharedValue<Drag>(IDLE);
  const scroll = useMemo(() => Gesture.Native(), []);

  useEffect(() => {
    if (open) y.set(withTiming(0, { duration: 280 }));
    else {
      y.set(
        withTiming(height, { duration: 240 }, (done) => {
          if (done) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [open, height, y]);

  const start = queue ? queue.index + 1 : 0;
  const upNext = useMemo(() => (queue ? queue.items.slice(queue.index + 1) : []), [queue]);
  useLayoutEffect(() => {
    drag.set(IDLE);
  }, [upNext, drag]);

  // Stable keys across reorders, so rows animate instead of remounting.
  const keys = useMemo(() => {
    const seen = new Map<string, number>();
    return upNext.map((s) => {
      const n = seen.get(s.youtubeId) ?? 0;
      seen.set(s.youtubeId, n + 1);
      return `${s.youtubeId}#${n}`;
    });
  }, [upNext]);

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: 1 - y.get() / height }));

  const grab = Gesture.Pan()
    .onUpdate((e) => {
      y.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 100 || e.velocityY > 800) scheduleOnRN(onClose);
      else y.set(withSpring(0, { damping: 20 }));
    });

  if (!mounted) return null;
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close queue" />
      </Animated.View>
      <Animated.View style={[styles.sheet, { top: insets.top + 64 }, sheetStyle]}>
        <GestureDetector gesture={grab}>
          <View>
            <View style={styles.grab} />
            {current ? (
              <View style={styles.nowRow}>
                <Image source={artworkUri(current)} style={styles.nowArt} contentFit="cover" />
                <View style={styles.text}>
                  <Text style={styles.title} numberOfLines={1}>
                    {current.title}
                  </Text>
                  <Text style={styles.sub}>Now playing</Text>
                </View>
              </View>
            ) : null}
            <View style={styles.headerRow}>
              <Text style={styles.header}>Up next</Text>
              {upNext.length > 0 ? (
                <Pressable onPress={clearUpNext} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear up next">
                  <Text style={styles.clear}>Clear</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </GestureDetector>
        <GestureDetector gesture={scroll}>
          <ScrollView contentContainerStyle={{ height: upNext.length * ROW_H + insets.bottom + 16 }}>
            {upNext.length === 0 ? <Text style={styles.empty}>Nothing queued after this song</Text> : null}
            {upNext.map((s, pos) => (
              <QueueRow
                key={keys[pos]}
                song={s}
                pos={pos}
                count={upNext.length}
                playable={isPlayable(s, online)}
                drag={drag}
                scroll={scroll}
                onMove={(from, to) => moveInQueue(start + from, start + to)}
                onRemove={() => removeFromQueue(start + pos)}
              />
            ))}
          </ScrollView>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.scrim },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.s2,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    overflow: 'hidden',
  },
  grab: { width: 36, height: 4, borderRadius: 4, backgroundColor: colors.hairline, alignSelf: 'center', marginTop: 10, marginBottom: 12 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  nowArt: { width: 46, height: 46, borderRadius: 10, backgroundColor: colors.s4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  header: { color: colors.text, fontFamily: font.bold, fontSize: 14 },
  clear: { color: colors.primary, fontFamily: font.semibold, fontSize: 13 },
  empty: { color: colors.muted, fontFamily: font.regular, fontSize: 13, paddingHorizontal: 16, paddingTop: 8 },
  rowSlot: { position: 'absolute', left: 0, right: 0, height: ROW_H },
  row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 6, backgroundColor: colors.s2 },
  dim: { opacity: 0.38 },
  art: { width: 40, height: 40, borderRadius: radii.sm, backgroundColor: colors.s4 },
  text: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontFamily: font.semibold, fontSize: 13 },
  sub: { color: colors.muted, fontFamily: font.regular, fontSize: 11 },
  handle: { width: 44, height: ROW_H, alignItems: 'center', justifyContent: 'center' },
  remove: { width: 96, backgroundColor: colors.primaryStrong, alignItems: 'center', justifyContent: 'center' },
  removeText: { color: colors.white, fontFamily: font.semibold, fontSize: 12 },
});
