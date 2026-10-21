import { MaterialIcons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PressableScale } from '@/components/PressableScale';
import { parseNotes } from '@/update/notes';
import { autoCheckForUpdate, currentVersion, useUpdate } from '@/update/store';
import { colors, font, radii } from '@/theme/tokens';

const FIRST_CHECK_DELAY_MS = 2500; // let the first screen settle

/**
 * "Update available" pop-up with the release notes. Mounted once in the root
 * layout; checks GitHub shortly after launch (at most once per 24 h) and also
 * shows updates found by Settings → Check for updates.
 */
export function UpdateDialog() {
  const pending = useUpdate((s) => s.pending);
  const dismiss = useUpdate((s) => s.dismiss);

  useEffect(() => {
    const t = setTimeout(() => void autoCheckForUpdate(), FIRST_CHECK_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  if (!pending) return null;

  const notes = parseNotes(pending.notes);
  const download = () => {
    Linking.openURL(pending.apkUrl ?? pending.pageUrl).catch(() => {});
    dismiss();
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.icon}>
            <MaterialIcons name="system-update" size={24} color={colors.primary} />
          </View>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.versions}>
            v{currentVersion()} → <Text style={{ color: colors.primary }}>v{pending.version}</Text>
          </Text>

          <Text style={styles.sectionTitle}>What&apos;s new</Text>
          <ScrollView style={styles.notes}>
            {notes.length === 0 ? (
              <Text style={styles.noteText}>Bug fixes and improvements.</Text>
            ) : (
              notes.map((l, i) =>
                l.kind === 'heading' ? (
                  <Text key={i} style={styles.noteHeading}>{l.text}</Text>
                ) : l.kind === 'bullet' ? (
                  <View key={i} style={styles.bulletRow}>
                    <View style={styles.bulletDot} />
                    <Text style={[styles.noteText, styles.flex]}>{l.text}</Text>
                  </View>
                ) : (
                  <Text key={i} style={styles.noteText}>{l.text}</Text>
                ),
              )
            )}
          </ScrollView>

          <PressableScale onPress={download} style={styles.btn} accessibilityRole="button">
            <MaterialIcons name="download" size={20} color={colors.onPrimary} />
            <Text style={styles.btnText}>Download update</Text>
          </PressableScale>
          <Text style={styles.hint}>
            Opens the APK {pending.apkUrl ? 'download' : 'release page'}. Install it over this app; your library and downloads stay.
          </Text>
          <Pressable onPress={dismiss} hitSlop={8} accessibilityRole="button" style={styles.later}>
            <Text style={styles.laterText}>Later</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: `${colors.bg}b3` },
  card: { backgroundColor: colors.s2, borderRadius: radii.xl, padding: 20, maxHeight: '85%' },
  icon: {
    width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.s3,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 20 },
  versions: { color: colors.muted, fontFamily: font.medium, fontSize: 13, marginTop: 4 },
  sectionTitle: {
    color: colors.muted, fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase',
    marginTop: 18, marginBottom: 8,
  },
  notes: { flexGrow: 0, maxHeight: 260, marginBottom: 18 },
  noteHeading: { color: colors.text, fontFamily: font.semibold, fontSize: 14, marginTop: 8, marginBottom: 4 },
  noteText: { color: colors.text, fontFamily: font.regular, fontSize: 14, lineHeight: 20, marginBottom: 4 },
  bulletRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, marginTop: 8 },
  flex: { flex: 1 },
  btn: {
    height: 48, borderRadius: radii.pill, backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnText: { color: colors.onPrimary, fontFamily: font.semibold, fontSize: 15 },
  hint: { color: colors.muted, fontFamily: font.regular, fontSize: 12, textAlign: 'center', marginTop: 8 },
  later: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 10, marginTop: 6 },
  laterText: { color: colors.muted, fontFamily: font.semibold, fontSize: 15 },
});
