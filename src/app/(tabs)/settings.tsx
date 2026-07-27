import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../../context/AudioContext';
import { Theme } from '../../constants/theme';
import * as api from '../../services/api';

export default function SettingsScreen() {
  const { serverUrl, setIsServerModalOpen } = useAudio();

  async function handleExport() {
    try {
      const data = await api.exportLibrary();
      Alert.alert(
        'Library Exported',
        `Export file ready with ${data?.songs?.length || 0} tracks and ${data?.playlists?.length || 0} playlists!`
      );
    } catch (e: any) {
      Alert.alert('Export Error', e.message || 'Failed to export library');
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerSubtitle}>PREFERENCES & PORTABILITY</Text>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>

        {/* Server Connection Section */}
        <Text style={styles.sectionHeader}>SERVER CONNECTION</Text>
        <TouchableOpacity
          style={styles.card}
          onPress={() => setIsServerModalOpen(true)}
          activeOpacity={0.7}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="server-outline" size={22} color={Theme.colors.primary} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Backend Server URL</Text>
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {serverUrl}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Theme.colors.subtext} />
        </TouchableOpacity>

        {/* Data Portability Section */}
        <Text style={styles.sectionHeader}>PORTABILITY & BACKUPS</Text>
        <TouchableOpacity style={styles.card} onPress={handleExport} activeOpacity={0.7}>
          <View style={styles.iconCircle}>
            <Ionicons name="cloud-download-outline" size={22} color={Theme.colors.primary} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Export Full Library (JSON)</Text>
            <Text style={styles.cardSubtitle}>
              Backup all songs, playlists, and metadata into a portable JSON document.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Theme.colors.subtext} />
        </TouchableOpacity>

        {/* About App */}
        <Text style={styles.sectionHeader}>ABOUT</Text>
        <View style={styles.infoCard}>
          <View style={styles.appRow}>
            <View style={styles.logoBadge}>
              <Ionicons name="musical-notes" size={28} color={Theme.colors.primary} />
            </View>
            <View>
              <Text style={styles.appName}>Resonance Mobile</Text>
              <Text style={styles.appVersion}>Version 1.0.0 (Expo SDK 57)</Text>
            </View>
          </View>
          <Text style={styles.appDesc}>
            High-Performance YouTube Audio Player & Music Library for React Native.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  content: {
    padding: Theme.spacing.lg,
    paddingBottom: 140,
  },
  header: {
    marginBottom: Theme.spacing.lg,
  },
  headerSubtitle: {
    color: Theme.colors.primary,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  headerTitle: {
    color: Theme.colors.onSurface,
    fontSize: 26,
    fontWeight: '800',
  },
  sectionHeader: {
    color: Theme.colors.subtext,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginTop: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.colors.surfaceContainer,
    padding: Theme.spacing.md,
    borderRadius: Theme.borderRadius.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    marginLeft: Theme.spacing.md,
  },
  cardTitle: {
    color: Theme.colors.onSurface,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardSubtitle: {
    color: Theme.colors.subtext,
    fontSize: 12,
  },
  infoCard: {
    backgroundColor: Theme.colors.surfaceContainer,
    padding: Theme.spacing.lg,
    borderRadius: Theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: Theme.colors.border,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: Theme.spacing.md,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    color: Theme.colors.onSurface,
    fontSize: 17,
    fontWeight: '800',
  },
  appVersion: {
    color: Theme.colors.primary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  appDesc: {
    color: Theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
});
