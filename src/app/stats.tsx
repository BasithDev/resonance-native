// Listening stats (mockup screen 14): period cards, most played, song of the day.
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDb } from '@/db/instance';
import { libraryEvents } from '@/library/events';
import { listSongs } from '@/library/repo';
import { artworkUri, usePlayer } from '@/player/store';
import { formatDuration } from '@/stats/format';
import { getStats, type Stats } from '@/stats/queries';
import { colors, font, layout, radii } from '@/theme/tokens';

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<Stats | null>(null);
  const playing = usePlayer((s) => s.status.playing);

  useEffect(() => {
    let alive = true;
    const load = () =>
      getDb()
        .then((db) => getStats(db, Date.now()))
        .then((s) => alive && setStats(s))
        .catch(() => {});
    load();
    const off = libraryEvents.subscribe(load);
    // Refresh while listening so the numbers move.
    const timer = playing ? setInterval(load, 15_000) : null;
    return () => {
      alive = false;
      off();
      if (timer) clearInterval(timer);
    };
  }, [playing]);

  const playSong = async (youtubeId: string) => {
    const songs = await listSongs(await getDb());
    const i = songs.findIndex((s) => s.youtubeId === youtubeId);
    if (i >= 0) usePlayer.getState().playSongs(songs, i);
  };

  const periods = stats
    ? [
        ['Today', stats.todaySec],
        ['Week', stats.weekSec],
        ['Month', stats.monthSec],
        ['Year', stats.yearSec],
        ['All time', stats.lifetimeSec],
      ] as const
    : [];
  const sotd = stats?.songOfTheDay ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Listening stats</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: layout.miniPlayer + 12 + insets.bottom }}>
        <View style={styles.cards}>
          {periods.map(([label, sec], i) => (
            <View key={label} style={[styles.card, i === 0 && styles.cardWide]}>
              <Text style={styles.cardLabel}>{label}</Text>
              <Text style={[styles.cardValue, i === 0 && styles.cardValueBig]}>{formatDuration(sec)}</Text>
            </View>
          ))}
        </View>

        {sotd && (
          <>
            <Text style={styles.section}>Song of the day</Text>
            <View style={styles.sotd}>
              <Image source={artworkUri(sotd)} style={styles.art} contentFit="cover" />
              <View style={styles.rowText}>
                <Text style={styles.songTitle} numberOfLines={1}>{sotd.title}</Text>
                <Text style={styles.songSub} numberOfLines={1}>{sotd.channel ?? ''}</Text>
              </View>
              <Pressable
                onPress={() => playSong(sotd.youtubeId)}
                accessibilityRole="button"
                accessibilityLabel={`Play ${sotd.title}`}
                style={styles.play}
              >
                <MaterialIcons name="play-arrow" size={28} color={colors.onPrimary} />
              </Pressable>
            </View>
          </>
        )}

        <Text style={styles.section}>Most played</Text>
        {stats && stats.mostPlayed.length === 0 && <Text style={styles.songSub}>Nothing played yet.</Text>}
        {stats?.mostPlayed.map((s, i) => (
          <Pressable key={s.youtubeId} onPress={() => playSong(s.youtubeId)} style={styles.row} accessibilityRole="button">
            <Text style={styles.rank}>{i + 1}</Text>
            <Image source={artworkUri(s)} style={styles.rowArt} contentFit="cover" />
            <View style={styles.rowText}>
              <Text style={styles.songTitle} numberOfLines={1}>{s.title}</Text>
              <Text style={styles.songSub} numberOfLines={1}>
                {s.playCount} {s.playCount === 1 ? 'play' : 'plays'} · {formatDuration(s.listenedSec)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, height: 56 },
  title: { color: colors.text, fontFamily: font.semibold, fontSize: 20 },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: '30%', backgroundColor: colors.s2, borderRadius: radii.lg, padding: 14 },
  cardWide: { flexBasis: '100%', backgroundColor: colors.s3 },
  cardLabel: { color: colors.muted, fontFamily: font.medium, fontSize: 12 },
  cardValue: { color: colors.text, fontFamily: font.bold, fontSize: 18, marginTop: 4 },
  cardValueBig: { color: colors.primary, fontSize: 32 },
  section: { color: colors.text, fontFamily: font.semibold, fontSize: 16, marginTop: 24, marginBottom: 10 },
  sotd: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.s2, borderRadius: radii.lg, padding: 12 },
  art: { width: 64, height: 64, borderRadius: radii.md, backgroundColor: colors.s3 },
  play: { width: 44, height: 44, borderRadius: radii.pill, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rank: { width: 20, color: colors.muted, fontFamily: font.semibold, fontSize: 14, textAlign: 'center' },
  rowArt: { width: 44, height: 44, borderRadius: radii.sm, backgroundColor: colors.s3 },
  rowText: { flex: 1 },
  songTitle: { color: colors.text, fontFamily: font.medium, fontSize: 15 },
  songSub: { color: colors.muted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
});
