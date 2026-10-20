import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { SLEEP_MINUTES, useSleepTimer, type SleepChoice } from '@/player/sleepTimer';
import { colors, font, radii } from '@/theme/tokens';

export function formatRemaining(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The ☾ chip: "☾ Sleep" when off, "☾ 23:41" counting down, "☾ End of song". */
export function SleepChip({ onPress }: { onPress: () => void }) {
  const setting = useSleepTimer((s) => s.setting);
  const [, tick] = useState(0);
  useEffect(() => {
    if (setting?.kind !== 'minutes') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [setting]);
  const remaining = useSleepTimer.getState().remainingSec();
  const label = !setting ? 'Sleep' : remaining === null ? 'End of song' : formatRemaining(remaining);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Sleep timer"
      style={[styles.chip, setting ? styles.chipOn : null]}>
      <Text style={[styles.chipText, setting ? styles.chipTextOn : null]}>☾ {label}</Text>
    </Pressable>
  );
}

const OPTIONS: { choice: SleepChoice; label: string }[] = [
  ...SLEEP_MINUTES.map((m) => ({ choice: m as SleepChoice, label: `${m} minutes` })),
  { choice: 'endOfSong', label: 'End of song' },
];

export function SleepSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setting = useSleepTimer((s) => s.setting);
  const pick = (c: SleepChoice) => {
    useSleepTimer.getState().set(c);
    onClose();
  };
  const isActive = (c: SleepChoice) =>
    setting?.kind === 'endOfSong' ? c === 'endOfSong' : setting?.kind === 'minutes' && setting.minutes === c;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <View style={styles.sheet}>
          <Text style={styles.heading}>Sleep timer</Text>
          {OPTIONS.map((o) => (
            <Pressable key={String(o.choice)} onPress={() => pick(o.choice)} style={styles.row} accessibilityRole="button">
              <Text style={[styles.rowText, isActive(o.choice) ? { color: colors.primary } : null]}>{o.label}</Text>
            </Pressable>
          ))}
          {setting ? (
            <Pressable onPress={() => pick(null)} style={styles.row} accessibilityRole="button">
              <Text style={[styles.rowText, { color: colors.muted }]}>Turn off timer</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: radii.pill, backgroundColor: colors.s3 },
  chipOn: { backgroundColor: colors.primary },
  chipText: { color: colors.muted, fontFamily: font.medium, fontSize: 12 },
  chipTextOn: { color: colors.onPrimary },
  scrim: { flex: 1, justifyContent: 'flex-end', backgroundColor: `${colors.bg}b3` },
  sheet: { backgroundColor: colors.s2, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, padding: 16, paddingBottom: 28 },
  heading: { color: colors.text, fontFamily: font.bold, fontSize: 16, paddingHorizontal: 8, paddingBottom: 8 },
  row: { paddingVertical: 14, paddingHorizontal: 8 },
  rowText: { color: colors.text, fontFamily: font.medium, fontSize: 15 },
});
