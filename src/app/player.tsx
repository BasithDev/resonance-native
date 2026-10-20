// Now Playing (mockup screen 5). A transparent modal route: every animation
// is ours. On open the artwork flies out of the mini-player pill, the blurred
// backdrop fades in and the controls rise; swipe down (or back) reverses it.
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, interpolate, measure, useAnimatedRef, useAnimatedStyle, useSharedValue, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { ArtworkBackdrop } from '@/components/ArtworkBackdrop';
import { miniArt } from '@/components/MiniPlayer';
import { PlayPauseIcon } from '@/components/PlayPauseIcon';
import { QueueSheet } from '@/components/QueueSheet';
import { SleepChip, SleepSheet } from '@/components/SleepSheet';
import { SongMenu } from '@/components/SongMenu';
import { showToast } from '@/components/Toast';
import { WaveformProgress } from '@/components/WaveformProgress';
import { toggleLikeSong, useIsLiked } from '@/library/actions';
import { useConnectivity } from '@/net/connectivity';
import { artworkUri, selectCurrent, usePlayer } from '@/player/store';
import { colors, font, radii } from '@/theme/tokens';

const OPEN_MS = 380;
const CLOSE_MS = 280;

function IconButton({
  name, size = 28, color = colors.text, onPress, label, dim = false,
}: {
  name: React.ComponentProps<typeof MaterialIcons>['name'];
  size?: number;
  color?: string;
  onPress: () => void;
  label: string;
  dim?: boolean;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={label} style={styles.iconButton}>
      <MaterialIcons name={name} size={size} color={color} style={dim ? { opacity: 0.6 } : undefined} />
    </Pressable>
  );
}

export default function PlayerScreen() {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const song = usePlayer(selectCurrent);
  const status = usePlayer((s) => s.status);
  const shuffle = usePlayer((s) => s.queue?.shuffle ?? false);
  const repeat = usePlayer((s) => s.queue?.repeat ?? 'off');
  const { togglePlay, next, previous, seek, toggleShuffle, cycleRepeat } = usePlayer.getState();
  const { online } = useConnectivity();
  const [queueOpen, setQueueOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const source = usePlayer((s) => s.source);
  const liked = useIsLiked(song?.youtubeId ?? null);

  const artSize = Math.min(W - 64, H * 0.42);
  const artRef = useAnimatedRef<Animated.View>();
  const progress = useSharedValue(0); // 0 = in the pill, 1 = open
  const dragY = useSharedValue(0);
  const swipeX = useSharedValue(0);
  const from = useSharedValue({ dx: 0, dy: H * 0.4, scale: 0.4 });
  const measured = useSharedValue(0); // hide the artwork until its flight path is known
  const closing = useSharedValue(false);

  const close = useCallback(() => {
    if (closing.get()) return;
    closing.set(true);
    const back = () => router.back();
    dragY.set(withTiming(0, { duration: CLOSE_MS }));
    progress.set(withTiming(0, { duration: CLOSE_MS, easing: Easing.in(Easing.cubic) }, (done) => {
      if (done) scheduleOnRN(back);
    }));
  }, [closing, dragY, progress]);

  // Nothing left to play (e.g. the song was removed): leave.
  useEffect(() => {
    if (!song) close();
  }, [song, close]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (queueOpen) setQueueOpen(false);
      else close();
      return true;
    });
    return () => sub.remove();
  }, [queueOpen, close]);

  /** Once the artwork's final place is known, start the flight from the pill. */
  const onArtLayout = () => {
    const r = miniArt.rect;
    scheduleOnUI(() => {
      if (progress.get() !== 0 || closing.get()) return;
      const m = measure(artRef);
      if (r && m && m.width > 0) {
        from.set({
          dx: r.x + r.width / 2 - (m.pageX + m.width / 2),
          dy: r.y + r.height / 2 - (m.pageY + m.height / 2),
          scale: r.width / m.width,
        });
      }
      measured.set(1);
      progress.set(withTiming(1, { duration: OPEN_MS, easing: Easing.out(Easing.cubic) }));
    });
  };

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.get() }] }));
  const chromeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.4, 1], [0, 1], 'clamp'),
    transform: [{ translateY: (1 - progress.get()) * 48 }],
  }));
  const artStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const f = from.get();
    return {
      borderRadius: interpolate(p, [0, 1], [9 / Math.max(f.scale, 0.01), radii.xl]),
      transform: [
        { translateX: f.dx * (1 - p) + swipeX.get() },
        { translateY: f.dy * (1 - p) },
        { scale: f.scale + (1 - f.scale) * p },
        { rotate: `${swipeX.get() / 40}deg` },
      ],
      opacity: measured.get() * interpolate(Math.abs(swipeX.get()), [0, W], [1, 0.3]),
    };
  });

  // Swipe down closes; swipe up opens the queue.
  const vertical = Gesture.Pan()
    .activeOffsetY([-14, 14])
    .failOffsetX([-20, 20])
    .onUpdate((e) => {
      dragY.set(Math.max(0, e.translationY));
    })
    .onEnd((e) => {
      if (e.translationY > 140 || e.velocityY > 900) scheduleOnRN(close);
      else {
        dragY.set(withSpring(0, { damping: 20 }));
        if (e.translationY < -60 || e.velocityY < -900) scheduleOnRN(setQueueOpen, true);
      }
    });

  // Swipe the artwork left/right to skip.
  const skip = (dir: 1 | -1) => (dir === 1 ? next() : previous());
  const artSwipe = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      swipeX.set(e.translationX);
    })
    .onEnd((e) => {
      const dir = e.translationX < -90 || e.velocityX < -900 ? 1 : e.translationX > 90 || e.velocityX > 900 ? -1 : 0;
      if (dir === 0) {
        swipeX.set(withSpring(0, { damping: 18 }));
        return;
      }
      swipeX.set(withTiming(-dir * W, { duration: 160 }, () => {
        scheduleOnRN(skip, dir);
        swipeX.set(dir * W * 0.6);
        swipeX.set(withSpring(0, { damping: 18 }));
      }));
    });

  if (!song) return <View style={styles.screen} />;
  const art = artworkUri(song);
  const downloaded = song.download === 'done';

  return (
    <View style={styles.screen}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.base, backdropStyle]}>
        <ArtworkBackdrop uri={art} />
      </Animated.View>

      <GestureDetector gesture={vertical}>
        <Animated.View style={[styles.content, { paddingTop: insets.top + 6, paddingBottom: insets.bottom + 16 }, sheetStyle]}>
          <Animated.View style={[styles.header, chromeStyle]}>
            <IconButton name="keyboard-arrow-down" size={30} onPress={close} label="Close player" />
            <Text style={styles.headerTitle} numberOfLines={1}>
              {source ? `From ${source.label}` : 'Now playing'}
            </Text>
            <IconButton name="more-horiz" size={26} onPress={() => setMenuOpen(true)} label="Song options" />
          </Animated.View>

          <View style={styles.artArea}>
            <GestureDetector gesture={artSwipe}>
              <Animated.View
                ref={artRef}
                collapsable={false}
                onLayout={onArtLayout}
                style={[styles.art, { width: artSize, height: artSize }, artStyle]}>
                <Image source={art} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} />
              </Animated.View>
            </GestureDetector>
          </View>

          <Animated.View style={chromeStyle}>
            <View style={styles.titles}>
              <View style={styles.titleText}>
                <Text style={styles.title} numberOfLines={1}>
                  {song.title}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {song.channel ?? 'Unknown'}
                  {downloaded ? <Text style={{ color: colors.mint }}> · ⬇ offline</Text> : null}
                  {!downloaded && !online ? ' · needs internet' : null}
                </Text>
              </View>
              <IconButton
                name={liked ? 'favorite' : 'favorite-border'}
                size={26}
                color={liked ? colors.primary : colors.text}
                onPress={() => void toggleLikeSong(song).catch(() => showToast("Couldn't update Liked songs"))}
                label={liked ? 'Unlike' : 'Like'}
              />
            </View>

            <View style={styles.progress}>
              <WaveformProgress
                seed={song.youtubeId}
                positionSec={status.positionSec}
                durationSec={status.durationSec || song.durationSec || 0}
                onSeek={seek}
              />
            </View>

            <View style={styles.controls}>
              <IconButton
                name="shuffle"
                size={24}
                color={shuffle ? colors.primary : colors.text}
                dim={!shuffle}
                onPress={toggleShuffle}
                label={shuffle ? 'Shuffle on' : 'Shuffle off'}
              />
              <IconButton name="skip-previous" size={36} onPress={previous} label="Previous" />
              <Pressable
                onPress={togglePlay}
                accessibilityRole="button"
                accessibilityLabel={status.playing ? 'Pause' : 'Play'}
                style={styles.play}>
                <PlayPauseIcon playing={status.playing} size={34} color={colors.onPrimary} />
              </Pressable>
              <IconButton name="skip-next" size={36} onPress={next} label="Next" />
              <IconButton
                name={repeat === 'one' ? 'repeat-one' : 'repeat'}
                size={24}
                color={repeat === 'off' ? colors.text : colors.primary}
                dim={repeat === 'off'}
                onPress={cycleRepeat}
                label={`Repeat ${repeat}`}
              />
            </View>

            <View style={styles.sleep}>
              <SleepChip onPress={() => setSleepOpen(true)} />
            </View>

            <Pressable style={styles.queueButton} onPress={() => setQueueOpen(true)} accessibilityRole="button">
              <MaterialIcons name="keyboard-arrow-up" size={18} color={colors.muted} />
              <Text style={styles.queueText}>Queue</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      <SleepSheet open={sleepOpen} onClose={() => setSleepOpen(false)} />
      <QueueSheet open={queueOpen} onClose={() => setQueueOpen(false)} />
      <SongMenu song={menuOpen ? song : null} onClose={() => setMenuOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  base: { backgroundColor: colors.bg },
  content: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  headerTitle: { flex: 1, textAlign: 'center', color: colors.text, fontFamily: font.semibold, fontSize: 13, opacity: 0.85 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  artArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  art: {
    overflow: 'hidden',
    backgroundColor: colors.s3,
    elevation: 16,
  },
  titles: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 24, paddingRight: 14 },
  titleText: { flex: 1, minWidth: 0 },
  title: { color: colors.text, fontFamily: font.bold, fontSize: 21, letterSpacing: -0.3 },
  subtitle: { color: colors.muted, fontFamily: font.regular, fontSize: 13, marginTop: 2 },
  progress: { paddingHorizontal: 24, paddingTop: 16 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 12, paddingTop: 10 },
  play: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sleep: { paddingTop: 14 },
  queueButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 18 },
  queueText: { color: colors.muted, fontFamily: font.medium, fontSize: 12 },
});
