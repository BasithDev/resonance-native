/**
 * Handles widget events. Runs in the app's JS runtime when the app is alive,
 * or in a fresh headless runtime when the app process was dead (Review Focus 5).
 *
 * TOGGLE_PLAY / NEXT reach the player only when this runtime has one. Without
 * one, the tap opens the app and the widget is redrawn idle, whose every tap
 * is a native OPEN_APP (no JS needed). The store is imported lazily so a
 * headless runtime never starts the playback engine.
 */
import { Linking } from 'react-native';
import type { WidgetTaskHandler } from 'react-native-android-widget';

import { IDLE_NOW_PLAYING, lastNowPlaying, renderNowPlaying } from './update';

export const widgetTaskHandler: WidgetTaskHandler = async ({ widgetAction, clickAction, renderWidget }) => {
  const now = lastNowPlaying();
  const hasPlayer = now?.title != null;

  if (widgetAction === 'WIDGET_CLICK' && (clickAction === 'TOGGLE_PLAY' || clickAction === 'NEXT')) {
    if (hasPlayer) {
      // Already loaded in this runtime (it reported `now`), so this just returns it.
      const { usePlayer } = require('../player/store') as typeof import('../player/store');
      if (clickAction === 'TOGGLE_PLAY') usePlayer.getState().togglePlay();
      else usePlayer.getState().next();
      return; // the store pushes the new state itself
    }
    renderWidget(renderNowPlaying(IDLE_NOW_PLAYING));
    await Linking.openURL('resonance://').catch(() => {});
    return;
  }

  if (widgetAction === 'WIDGET_ADDED' || widgetAction === 'WIDGET_UPDATE' || widgetAction === 'WIDGET_RESIZED') {
    renderWidget(renderNowPlaying(hasPlayer ? now! : IDLE_NOW_PLAYING));
  }
};
