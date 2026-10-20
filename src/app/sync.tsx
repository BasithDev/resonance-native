// Sync with the web (mockup screens 11–12): scan the web's QR, sync, show what moved.
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '@/components/PressableScale';
import { showToast } from '@/components/Toast';
import { downloads } from '@/downloads/manager';
import { formatCounts, formatDownloadSize } from '@/sync/format';
import { runAppSync, type AppSyncResult } from '@/sync/runAppSync';
import { useSyncFlow } from '@/sync/useSyncFlow';
import { colors, font, radii } from '@/theme/tokens';

const FRAME = 240;
const LINE_INSET = 14;

const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

function CloseButton() {
  return (
    <Pressable onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
      <MaterialIcons name="close" size={24} color={colors.text} />
    </Pressable>
  );
}

function ScanLine() {
  const y = useSharedValue(LINE_INSET);
  useEffect(() => {
    y.set(withRepeat(withTiming(FRAME - LINE_INSET, { duration: 1600, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [y]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.get() }] }));
  return <Animated.View style={[styles.scanLine, style]} />;
}

function Scanner({ notice, onScanned }: { notice: string | null; onScanned: (text: string) => void }) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const ask = useCallback(() => {
    requestPermission().catch((e) => console.warn('[sync] camera permission request failed', e));
  }, [requestPermission]);

  // The camera opens straight away: ask the first time without an extra tap.
  useEffect(() => {
    if (permission?.status === 'undetermined') ask();
  }, [permission?.status, ask]);

  // Access may have been granted in the system settings while the app was in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') getPermission().catch((e) => console.warn('[sync] camera permission check failed', e));
    });
    return () => sub.remove();
  }, [getPermission]);

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <CloseButton />
      <Text style={styles.headerTitle}>Sync with web</Text>
      <View style={styles.headerSpacer} />
    </View>
  );

  if (!permission?.granted) {
    return (
      <View style={styles.scanRoot}>
        {header}
        {permission && permission.status !== 'undetermined' ? (
          <View style={styles.center}>
            <MaterialIcons name="photo-camera" size={40} color={colors.muted} />
            <Text style={styles.body}>Resonance needs the camera to scan the sync QR code on your computer.</Text>
            <PressableScale
              onPress={() => (permission.canAskAgain ? ask() : void Linking.openSettings())}
              style={[styles.btn, styles.btnPrimary]}
              accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.onPrimary }]}>Grant camera access</Text>
            </PressableScale>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.scanRoot}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => onScanned(data)}
      />
      {/* Dims everything around the scan frame. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={styles.dim}>{header}</View>
        <View style={styles.frameRow}>
          <View style={styles.dimFlex} />
          <View style={styles.frame}>
            <ScanLine />
          </View>
          <View style={styles.dimFlex} />
        </View>
        <View style={[styles.dim, styles.hints]}>
          <Text style={styles.hint}>
            Open <Text style={styles.bold}>Sync</Text> on the web and point the camera at the QR code
          </Text>
          <Text style={styles.subHint}>Phone and computer must be on the same Wi-Fi</Text>
          {notice ? (
            <View style={styles.notice} accessibilityLiveRegion="polite">
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function SummaryRow({ icon, label, value, accent }: { icon: string; label: string; value: string; accent: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>
        {icon} {label}
      </Text>
      <Text style={[styles.rowValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

function Result({ result }: { result: AppSyncResult }) {
  const insets = useSafeAreaInsets();
  const [queued, setQueued] = useState(false);
  const { summary, newSongs } = result;
  const n = newSongs.length;
  const size = formatDownloadSize(newSongs);

  const download = () => {
    setQueued(true);
    downloads.enqueue(newSongs.map((s) => s.youtubeId)).catch((e) => {
      console.warn('[sync] enqueue failed', e);
      setQueued(false);
      showToast("Couldn't start the downloads");
    });
  };

  return (
    <View style={[styles.resultRoot, { paddingTop: insets.top + 56, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.check}>
        <MaterialIcons name="check" size={38} color={colors.mint} />
      </View>
      <Text style={styles.h1}>All synced</Text>
      <Text style={styles.muted}>Phone and web now match</Text>

      <View style={[styles.card, styles.summaryCard]}>
        <SummaryRow icon="↓" label="From web" value={formatCounts(summary.toPhone, true)} accent={colors.mint} />
        <SummaryRow icon="↑" label="From phone" value={formatCounts(summary.fromPhone, true)} accent={colors.mint} />
        <SummaryRow icon="🗑" label="Removed" value={formatCounts(summary.removed, false)} accent={colors.primary} />
      </View>

      {n > 0 ? (
        <View style={[styles.card, styles.downloadCard]}>
          <View style={styles.flex}>
            <Text style={styles.cardTitle}>
              {queued ? `Downloading ${n} new ${n === 1 ? 'song' : 'songs'}` : `Download the ${n} new ${n === 1 ? 'song' : 'songs'}?`}
            </Text>
            {size && !queued ? <Text style={styles.cardHint}>{size}</Text> : null}
          </View>
          {queued ? (
            <MaterialIcons name="check" size={22} color={colors.mint} />
          ) : (
            <PressableScale onPress={download} style={[styles.btnSmall, styles.btnMint]} accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.onMint }]}>⬇ Yes</Text>
            </PressableScale>
          )}
        </View>
      ) : null}

      <PressableScale onPress={close} style={[styles.btn, styles.done]} accessibilityRole="button">
        <Text style={[styles.btnText, { color: colors.muted }]}>Done</Text>
      </PressableScale>
    </View>
  );
}

export default function SyncScreen() {
  const insets = useSafeAreaInsets();
  const { state, onScanned, retry } = useSyncFlow(runAppSync);

  if (state.phase === 'scanning') return <Scanner notice={state.notice} onScanned={onScanned} />;
  if (state.phase === 'done') return <Result result={state.result} />;

  return (
    <View style={[styles.resultRoot, { paddingTop: insets.top + 8 }]}>
      {state.phase === 'error' ? (
        <View style={styles.headerLeft}>
          <CloseButton />
        </View>
      ) : null}
      <View style={styles.center}>
        {state.phase === 'syncing' ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.body}>Syncing with your computer…</Text>
          </>
        ) : (
          <>
            <MaterialIcons name="error-outline" size={44} color={colors.primary} />
            <Text style={styles.body}>{state.message}</Text>
            <PressableScale onPress={retry} style={[styles.btn, styles.btnPrimary]} accessibilityRole="button">
              <Text style={[styles.btnText, { color: colors.onPrimary }]}>Try again</Text>
            </PressableScale>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scanRoot: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  headerLeft: { paddingHorizontal: 16, alignSelf: 'flex-start' },
  headerTitle: { color: colors.text, fontFamily: font.bold, fontSize: 15 },
  headerSpacer: { width: 24 },
  dim: { flex: 1, backgroundColor: colors.scrim },
  dimFlex: { flex: 1, backgroundColor: colors.scrim },
  frameRow: { flexDirection: 'row', height: FRAME },
  frame: { width: FRAME, height: FRAME, borderRadius: 28, borderWidth: 3, borderColor: colors.primary, overflow: 'hidden' },
  scanLine: {
    position: 'absolute', left: 14, right: 14, top: 0, height: 2, backgroundColor: colors.primary,
    shadowColor: colors.primary, shadowOpacity: 1, shadowRadius: 10, elevation: 6,
  },
  hints: { alignItems: 'center', paddingTop: 28, paddingHorizontal: 32 },
  hint: { color: colors.text, fontFamily: font.regular, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  bold: { fontFamily: font.bold },
  subHint: { color: colors.muted, fontFamily: font.regular, fontSize: 13, marginTop: 8, textAlign: 'center' },
  notice: { marginTop: 20, backgroundColor: colors.s3, borderRadius: radii.pill, paddingHorizontal: 16, paddingVertical: 8 },
  noticeText: { color: colors.primary, fontFamily: font.semibold, fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 32 },
  body: { color: colors.text, fontFamily: font.medium, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  resultRoot: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  check: {
    width: 88, height: 88, borderRadius: 44, backgroundColor: `${colors.mint}22`, alignSelf: 'center',
    alignItems: 'center', justifyContent: 'center',
  },
  h1: { color: colors.text, fontFamily: font.bold, fontSize: 24, textAlign: 'center', marginTop: 16 },
  muted: { color: colors.muted, fontFamily: font.regular, fontSize: 13, textAlign: 'center', marginTop: 4 },
  card: { backgroundColor: colors.s2, borderRadius: radii.lg, paddingHorizontal: 16 },
  summaryCard: { marginTop: 28, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, gap: 12 },
  rowLabel: { color: colors.text, fontFamily: font.medium, fontSize: 15 },
  rowValue: { fontFamily: font.semibold, fontSize: 14, flexShrink: 1, textAlign: 'right' },
  downloadCard: { marginTop: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  cardTitle: { color: colors.text, fontFamily: font.semibold, fontSize: 15 },
  cardHint: { color: colors.muted, fontFamily: font.regular, fontSize: 12, marginTop: 2 },
  btn: { height: 48, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  btnSmall: { height: 38, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: colors.primary },
  btnMint: { backgroundColor: colors.mint },
  btnText: { fontFamily: font.semibold, fontSize: 15 },
  done: { marginTop: 16, backgroundColor: colors.s2 },
});
