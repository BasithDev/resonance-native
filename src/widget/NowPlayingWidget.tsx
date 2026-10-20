/**
 * The home-screen "Now playing" widget (screen 15): artwork, title and artist,
 * play/pause and next on the app's dark surface with a coral accent.
 *
 * The body always opens the app (the library handles OPEN_APP natively, so it
 * works with the app process dead). With nothing playing, the buttons open the
 * app too; otherwise they send TOGGLE_PLAY / NEXT to the task handler.
 */
import { FlexWidget, ImageWidget, type ImageWidgetSource, SvgWidget, TextWidget } from 'react-native-android-widget';

import { colors } from '../theme/tokens';
import type { NowPlaying } from './update';

const ICON = 40;
const ART = 48;

const svg = (path: string, fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="${fill}" d="${path}"/></svg>`;
const PLAY = 'M8 5v14l11-7z';
const PAUSE = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
const NEXT = 'M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z';
const NOTE = 'M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z';

export function NowPlayingWidget({ title, artist, artworkUri, playing }: NowPlaying) {
  const live = title != null;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel="Open Resonance"
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.s1,
        borderRadius: 22,
        paddingHorizontal: 12,
      }}
    >
      {artworkUri ? (
        // The native loader also decodes `file://` paths (offline art), which the TS type omits.
        <ImageWidget image={artworkUri as ImageWidgetSource} imageWidth={ART} imageHeight={ART} radius={12} resizeMode="cover" />
      ) : (
        <FlexWidget
          style={{ width: ART, height: ART, borderRadius: 12, backgroundColor: colors.s3, justifyContent: 'center', alignItems: 'center' }}
        >
          <SvgWidget svg={svg(NOTE, colors.primary)} style={{ width: 24, height: 24 }} />
        </FlexWidget>
      )}
      <FlexWidget style={{ flex: 1, flexDirection: 'column', marginHorizontal: 12 }}>
        <TextWidget text={title ?? 'Resonance'} maxLines={1} truncate="END" style={{ fontSize: 15, fontWeight: '600', color: colors.text }} />
        <TextWidget
          text={live ? (artist ?? '') : 'Tap to open'}
          maxLines={1}
          truncate="END"
          style={{ fontSize: 13, color: colors.muted, marginTop: 2 }}
        />
      </FlexWidget>
      <FlexWidget
        clickAction={live ? 'TOGGLE_PLAY' : 'OPEN_APP'}
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        style={{ width: ICON, height: ICON, borderRadius: ICON / 2, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}
      >
        <SvgWidget svg={svg(playing ? PAUSE : PLAY, colors.onPrimary)} style={{ width: 24, height: 24 }} />
      </FlexWidget>
      <FlexWidget
        clickAction={live ? 'NEXT' : 'OPEN_APP'}
        accessibilityLabel="Next"
        style={{ width: ICON, height: ICON, marginLeft: 8, justifyContent: 'center', alignItems: 'center' }}
      >
        <SvgWidget svg={svg(NEXT, colors.text)} style={{ width: 24, height: 24 }} />
      </FlexWidget>
    </FlexWidget>
  );
}
