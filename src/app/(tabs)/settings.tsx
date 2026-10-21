import { MaterialIcons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showToast } from '@/components/Toast';
import { getDb } from '@/db/instance';
import { freeDiskSpace } from '@/downloads/files';
import { downloads } from '@/downloads/manager';
import { libraryEvents } from '@/library/events';
import * as repo from '@/library/repo';
import { useSettings } from '@/settings/store';
import { formatAgo } from '@/sync/format';
import { currentVersion, manualCheckForUpdate } from '@/update/store';
import * as youtube from '@/youtube/client';
import { colors, font, layout, radii } from '@/theme/tokens';

export const QUALITY_TEXT = 'Best available (≈160 kbps)';

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(n / 1e3))} KB`;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.s4, true: colors.mint }}
        thumbColor={value ? colors.onMint : colors.muted}
        accessibilityLabel={label}
      />
    </View>
  );
}

function StorageRows() {
  const [usedBytes, setUsedBytes] = useState(0);
  const [count, setCount] = useState(0);
  const [freeBytes, setFreeBytes] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    const songs = await repo.listByDownload(await getDb(), ['done']);
    setCount(songs.length);
    setUsedBytes(songs.reduce((sum, s) => sum + (s.sizeBytes ?? 0), 0));
    try {
      setFreeBytes(freeDiskSpace());
    } catch {
      setFreeBytes(null);
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
    return libraryEvents.subscribe(() => refresh().catch(() => {}));
  }, [refresh]);

  const confirmClear = () =>
    Alert.alert('Clear all downloads?', 'The songs stay in your library and stream when you are online.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => void downloads.clearAll().catch(() => showToast("Couldn't clear downloads")) },
    ]);

  return (
    <>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.label}>Storage used</Text>
          <Text style={styles.hint}>
            {count} {count === 1 ? 'song' : 'songs'} on this phone
            {freeBytes !== null ? ` · ${fmtBytes(freeBytes)} free` : ''}
          </Text>
        </View>
        <Text style={styles.value}>{fmtBytes(usedBytes)}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={count === 0}
        onPress={confirmClear}
        style={[styles.row, count === 0 && styles.disabled]}>
        <Text style={styles.danger}>Clear all downloads</Text>
      </Pressable>
    </>
  );
}

/** "Last synced 2 days ago"; re-read when shown and after any library change (a sync emits one). */
function SyncRow() {
  const [lastSyncAt, setLastSyncAt] = useState<number | null | undefined>(undefined);

  const refresh = useCallback(async () => {
    setLastSyncAt(await repo.getLastSyncAt(await getDb()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
    }, [refresh]),
  );
  useEffect(() => libraryEvents.subscribe(() => refresh().catch(() => {})), [refresh]);

  const hint =
    lastSyncAt === undefined ? ' ' : lastSyncAt === null ? 'Never synced' : `Last synced ${formatAgo(lastSyncAt, Date.now())}`;

  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/sync')} style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.label}>Sync with web</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <MaterialIcons name="sync" size={22} color={colors.primary} />
    </Pressable>
  );
}

function YtdlpRow() {
  const [version, setVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    youtube.version().then(setVersion).catch(() => setVersion('unknown'));
  }, []);

  const update = async () => {
    setBusy(true);
    setResult(null);
    try {
      const r = await youtube.update();
      setResult(r === 'updated' ? 'Updated' : 'Already up to date');
      if (r === 'updated') setVersion(await youtube.version());
    } catch {
      setResult("Couldn't update — check your connection");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.label}>yt-dlp</Text>
        <Text style={styles.hint}>{result ?? (version ?? 'Checking…')}</Text>
        {result && version ? <Text style={styles.hint}>{version}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={update} hitSlop={8} style={busy && styles.disabled}>
        <Text style={styles.action}>{busy ? 'Updating…' : 'Update'}</Text>
      </Pressable>
    </View>
  );
}

/** Installed version plus a manual update check; a newer release opens the update dialog. */
function AppUpdateRow() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const check = async () => {
    setBusy(true);
    setResult(null);
    const r = await manualCheckForUpdate();
    setBusy(false);
    if (r.kind === 'upToDate') setResult("You're up to date");
    else if (r.kind === 'failed') setResult("Couldn't check — check your connection");
  };

  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={styles.label}>Check for updates</Text>
        <Text style={styles.hint}>Version {currentVersion()}</Text>
        {result ? <Text style={styles.hint}>{result}</Text> : null}
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={check} hitSlop={8} style={busy && styles.disabled}>
        <Text style={styles.action}>{busy ? 'Checking…' : 'Check'}</Text>
      </Pressable>
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const downloadOnCellular = useSettings((s) => s.downloadOnCellular);
  const autoDownloadLiked = useSettings((s) => s.autoDownloadLiked);
  const set = useSettings((s) => s.set);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: layout.miniPlayer + 12 }}>
      <Text style={styles.title}>Settings</Text>

      <Section title="Sync">
        <SyncRow />
      </Section>

      <Section title="Downloads">
        <ToggleRow label="Download on mobile data" hint="Off: downloads wait for Wi-Fi" value={downloadOnCellular} onChange={(v) => set('downloadOnCellular', v)} />
        <ToggleRow label="Auto-download liked songs" value={autoDownloadLiked} onChange={(v) => set('autoDownloadLiked', v)} />
        <View style={styles.row}>
          <Text style={[styles.label, styles.flex]}>Audio quality</Text>
          <Text style={styles.value}>{QUALITY_TEXT}</Text>
        </View>
      </Section>

      <Section title="Storage">
        <StorageRows />
      </Section>

      <Section title="YouTube">
        <YtdlpRow />
      </Section>

      <Section title="About">
        <AppUpdateRow />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 28, paddingHorizontal: 16, marginBottom: 12 },
  section: { marginBottom: 16 },
  sectionTitle: { color: colors.muted, fontFamily: font.semibold, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: 20, marginBottom: 8 },
  card: { backgroundColor: colors.s2, borderRadius: radii.lg, marginHorizontal: 16, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56 },
  flex: { flex: 1 },
  label: { color: colors.text, fontFamily: font.medium, fontSize: 15 },
  hint: { color: colors.muted, fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  value: { color: colors.muted, fontFamily: font.regular, fontSize: 13 },
  action: { color: colors.primary, fontFamily: font.semibold, fontSize: 14 },
  danger: { color: colors.primary, fontFamily: font.semibold, fontSize: 15 },
  disabled: { opacity: 0.4 },
});
