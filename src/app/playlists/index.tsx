// Playlists (mockup screen 3): grid, + to create, long-press to rename / delete.
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GRID_GAP, openPlaylist, PlaylistCard, useGridCellWidth } from '@/components/PlaylistCard';
import { usePlaylistActions } from '@/components/PlaylistActions';
import { PressableScale } from '@/components/PressableScale';
import { useLibrary } from '@/library/useLibrary';
import { runSuperShuffle } from '@/player/superShuffle';
import { colors, font, layout, radii } from '@/theme/tokens';

export default function PlaylistsScreen() {
  const insets = useSafeAreaInsets();
  const { playlists } = useLibrary();
  const cellWidth = useGridCellWidth();
  const actions = usePlaylistActions({ onCreated: openPlaylist });

  return (
    <View style={[styles.root, { paddingTop: insets.top + 6 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.h1}>Playlists</Text>
        <PressableScale onPress={actions.create} style={styles.add} accessibilityRole="button" accessibilityLabel="New playlist">
          <MaterialIcons name="add" size={22} color={colors.onPrimary} />
        </PressableScale>
      </View>

      <FlatList
        data={playlists}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={{ paddingBottom: layout.miniPlayer + 12 + insets.bottom }}
        ListHeaderComponent={
          <PressableScale onPress={() => void runSuperShuffle()} style={styles.superBtn} accessibilityRole="button">
            <MaterialIcons name="all-inclusive" size={18} color={colors.primary} />
            <Text style={styles.superText}>Super shuffle</Text>
            <Text style={styles.superHint}>every playlist, no repeats</Text>
          </PressableScale>
        }
        renderItem={({ item, index }) => (
          <Animated.View style={{ width: cellWidth }} entering={FadeInDown.delay(Math.min(index, 12) * 30)}>
            <PlaylistCard
              playlist={item}
              variant="grid"
              onPress={() => openPlaylist(item)}
              onLongPress={() => actions.openOptions(item)}
            />
          </Animated.View>
        )}
      />
      {actions.dialog}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingBottom: 6 },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  h1: { flex: 1, color: colors.text, fontFamily: font.bold, fontSize: 26, letterSpacing: -0.4 },
  add: {
    width: 38, height: 38, borderRadius: 19, marginRight: 8, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  superBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 6, marginBottom: 14,
    height: 44, paddingHorizontal: 14, borderRadius: radii.md, backgroundColor: colors.s2,
  },
  superText: { color: colors.text, fontFamily: font.bold, fontSize: 14 },
  superHint: { color: colors.muted, fontFamily: font.regular, fontSize: 12 },
  gridRow: { gap: GRID_GAP, paddingHorizontal: 16, marginBottom: 14 },
});
