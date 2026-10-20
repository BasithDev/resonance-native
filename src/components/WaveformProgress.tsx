import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { colors, font } from '@/theme/tokens';

const BARS = 44;

/** Stable pseudo-random bar heights per song (a look, not real audio data). */
function barHeights(seed: string): number[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return Array.from({ length: BARS }, () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
    return 0.25 + 0.75 * (((h >>> 0) % 1000) / 1000);
  });
}

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Waveform-styled progress bar; tap or drag to seek. */
export function WaveformProgress({
  seed, positionSec, durationSec, onSeek,
}: { seed: string; positionSec: number; durationSec: number; onSeek: (sec: number) => void }) {
  const heights = useMemo(() => barHeights(seed), [seed]);
  const [width, setWidth] = useState(1);
  const [scrub, setScrub] = useState<number | null>(null); // 0..1 while dragging

  const fraction = scrub ?? (durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0);
  const at = (x: number) => Math.max(0, Math.min(1, x / width));
  const commit = (f: number) => {
    setScrub(null);
    if (durationSec > 0) onSeek(f * durationSec);
  };

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-4, 4])
    .failOffsetY([-16, 16])
    .onStart((e) => setScrub(at(e.x)))
    .onUpdate((e) => setScrub(at(e.x)))
    .onEnd((e) => commit(at(e.x)))
    .onFinalize((_e, success) => {
      if (!success) setScrub(null);
    });
  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => commit(at(e.x)));

  return (
    <View>
      <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
        <View
          style={styles.wave}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width || 1)}
          accessibilityRole="adjustable"
          accessibilityLabel="Seek">
          {heights.map((h, i) => (
            <View
              key={i}
              style={[styles.bar, { height: `${h * 100}%`, opacity: (i + 0.5) / BARS <= fraction ? 0.85 : 0.25 }]}
            />
          ))}
        </View>
      </GestureDetector>
      <View style={styles.times}>
        <Text style={styles.time}>{formatTime(fraction * durationSec)}</Text>
        <Text style={styles.time}>{formatTime(durationSec)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 36 },
  bar: { flex: 1, borderRadius: 2, backgroundColor: colors.primary },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  time: { color: colors.muted, fontFamily: font.regular, fontSize: 11 },
});
