// Hidden developer screen (resonance://dev, or long-press the Settings title) for
// exercising the on-device yt-dlp module by hand.
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, radii } from '@/theme/tokens';
import * as yt from '@/youtube/client';

// App-private storage; the real downloads directory arrives with the download queue task.
const DEST_DIR = '/data/data/com.basith.resonance/files/dev-downloads';
const JOB_ID = 'dev-job';

export default function DevScreen() {
  const [query, setQuery] = useState('aane wala star');
  const [videoId, setVideoId] = useState('eIeIkZ5Li88');
  const [log, setLog] = useState<string[]>([]);
  const lastPercent = useRef(-1);

  const print = (line: string) =>
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${line}`, ...l].slice(0, 200));

  useEffect(() => {
    const sub = yt.addProgressListener((e) => {
      // Log every 10% so the list stays readable.
      if (e.percent === 100 || e.percent - lastPercent.current >= 10) {
        lastPercent.current = e.percent;
        print(`progress ${e.jobId} ${e.percent}% eta ${e.etaSec}s`);
      }
    });
    return () => sub.remove();
  }, []);

  const call = (label: string, fn: () => Promise<unknown>) => async () => {
    print(`${label} …`);
    const t0 = Date.now();
    try {
      const res = await fn();
      print(`${label} OK (${Date.now() - t0} ms): ${summarize(res)}`);
    } catch (e) {
      const err = e as yt.YoutubeError;
      print(`${label} FAILED [${err.kind ?? '?'}] ${err.message} :: ${String((err.cause as Error)?.message ?? '')}`);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 16, gap: 8 }}>
        <Text style={{ color: colors.text, fontFamily: font.bold, fontSize: 20 }}>yt-dlp dev</Text>
        <Field value={query} onChangeText={setQuery} placeholder="search query" />
        <Field value={videoId} onChangeText={setVideoId} placeholder="video id" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Btn label="search" onPress={call('search', () => yt.search(query))} />
          <Btn label="videoInfo" onPress={call('videoInfo', () => yt.videoInfo(videoId))} />
          <Btn label="playlist" onPress={call('playlistEntries', () => yt.playlistEntries(query))} />
          <Btn label="resolveStream" onPress={call('resolveStream', () => yt.resolveStream(videoId))} />
          <Btn
            label="download"
            onPress={call('download', () => {
              lastPercent.current = -1;
              return yt.download(JOB_ID, videoId, DEST_DIR);
            })}
          />
          <Btn label="cancel" onPress={() => { yt.cancel(JOB_ID); print('cancel sent'); }} />
          <Btn label="version" onPress={call('version', () => yt.version())} />
          <Btn label="update" onPress={call('update', () => yt.update())} />
          <Btn label="clear log" onPress={() => setLog([])} />
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 4 }}>
        {log.map((line, i) => (
          <Text key={i} selectable style={{ color: colors.muted, fontFamily: 'monospace', fontSize: 12 }}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function summarize(res: unknown): string {
  if (Array.isArray(res)) {
    return `${res.length} items; first: ${JSON.stringify(res[0])}`;
  }
  return JSON.stringify(res);
}

function Field(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      placeholderTextColor={colors.muted}
      autoCapitalize="none"
      style={{
        backgroundColor: colors.s2,
        color: colors.text,
        borderRadius: radii.md,
        paddingHorizontal: 12,
        paddingVertical: 8,
        fontFamily: font.regular,
      }}
    />
  );
}

function Btn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: pressed ? colors.s4 : colors.s3,
        borderRadius: radii.pill,
        paddingHorizontal: 14,
        paddingVertical: 8,
      })}>
      <Text style={{ color: colors.primary, fontFamily: font.medium }}>{label}</Text>
    </Pressable>
  );
}
