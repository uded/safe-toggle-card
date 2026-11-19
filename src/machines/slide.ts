import type { Effect, Step } from './effects';

export const SLIDE_THRESHOLD = 0.95;
export const KEY_STEP = 0.1;
const TIMER = 'hold';

export type SlidePhase = 'idle' | 'dragging' | 'holding' | 'returning';

export interface SlideState {
  phase: SlidePhase;
  /** Pointer x that corresponds to progress 0. */
  startX: number;
  progress: number;
  keyHold: boolean;
}

/** `x` is in logical inline direction; the control flips it for RTL. */
export type SlideEvent =
  | { type: 'down'; x: number; onHandle: boolean }
  | { type: 'move'; x: number }
  | { type: 'up' }
  | { type: 'cancel' }
  | { type: 'timeout'; id: string }
  | { type: 'returned' }
  | { type: 'key'; key: 'ArrowRight' | 'ArrowLeft' | 'Home' | 'End' | 'Enter'; pressed: boolean }
  | { type: 'reset' };

export const initialSlide: SlideState = { phase: 'idle', startX: 0, progress: 0, keyHold: false };

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const stepTo = (v: number) => Math.round(clamp(v) * 10) / 10;
const none = (state: SlideState): Step<SlideState> => ({ state, effects: [] });

/** Committed: stays at the end until the card resets it after the action. */
function commit(s: SlideState, extra: Effect[] = []): Step<SlideState> {
  return {
    state: { ...s, phase: 'idle', progress: 1, keyHold: false },
    effects: [...extra, { type: 'haptic', kind: 'success' }, { type: 'done' }],
  };
}

function startHold(s: SlideState, keyHold: boolean, holdMs: number): Step<SlideState> {
  return {
    state: { ...s, phase: 'holding', keyHold },
    effects: [
      { type: 'timer', id: TIMER, ms: holdMs },
      { type: 'haptic', kind: 'selection' },
    ],
  };
}

const returning = (s: SlideState, extra: Effect[] = []): Step<SlideState> => ({
  state: { ...s, phase: 'returning', keyHold: false },
  effects: extra,
});

function onKey(
  s: SlideState,
  e: Extract<SlideEvent, { type: 'key' }>,
  holdMs: number,
): Step<SlideState> {
  if (e.key === 'Enter') {
    if (!e.pressed) {
      if (s.phase === 'holding' && s.keyHold) {
        return {
          state: { ...s, phase: 'dragging', keyHold: false },
          effects: [{ type: 'cancelTimer', id: TIMER }],
        };
      }
      return none(s);
    }
    if (s.phase === 'holding') return none(s);
    if (s.progress < SLIDE_THRESHOLD) return { state: s, effects: [{ type: 'nudge' }] };
    return holdMs > 0 ? startHold(s, true, holdMs) : commit(s);
  }
  if (!e.pressed || s.phase === 'holding') return none(s);
  const target = {
    ArrowRight: s.progress + KEY_STEP,
    ArrowLeft: s.progress - KEY_STEP,
    Home: 0,
    End: 1,
  }[e.key];
  return none({ ...s, phase: 'dragging', progress: stepTo(target) });
}

export function slideReducer(
  s: SlideState,
  e: SlideEvent,
  cfg: { travelPx: number; holdMs: number },
): Step<SlideState> {
  const atEnd = (p: number) => p >= SLIDE_THRESHOLD;
  switch (e.type) {
    case 'down':
      if (s.phase === 'dragging' || s.phase === 'holding') return none(s);
      if (!e.onHandle) {
        return {
          state: s,
          effects: [{ type: 'nudge' }, { type: 'haptic', kind: 'light' }],
        };
      }
      return none({ ...s, phase: 'dragging', startX: e.x - s.progress * cfg.travelPx });
    case 'move': {
      if (s.phase !== 'dragging' && s.phase !== 'holding') return none(s);
      const progress = clamp((e.x - s.startX) / Math.max(1, cfg.travelPx));
      const next = { ...s, progress };
      if (cfg.holdMs > 0 && s.phase === 'dragging' && atEnd(progress)) {
        return startHold(next, false, cfg.holdMs);
      }
      if (s.phase === 'holding' && !atEnd(progress)) {
        return {
          state: { ...next, phase: 'dragging', keyHold: false },
          effects: [{ type: 'cancelTimer', id: TIMER }],
        };
      }
      return none(next);
    }
    case 'up':
      if (s.phase === 'holding') return returning(s, [{ type: 'cancelTimer', id: TIMER }]);
      if (s.phase !== 'dragging') return none(s);
      if (cfg.holdMs === 0 && atEnd(s.progress)) return commit(s);
      return returning(s);
    case 'cancel':
      if (s.phase === 'holding') return returning(s, [{ type: 'cancelTimer', id: TIMER }]);
      return s.phase === 'dragging' ? returning(s) : none(s);
    case 'timeout':
      return e.id === TIMER && s.phase === 'holding' ? commit(s) : none(s);
    case 'returned':
      return s.phase === 'returning' ? none(initialSlide) : none(s);
    case 'key':
      return onKey(s, e, cfg.holdMs);
    case 'reset':
      return { state: initialSlide, effects: [{ type: 'cancelTimer', id: TIMER }] };
  }
}
