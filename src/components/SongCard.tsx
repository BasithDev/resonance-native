import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Track } from '../context/AudioContext';
import { CoverArt } from './CoverArt';

interface SongCardProps {
  track: Track;
  isPlaying?: boolean;
  isCurrent?: boolean;
  onPress: () => void;
  onMorePress?: () => void;
}

function formatDuration(sec?: number) {
  if (!sec || isNaN(sec)) return '';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function SongCard({ track, isPlaying, isCurrent, onPress, onMorePress }: SongCardProps) {
  return (
    <TouchableOpacity
      className={`flex-1 p-2.5 rounded-2xl border mx-1 mb-2.5 relative ${
        isCurrent
          ? 'bg-surfaceContainerHigh border-primary/50'
          : 'bg-surfaceContainer border-border'
      }`}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View className="w-full aspect-square rounded-xl overflow-hidden items-center justify-center bg-surfaceContainerHighest relative">
        <CoverArt url={track.thumbnailUrl} size={140} borderRadius={14} />
        {isCurrent && (
          <View className="absolute inset-0 bg-primary/45 items-center justify-center">
            <Ionicons name={isPlaying ? 'stats-chart' : 'pause'} size={20} color="#ffffff" />
          </View>
        )}
      </View>

      <View className="mt-2">
        <Text
          numberOfLines={1}
          className={`font-bold text-[14px] mb-0.5 ${
            isCurrent ? 'text-primary' : 'text-white'
          }`}
        >
          {track.title}
        </Text>
        <Text numberOfLines={1} className="text-subtext text-[12px] font-medium">
          {track.channel || 'Unknown Artist'}
        </Text>
        {track.durationSec ? (
          <Text className="text-subtext text-[11px] mt-0.5">{formatDuration(track.durationSec)}</Text>
        ) : null}
      </View>

      {onMorePress && (
        <TouchableOpacity
          className="absolute top-3.5 right-3.5 bg-black/50 p-1.5 rounded-full"
          onPress={onMorePress}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color="#A0A0A0" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
