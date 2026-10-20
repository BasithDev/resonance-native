// Only the pure helpers are under test; the gesture/animation libraries need native code.
jest.mock('react-native-gesture-handler', () => ({}));
jest.mock('react-native-reanimated', () => ({}));
jest.mock('react-native-worklets', () => ({}));

import { moveItem, shifted } from './reorder';

describe('reorder', () => {
  it('moveItem moves down and up, and ignores out-of-range moves', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('shifted makes room for the dragged row', () => {
    const d = { from: 0, to: 2, dy: 0 };
    expect([0, 1, 2, 3].map((p) => shifted(p, d))).toEqual([0, 0, 1, 3]);
    const up = { from: 3, to: 1, dy: 0 };
    expect([0, 1, 2, 3].map((p) => shifted(p, up))).toEqual([0, 2, 3, 3]);
  });
});
