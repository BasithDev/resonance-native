import type { ReactElement } from 'react';

import { NowPlayingWidget } from './NowPlayingWidget';

type El = ReactElement<{ clickAction?: string; children?: unknown; image?: unknown; text?: string }>;

/** Flattens the widget's JSX (its host components are plain functions; we render ours). */
function walk(el: El, out: El[] = []): El[] {
  if (!el || typeof el !== 'object') return out;
  if (typeof el.type === 'function' && el.type === NowPlayingWidget) return walk((el.type as (p: unknown) => El)(el.props), out);
  out.push(el);
  const kids = el.props.children;
  (Array.isArray(kids) ? kids.flat(Infinity) : [kids]).forEach((k) => walk(k as El, out));
  return out;
}

const actions = (el: El) => walk(el).map((e) => e.props.clickAction).filter(Boolean);

describe('NowPlayingWidget', () => {
  it('playing: body opens the app, buttons toggle and skip', () => {
    const el = NowPlayingWidget({ title: 'Song', artist: 'Chan', artworkUri: 'https://img/a.jpg', playing: true }) as El;
    expect(el.props.clickAction).toBe('OPEN_APP');
    expect(actions(el)).toEqual(expect.arrayContaining(['TOGGLE_PLAY', 'NEXT']));
    expect(walk(el).some((e) => e.props.text === 'Song')).toBe(true);
    expect(walk(el).some((e) => (e.props.image as unknown) === 'https://img/a.jpg')).toBe(true);
  });

  it('nothing playing: every tap opens the app (works with the app process dead)', () => {
    const el = NowPlayingWidget({ title: null, artist: null, artworkUri: null, playing: false }) as El;
    expect(new Set(actions(el))).toEqual(new Set(['OPEN_APP']));
  });
});
