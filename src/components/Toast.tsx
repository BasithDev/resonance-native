import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, font, radii } from '@/theme/tokens';

export const NOTHING_TO_SHUFFLE = 'Nothing downloaded to shuffle';
const SHOW_MS = 2500;

type Listener = (message: string | null) => void;
const listeners = new Set<Listener>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** Shows a short app-wide message (needs a mounted <ToastHost />). */
export function showToast(message: string): void {
  listeners.forEach((l) => l(message));
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => listeners.forEach((l) => l(null)), SHOW_MS);
}

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    listeners.add(setMessage);
    return () => {
      listeners.delete(setMessage);
    };
  }, []);
  if (!message) return null;
  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom: insets.bottom + 96 }]}>
      <View style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: { backgroundColor: colors.s4, borderRadius: radii.pill, paddingHorizontal: 18, paddingVertical: 10 },
  text: { color: colors.text, fontFamily: font.medium, fontSize: 13 },
});
