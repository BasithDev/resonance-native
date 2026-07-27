import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../context/AudioContext';
import { CoverArt } from './CoverArt';
import { Theme } from '../constants/theme';
import { SongItem } from './SongItem';

const { width } = Dimensions.get('window');
const ARTWORK_SIZE = width * 0.72;

function formatTime(sec?: number) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function FullPlayerModal() {
  const {
    playerTrack,
    isPlaying,
    isAudioLoading,
    isPlayerOpen,
    setIsPlayerOpen,
    progress,
    currentTime,
    durationSec,
    repeatMode,
    shuffleOn,
    queue,
    queueIndex,
    togglePlayPause,
    playNext,
    playPrev,
    seekTo,
    seekBy,
    cycleRepeatMode,
    toggleShuffle,
    selectQueueIndex,
  } = useAudio();

  const [activeTab, setActiveTab] = useState<'player' | 'queue'>('player');

  if (!playerTrack) return null;

  return (
    <Modal
      visible={isPlayerOpen}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setIsPlayerOpen(false)}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setIsPlayerOpen(false)} style={styles.headerBtn}>
            <Ionicons name="chevron-down" size={28} color={Theme.colors.onSurface} />
          </TouchableOpacity>

          <View style={styles.tabToggleContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'player' && styles.tabBtnActive]}
              onPress={() => setActiveTab('player')}
            >
              <Text style={[styles.tabText, activeTab === 'player' && styles.tabTextActive]}>
                Playing
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'queue' && styles.tabBtnActive]}
              onPress={() => setActiveTab('queue')}
            >
              <Text style={[styles.tabText, activeTab === 'queue' && styles.tabTextActive]}>
                Queue ({queue.length})
              </Text>
            </TouchableOpacity>
          </View>

          <View style={{ width: 28 }} />
        </View>

        {activeTab === 'player' ? (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Artwork Card */}
            <View style={styles.artworkWrapper}>
              <View style={styles.artworkGlow} />
              <CoverArt url={playerTrack.thumbnailUrl} size={ARTWORK_SIZE} borderRadius={20} />
            </View>

            {/* Track Info */}
            <View style={styles.trackDetails}>
              <Text style={styles.title} numberOfLines={2}>
                {playerTrack.title}
              </Text>
              <Text style={styles.channel} numberOfLines={1}>
                {playerTrack.channel || 'Unknown Channel'}
              </Text>
            </View>

            {/* Scrubber / Progress Bar */}
            <View style={styles.progressContainer}>
              <TouchableOpacity
                activeOpacity={1}
                style={styles.progressBarTrack}
                onPress={(e) => {
                  const x = e.nativeEvent.locationX;
                  const barWidth = width - Theme.spacing.lg * 2;
                  const pct = Math.max(0, Math.min(1, x / barWidth));
                  seekTo(pct);
                }}
              >
                <View
                  style={[styles.progressBarFill, { width: `${Math.min(100, progress * 100)}%` }]}
                />
              </TouchableOpacity>
              <View style={styles.timeRow}>
                <Text style={styles.timeText}>{formatTime(currentTime)}</Text>
                <Text style={styles.timeText}>{formatTime(durationSec)}</Text>
              </View>
            </View>

            {/* Main Controls */}
            <View style={styles.controlsRow}>
              <TouchableOpacity onPress={toggleShuffle} style={styles.iconOptionBtn}>
                <Ionicons
                  name="shuffle"
                  size={24}
                  color={shuffleOn ? Theme.colors.primary : Theme.colors.subtext}
                />
              </TouchableOpacity>

              <TouchableOpacity onPress={playPrev} style={styles.iconControlBtn}>
                <Ionicons name="play-skip-back" size={32} color={Theme.colors.onSurface} />
              </TouchableOpacity>

              <TouchableOpacity onPress={togglePlayPause} style={styles.playPauseCircle}>
                {isAudioLoading ? (
                  <ActivityIndicator size="large" color="#ffffff" />
                ) : (
                  <Ionicons
                    name={isPlaying ? 'pause' : 'play'}
                    size={36}
                    color="#ffffff"
                    style={{ marginLeft: isPlaying ? 0 : 4 }}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={playNext} style={styles.iconControlBtn}>
                <Ionicons name="play-skip-forward" size={32} color={Theme.colors.onSurface} />
              </TouchableOpacity>

              <TouchableOpacity onPress={cycleRepeatMode} style={styles.iconOptionBtn}>
                <Ionicons
                  name={repeatMode === 'one' ? 'repeat' : 'repeat'}
                  size={24}
                  color={repeatMode !== 'off' ? Theme.colors.primary : Theme.colors.subtext}
                />
                {repeatMode === 'one' && <Text style={styles.repeatBadge}>1</Text>}
              </TouchableOpacity>
            </View>

            {/* Jump -10s / +10s Seek Shortcuts */}
            <View style={styles.seekShortcutsRow}>
              <TouchableOpacity style={styles.shortcutBtn} onPress={() => seekBy(-10)}>
                <Ionicons name="refresh" size={16} color={Theme.colors.subtext} />
                <Text style={styles.shortcutText}>-10s</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shortcutBtn} onPress={() => seekBy(10)}>
                <Ionicons name="reload" size={16} color={Theme.colors.subtext} />
                <Text style={styles.shortcutText}>+10s</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.queueContent}>
            <Text style={styles.queueHeading}>Up Next</Text>
            {queue.map((t, index) => (
              <SongItem
                key={`${t.id || t.youtubeId}-${index}`}
                track={t}
                isCurrent={index === queueIndex}
                isPlaying={isPlaying && index === queueIndex}
                onPress={() => selectQueueIndex(index)}
              />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.sm,
  },
  headerBtn: {
    padding: 6,
  },
  tabToggleContainer: {
    flexDirection: 'row',
    backgroundColor: Theme.colors.surfaceContainer,
    borderRadius: Theme.borderRadius.full,
    padding: 3,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Theme.borderRadius.full,
  },
  tabBtnActive: {
    backgroundColor: Theme.colors.primary,
  },
  tabText: {
    color: Theme.colors.subtext,
    fontSize: 13,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.lg,
    paddingBottom: 40,
  },
  artworkWrapper: {
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  artworkGlow: {
    position: 'absolute',
    width: ARTWORK_SIZE * 0.9,
    height: ARTWORK_SIZE * 0.9,
    borderRadius: ARTWORK_SIZE,
    backgroundColor: Theme.colors.primary,
    opacity: 0.15,
  },
  trackDetails: {
    width: '100%',
    alignItems: 'center',
    marginBottom: Theme.spacing.lg,
  },
  title: {
    color: Theme.colors.onSurface,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  channel: {
    color: Theme.colors.subtext,
    fontSize: 15,
    fontWeight: '500',
  },
  progressContainer: {
    width: '100%',
    marginVertical: Theme.spacing.md,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: Theme.colors.surfaceContainerHigh,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Theme.colors.primary,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  timeText: {
    color: Theme.colors.subtext,
    fontSize: 12,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: Theme.spacing.md,
  },
  iconOptionBtn: {
    padding: 10,
    position: 'relative',
  },
  repeatBadge: {
    position: 'absolute',
    top: 6,
    right: 4,
    fontSize: 10,
    fontWeight: 'bold',
    color: Theme.colors.primary,
  },
  iconControlBtn: {
    padding: 10,
  },
  playPauseCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seekShortcutsRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: Theme.spacing.xl,
  },
  shortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Theme.colors.surfaceContainer,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Theme.borderRadius.full,
  },
  shortcutText: {
    color: Theme.colors.subtext,
    fontSize: 12,
    fontWeight: '600',
  },
  queueContent: {
    padding: Theme.spacing.lg,
  },
  queueHeading: {
    color: Theme.colors.onSurface,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: Theme.spacing.md,
  },
});
