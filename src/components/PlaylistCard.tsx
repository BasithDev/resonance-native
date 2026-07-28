import React from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PlaylistCardProps {
  playlist: {
    id: string;
    name: string;
    songCount?: number;
    songs?: any[];
    coverUrl?: string;
  };
  onPress: () => void;
  onPlayPress?: () => void;
}

function formatTotalRuntime(songs?: any[]): string {
  if (!songs || songs.length === 0) return '';
  const totalSec = songs.reduce((sum, s) => sum + (s.durationSec || s.duration_sec || 0), 0);
  if (totalSec <= 0) return '';

  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);

  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${mins} min${mins !== 1 ? 's' : ''}`;
}

export function PlaylistCard({ playlist, onPress, onPlayPress }: PlaylistCardProps) {
  const count = playlist.songCount ?? playlist.songs?.length ?? 0;
  const firstWithThumb = playlist.songs?.find((s: any) => s.thumbnailUrl || s.coverUrl);
  const coverUrl =
    playlist.coverUrl ||
    firstWithThumb?.thumbnailUrl ||
    firstWithThumb?.coverUrl ||
    null;
  const isAllSongs = playlist.id === 'all-songs';
  const totalRuntime = formatTotalRuntime(playlist.songs);

  return (
    <TouchableOpacity
      className={`flex-1 p-2.5 rounded-2xl border mx-1 mb-3 ${
        isAllSongs
          ? 'bg-surfaceContainerHigh border-primary/40'
          : 'bg-surfaceContainer border-border'
      }`}
      onPress={onPress}
      activeOpacity={0.85}
    >
      {/* Square Cover Artwork Box */}
      <View className="w-full aspect-square rounded-xl overflow-hidden relative bg-surfaceContainerHighest">
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} className="w-full h-full" resizeMode="cover" />
        ) : isAllSongs ? (
          <View className="w-full h-full bg-primary items-center justify-center">
            <Ionicons name="musical-notes" size={44} color="#ffffff" />
          </View>
        ) : (
          <View className="w-full h-full items-center justify-center bg-surfaceContainerHigh">
            <Ionicons name="albums-outline" size={40} color="#FF5959" />
          </View>
        )}

        {/* Floating Circular Play FAB Button */}
        {onPlayPress && (
          <TouchableOpacity
            className="absolute bottom-2 right-2 w-9.5 h-9.5 rounded-full bg-primary items-center justify-center shadow-lg"
            onPress={(e) => {
              e.stopPropagation();
              onPlayPress();
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="play" size={18} color="#ffffff" />
          </TouchableOpacity>
        )}
      </View>

      {/* Playlist Metadata Info */}
      <View className="mt-2.5 px-0.5">
        <Text className="text-white font-extrabold text-[15px] tracking-tight mb-0.5" numberOfLines={1}>
          {playlist.name}
        </Text>
        <Text className="text-subtext text-[12px] font-semibold" numberOfLines={1}>
          {count} {count === 1 ? 'track' : 'tracks'}{totalRuntime ? ` • ${totalRuntime}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
