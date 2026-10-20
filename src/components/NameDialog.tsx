import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, font, radii } from '@/theme/tokens';

/** A small text prompt (Android has no Alert.prompt): create or rename a playlist. */
export function NameDialog({
  open, title, initial = '', confirmLabel, onCancel, onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: string;
  confirmLabel: string;
  onCancel: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName(initial); // fresh text every time it opens
  }
  const trimmed = name.trim();
  const submit = () => {
    if (trimmed) onSubmit(trimmed);
  };
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            onSubmitEditing={submit}
            autoFocus
            selectTextOnFocus
            placeholder="Playlist name"
            placeholderTextColor={colors.muted}
            cursorColor={colors.primary}
            selectionColor={colors.primary}
            returnKeyType="done"
            maxLength={100}
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel} hitSlop={8} accessibilityRole="button" style={styles.action}>
              <Text style={[styles.actionText, { color: colors.muted }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={submit} disabled={!trimmed} hitSlop={8} accessibilityRole="button" style={styles.action}>
              <Text style={[styles.actionText, !trimmed && { opacity: 0.4 }]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: `${colors.bg}b3` },
  card: { backgroundColor: colors.s2, borderRadius: radii.xl, padding: 20 },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 17, marginBottom: 14 },
  input: {
    height: 46, borderRadius: radii.md, backgroundColor: colors.s3, paddingHorizontal: 14,
    color: colors.text, fontFamily: font.regular, fontSize: 15,
  },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  action: { paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { color: colors.primary, fontFamily: font.semibold, fontSize: 15 },
});
