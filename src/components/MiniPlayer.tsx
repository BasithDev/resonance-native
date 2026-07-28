import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAudio } from '../context/AudioContext';
import { CoverArt } from './CoverArt';

export function MiniPlayer() {
  const {
    playerTrack,
    isPlaying,
    isAudioLoading,
    progress,
    togglePlayPause,
    playNext,
    setIsPlayerOpen,
  } = useAudio();

  if (!playerTrack) return null;

  return (
    <TouchableOpacity
      className="absolute bottom-[84px] left-4 right-4 bg-surfaceContainerHigh rounded-2xl overflow-hidden border border-border shadow-lg elevation-8"
      activeOpacity={0.9}
      onPress={() => setIsPlayerOpen(true)}
    >
      {/* Top Progress Rail */}
      <View className="h-[3px] bg-surfaceContainerHighest w-full">
        <View className="h-[3px] bg-primary" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </View>

      <View className="flex-row items-center px-4 py-2">
        <CoverArt url={playerTrack.thumbnailUrl} size={42} borderRadius={8} />

        <View className="flex-1 ml-3 justify-center">
          <Text numberOfLines={1} className="text-white text-[14px] font-bold">
            {playerTrack.title}
          </Text>
          <Text numberOfLines={1} className="text-subtext text-[12px] mt-0.5">
            {playerTrack.channel || 'Unknown Artist'}
          </Text>
        </View>

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            className="p-1.5"
            onPress={(e) => {
              e.stopPropagation();
              togglePlayPause();
            }}
          >
            {isAudioLoading ? (
              <ActivityIndicator size="small" color="#FF5959" />
            ) : (
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={22}
                color="#ffffff"
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            className="p-1.5"
            onPress={(e) => {
              e.stopPropagation();
              playNext();
            }}
          >
            <Ionicons name="play-skip-forward" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}
