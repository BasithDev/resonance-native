import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CoverArt } from './CoverArt';
import { Track } from '../context/AudioContext';

interface SongItemProps {
  track: Track;
  isPlaying?: boolean;
  isCurrent?: boolean;
  onPress: () => void;
  onMorePress?: () => void;
  onAddPress?: () => void;
  isAddLoading?: boolean;
}

function formatDuration(sec?: number) {
  if (!sec || isNaN(sec)) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function SongItem({
  track,
  isPlaying,
  isCurrent,
  onPress,
  onMorePress,
  onAddPress,
  isAddLoading,
}: SongItemProps) {
  return (
    <TouchableOpacity
      className={`flex-row items-center p-2.5 rounded-xl mb-2 border ${
        isCurrent
          ? 'bg-surfaceContainerHigh border-primary/40'
          : 'bg-surfaceContainer border-border'
      }`}
      style={{
        backgroundColor: isCurrent ? '#2A2A2A' : '#242424',
        borderColor: isCurrent ? 'rgba(255, 89, 89, 0.4)' : '#2C2C2C',
      }}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <CoverArt url={track.thumbnailUrl} size={50} borderRadius={10} />

      <View className="flex-1 ml-3 justify-center">
        <Text
          numberOfLines={1}
          className={`font-bold text-[15px] mb-0.5 tracking-tight ${
            isCurrent ? 'text-primary' : 'text-white'
          }`}
          style={{ color: isCurrent ? '#FF5959' : '#ffffff' }}
        >
          {track.title}
        </Text>
        <Text
          numberOfLines={1}
          className="text-subtext text-[13px] font-medium"
          style={{ color: '#A0A0A0' }}
        >
          {track.channel || 'Unknown Artist'} • {formatDuration(track.durationSec)}
        </Text>
      </View>

      {isCurrent && (
        <View
          className="px-2 py-1 rounded-lg bg-primary/15 mr-1"
          style={{ backgroundColor: 'rgba(255, 89, 89, 0.15)' }}
        >
          <Ionicons
            name={isPlaying ? 'stats-chart' : 'pause'}
            size={16}
            color="#FF5959"
          />
        </View>
      )}

      {onAddPress && (
        <TouchableOpacity
          onPress={(e) => {
            e.stopPropagation();
            onAddPress();
          }}
          className="w-8 h-8 rounded-full bg-primary items-center justify-center mr-1"
          style={{ backgroundColor: '#FF5959' }}
          disabled={isAddLoading}
          activeOpacity={0.8}
        >
          {isAddLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="add" size={20} color="#ffffff" />
          )}
        </TouchableOpacity>
      )}

      {onMorePress && (
        <TouchableOpacity onPress={onMorePress} className="p-1.5">
          <Ionicons name="ellipsis-vertical" size={18} color="#A0A0A0" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
