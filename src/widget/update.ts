/**
 * Pushes the now-playing state to every "NowPlaying" widget on the home screen.
 *
 * It also remembers what this JS runtime last pushed: the task handler uses that
 * to tell whether this runtime has a live player (the app is running) or was
 * started only for the widget (the app process was dead).
 */
import { createElement } from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

import { NowPlayingWidget } from './NowPlayingWidget';

export const WIDGET_NAME = 'NowPlaying';

export type NowPlaying = { title: string | null; artist: string | null; artworkUri: string | null; playing: boolean };

export const IDLE_NOW_PLAYING: NowPlaying = { title: null, artist: null, artworkUri: null, playing: false };

let last: NowPlaying | null = null;

export function rememberNowPlaying(s: NowPlaying | null) {
  last = s;
}

/** What the player in this runtime last reported, or null when it has none. */
export function lastNowPlaying(): NowPlaying | null {
  return last;
}

export function renderNowPlaying(s: NowPlaying) {
  return createElement(NowPlayingWidget, s);
}

export async function updateWidget(s: NowPlaying): Promise<void> {
  rememberNowPlaying(s);
  if (Platform.OS !== 'android') return;
  try {
    await requestWidgetUpdate({ widgetName: WIDGET_NAME, renderWidget: () => renderNowPlaying(s) });
  } catch {
    // No widget support on this launcher: nothing to update.
  }
}
