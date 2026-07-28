import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../context/AudioContext';
import { CoverArt } from './CoverArt';
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
    removeFromQueue,
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
      <SafeAreaView className="flex-1 bg-background">
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 py-2">
          <TouchableOpacity onPress={() => setIsPlayerOpen(false)} className="p-1.5">
            <Ionicons name="chevron-down" size={28} color="#ffffff" />
          </TouchableOpacity>

          <View className="flex-row bg-surfaceContainer rounded-full p-1">
            <TouchableOpacity
              className={`px-4 py-1.5 rounded-full ${activeTab === 'player' ? 'bg-primary' : ''}`}
              onPress={() => setActiveTab('player')}
            >
              <Text className={`text-[13px] font-semibold ${activeTab === 'player' ? 'text-white' : 'text-subtext'}`}>
                Playing
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              className={`px-4 py-1.5 rounded-full ${activeTab === 'queue' ? 'bg-primary' : ''}`}
              onPress={() => setActiveTab('queue')}
            >
              <Text className={`text-[13px] font-semibold ${activeTab === 'queue' ? 'text-white' : 'text-subtext'}`}>
                Queue ({queue.length})
              </Text>
            </TouchableOpacity>
          </View>

          <View className="w-7" />
        </View>

        {activeTab === 'player' ? (
          <ScrollView
            contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Artwork Card */}
            <View className="mt-5 mb-6 relative items-center justify-center">
              <View
                className="absolute rounded-full bg-primary opacity-15"
                style={{ width: ARTWORK_SIZE * 0.9, height: ARTWORK_SIZE * 0.9 }}
              />
              <CoverArt url={playerTrack.thumbnailUrl} size={ARTWORK_SIZE} borderRadius={20} />
            </View>

            {/* Track Info */}
            <View className="w-full items-center mb-5">
              <Text className="text-white text-[22px] font-extrabold text-center mb-1.5" numberOfLines={2}>
                {playerTrack.title}
              </Text>
              <Text className="text-subtext text-[15px] font-medium" numberOfLines={1}>
                {playerTrack.channel || 'Unknown Channel'}
              </Text>
            </View>

            {/* Scrubber / Progress Bar */}
            <View className="w-full my-3">
              <TouchableOpacity
                activeOpacity={1}
                className="h-1.5 bg-surfaceContainerHigh rounded-full w-full overflow-hidden"
                onPress={(e) => {
                  const x = e.nativeEvent.locationX;
                  const barWidth = width - 40;
                  const pct = Math.max(0, Math.min(1, x / barWidth));
                  seekTo(pct);
                }}
              >
                <View
                  className="h-full bg-primary"
                  style={{ width: `${Math.min(100, progress * 100)}%` }}
                />
              </TouchableOpacity>
              <View className="flex-row justify-between mt-2">
                <Text className="text-subtext text-[12px]">{formatTime(currentTime)}</Text>
                <Text className="text-subtext text-[12px]">{formatTime(durationSec)}</Text>
              </View>
            </View>

            {/* Main Controls */}
            <View className="flex-row items-center justify-between w-full mt-3">
              <TouchableOpacity onPress={toggleShuffle} className="p-2.5 relative">
                <Ionicons
                  name="shuffle"
                  size={24}
                  color={shuffleOn ? '#FF5959' : '#A0A0A0'}
                />
              </TouchableOpacity>

              <TouchableOpacity onPress={playPrev} className="p-2.5">
                <Ionicons name="play-skip-back" size={32} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity onPress={togglePlayPause} className="w-[68px] h-[68px] rounded-full bg-primary items-center justify-center">
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

              <TouchableOpacity onPress={playNext} className="p-2.5">
                <Ionicons name="play-skip-forward" size={32} color="#ffffff" />
              </TouchableOpacity>

              <TouchableOpacity onPress={cycleRepeatMode} className="p-2.5 relative">
                <Ionicons
                  name="repeat"
                  size={24}
                  color={repeatMode !== 'off' ? '#FF5959' : '#A0A0A0'}
                />
                {repeatMode === 'one' && (
                  <Text className="absolute top-1.5 right-1 text-[10px] font-bold color-primary">1</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Seek Shortcuts */}
            <View className="flex-row gap-5 mt-6">
              <TouchableOpacity className="flex-row items-center gap-1 bg-surfaceContainer px-4 py-2 rounded-full" onPress={() => seekBy(-10)}>
                <Ionicons name="refresh" size={16} color="#A0A0A0" />
                <Text className="text-subtext text-[12px] font-semibold">-10s</Text>
              </TouchableOpacity>
              <TouchableOpacity className="flex-row items-center gap-1 bg-surfaceContainer px-4 py-2 rounded-full" onPress={() => seekBy(10)}>
                <Ionicons name="reload" size={16} color="#A0A0A0" />
                <Text className="text-subtext text-[12px] font-semibold">+10s</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            <Text className="text-white text-[18px] font-bold mb-4">Up Next ({queue.length})</Text>
            {queue.map((t, index) => (
              <View key={`${t.id || t.youtubeId}-${index}`} className="flex-row items-center gap-2">
                <View className="flex-1">
                  <SongItem
                    track={t}
                    isCurrent={index === queueIndex}
                    isPlaying={isPlaying && index === queueIndex}
                    onPress={() => selectQueueIndex(index)}
                  />
                </View>
                {index !== queueIndex && (
                  <TouchableOpacity className="p-2" onPress={() => removeFromQueue(index)}>
                    <Ionicons name="close-circle-outline" size={22} color="#A0A0A0" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
