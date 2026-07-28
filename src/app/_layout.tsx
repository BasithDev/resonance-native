import '../global.css';
import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet } from 'react-native';
import { AudioProvider } from '../context/AudioContext';
import { MiniPlayer } from '../components/MiniPlayer';
import { FullPlayerModal } from '../components/FullPlayerModal';
import { ServerConfigModal } from '../components/ServerConfigModal';
import { Theme } from '../constants/theme';

export default function RootLayout() {
  return (
    <AudioProvider>
      <View style={styles.container}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Theme.colors.background } }}>
          <Stack.Screen name="(tabs)" />
        </Stack>
        <MiniPlayer />
        <FullPlayerModal />
        <ServerConfigModal />
      </View>
    </AudioProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
});
