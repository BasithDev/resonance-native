// TEMPORARY hidden route (/engine-dev) for the owner's on-device engine test.
// Delete once the player UI drives the engine.
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { engine, type EngineStatus, type RemoteCommand } from '@/player/engine';
import { colors, font, radii } from '@/theme/tokens';

function Button({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{ backgroundColor: colors.s3, borderRadius: radii.md, paddingVertical: 10, paddingHorizontal: 14 }}>
      <Text style={{ color: colors.text, fontFamily: font.medium }}>{label}</Text>
    </Pressable>
  );
}

export default function EngineDevScreen() {
  const [uri, setUri] = useState('');
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [remoteLog, setRemoteLog] = useState<string[]>([]);

  useEffect(() => {
    const offStatus = engine.onStatus(setStatus);
    const offRemote = engine.onRemote((c: RemoteCommand) => {
      const label = typeof c === 'string' ? c : `seekTo ${c.seekTo.toFixed(1)}`;
      setRemoteLog((log) => [`${new Date().toLocaleTimeString()} ${label}`, ...log].slice(0, 20));
      // Act like the future store would for transport commands.
      if (c === 'play') engine.play();
      else if (c === 'pause') engine.pause();
      else if (typeof c === 'object') engine.seekTo(c.seekTo);
    });
    return () => {
      offStatus();
      offRemote();
    };
  }, []);

  const load = () =>
    engine.load(
      { uri: uri.trim(), title: 'Engine test', artist: 'Resonance', artworkUri: null },
      true,
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 20 }}>Engine test</Text>
        <Text style={{ color: colors.muted, fontFamily: font.regular }}>
          Paste a file:// URI or an https:// URL, then Load and play.
        </Text>
        <TextInput
          value={uri}
          onChangeText={setUri}
          placeholder="file:///... or https://..."
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          style={{
            color: colors.text,
            backgroundColor: colors.s1,
            borderRadius: radii.md,
            padding: 12,
            fontFamily: font.regular,
          }}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Button label="Load and play" onPress={load} />
          <Button label="Play" onPress={() => engine.play()} />
          <Button label="Pause" onPress={() => engine.pause()} />
          <Button label="-10 s" onPress={() => engine.seekTo(Math.max(0, (status?.positionSec ?? 0) - 10))} />
          <Button label="+10 s" onPress={() => engine.seekTo((status?.positionSec ?? 0) + 10)} />
        </View>
        <Text style={{ color: colors.text, fontFamily: font.regular }}>
          {status ? JSON.stringify(status, null, 2) : 'No status yet'}
        </Text>
        <Text style={{ color: colors.text, fontFamily: font.semibold }}>Remote commands</Text>
        {remoteLog.length === 0 ? (
          <Text style={{ color: colors.muted, fontFamily: font.regular }}>None yet</Text>
        ) : (
          remoteLog.map((line, i) => (
            <Text key={i} style={{ color: colors.mint, fontFamily: font.regular }}>
              {line}
            </Text>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
