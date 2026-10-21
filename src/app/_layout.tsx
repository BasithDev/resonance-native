import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, usePathname, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflineBanner } from '@/components/OfflineBanner';
import { MiniPlayer } from '@/components/MiniPlayer';
import { ToastHost } from '@/components/Toast';
import { UpdateDialog } from '@/components/UpdateDialog';
import { downloads } from '@/downloads/manager';
import { usePlayer } from '@/player/store';
import { colors, layout } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

/** The mini-player floats above the tab bar (or the bottom edge off the tabs). */
function FloatingMiniPlayer() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const segments = useSegments();
  const hasQueue = usePlayer((s) => s.queue !== null);
  // Hidden on the full-screen player and the sync camera.
  if (!hasQueue || pathname === '/player' || pathname === '/sync') return null;
  const inTabs = segments[0] === '(tabs)';
  return <MiniPlayer bottom={insets.bottom + (inTabs ? layout.tabBar + 6 : 10)} />;
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  // Puts downloads interrupted by a killed app back in the queue, then resumes it.
  useEffect(() => {
    void downloads.onStartup();
  }, []);

  if (!loaded && !error) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen
          name="player"
          options={{ presentation: 'transparentModal', animation: 'none', contentStyle: { backgroundColor: 'transparent' } }}
        />
      </Stack>
      <FloatingMiniPlayer />
      <ToastHost />
      <UpdateDialog />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.bg } });
