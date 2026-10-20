/**
 * Drag-to-reorder for fixed-height rows laid out absolutely inside a ScrollView
 * (shared by the queue sheet and the playlist screen). One shared `Drag` value
 * says which row is lifted and where it would land; every row derives its own
 * slot from it, so the list re-flows on the UI thread while dragging.
 */
import { Gesture, type NativeGesture } from 'react-native-gesture-handler';
import { type SharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export type Drag = { from: number; to: number; dy: number };
export const IDLE_DRAG: Drag = { from: -1, to: -1, dy: 0 };

/** Where row `pos` sits while row `d.from` is being dragged to `d.to`. */
export function shifted(pos: number, d: Drag): number {
  'worklet';
  if (d.from < 0) return pos;
  if (d.from < pos && pos <= d.to) return pos - 1;
  if (d.to <= pos && pos < d.from) return pos + 1;
  return pos;
}

/** `list` with the item at `from` moved to `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from === to || from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

/** The absolute slot style for row `pos` (lifted while it is the one being dragged). */
export function useDragSlotStyle(drag: SharedValue<Drag>, pos: number, rowHeight: number) {
  return useAnimatedStyle(() => {
    const d = drag.get();
    if (d.from === pos) return { top: pos * rowHeight + d.dy, zIndex: 10, transform: [{ scale: 1.02 }] };
    return { top: withTiming(shifted(pos, d) * rowHeight, { duration: 150 }), zIndex: 0, transform: [{ scale: 1 }] };
  });
}

/**
 * The pan that drags row `pos`. It blocks `scroll` while active. `onMove` runs on the JS
 * thread; the owner resets `drag` to IDLE_DRAG once the reordered list has rendered.
 */
export function reorderPan(opts: {
  pos: number;
  count: number;
  rowHeight: number;
  drag: SharedValue<Drag>;
  scroll: NativeGesture;
  onMove: (from: number, to: number) => void;
}) {
  const { pos, count, rowHeight, drag, scroll, onMove } = opts;
  return Gesture.Pan()
    .blocksExternalGesture(scroll)
    .onStart(() => {
      drag.set({ from: pos, to: pos, dy: 0 });
    })
    .onUpdate((e) => {
      const to = Math.max(0, Math.min(count - 1, Math.round(pos + e.translationY / rowHeight)));
      drag.set({ from: pos, to, dy: e.translationY });
    })
    .onEnd(() => {
      const { to } = drag.get();
      if (to === pos) drag.set(IDLE_DRAG);
      else scheduleOnRN(onMove, pos, to);
    })
    .onFinalize((_e, success) => {
      if (!success) drag.set(IDLE_DRAG);
    });
}
