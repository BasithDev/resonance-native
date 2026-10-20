const mockTogglePlay = jest.fn();
const mockNext = jest.fn();
jest.mock('../player/store', () => ({ usePlayer: { getState: () => ({ togglePlay: mockTogglePlay, next: mockNext }) } }));
jest.mock('./update', () => ({ ...jest.requireActual('./update'), updateWidget: jest.fn(async () => {}) }));

import { Linking } from 'react-native';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';

import { widgetTaskHandler } from './taskHandler';
import { rememberNowPlaying } from './update';

const info = { widgetName: 'NowPlaying', widgetId: 1, width: 300, height: 80, screenInfo: {} } as unknown as WidgetTaskHandlerProps['widgetInfo'];

function run(widgetAction: WidgetTaskHandlerProps['widgetAction'], clickAction?: string) {
  const renderWidget = jest.fn();
  return widgetTaskHandler({ widgetInfo: info, widgetAction, clickAction, renderWidget }).then(() => renderWidget);
}

const props = (r: jest.Mock) => r.mock.calls[r.mock.calls.length - 1][0].props;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  rememberNowPlaying(null);
});

describe('widget task handler', () => {
  it('maps TOGGLE_PLAY and NEXT to the player when this runtime has one', async () => {
    rememberNowPlaying({ title: 'Song', artist: 'Chan', artworkUri: null, playing: true });
    await run('WIDGET_CLICK', 'TOGGLE_PLAY');
    await run('WIDGET_CLICK', 'NEXT');
    expect(mockTogglePlay).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).not.toHaveBeenCalled();
  });

  it('app process dead (no player in this runtime): a button tap opens the app and shows the idle widget', async () => {
    const r = await run('WIDGET_CLICK', 'TOGGLE_PLAY');
    expect(mockTogglePlay).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith('resonance://');
    expect(props(r)).toMatchObject({ title: null, playing: false });
  });

  it('nothing queued counts as no player too', async () => {
    rememberNowPlaying({ title: null, artist: null, artworkUri: null, playing: false });
    await run('WIDGET_CLICK', 'NEXT');
    expect(mockNext).not.toHaveBeenCalled();
    expect(Linking.openURL).toHaveBeenCalledWith('resonance://');
  });

  it('opening the app never throws out of the task', async () => {
    (Linking.openURL as jest.Mock).mockRejectedValueOnce(new Error('blocked'));
    await expect(run('WIDGET_CLICK', 'NEXT')).resolves.toBeDefined();
  });

  it('added or updated: draws the current state (idle when there is none)', async () => {
    expect(props(await run('WIDGET_ADDED'))).toMatchObject({ title: null });
    rememberNowPlaying({ title: 'Song', artist: 'Chan', artworkUri: null, playing: false });
    expect(props(await run('WIDGET_UPDATE'))).toMatchObject({ title: 'Song', playing: false });
  });
});
