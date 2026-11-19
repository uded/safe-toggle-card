import type { Step } from './effects';

export const GHOST_TAP_MS = 80;
const TIMER = 'multi_tap';

export type MultiTapState = { phase: 'idle' } | { phase: 'counting'; n: number; lastTap: number };

export type MultiTapEvent =
  { type: 'tap'; t: number } | { type: 'timeout'; id: string } | { type: 'reset' };

const IDLE: MultiTapState = { phase: 'idle' };

/** N taps within a window measured from the first tap. */
export function multiTapReducer(
  s: MultiTapState,
  e: MultiTapEvent,
  cfg: { taps: number; windowMs: number },
): Step<MultiTapState> {
  switch (e.type) {
    case 'tap': {
      if (s.phase === 'idle') {
        return {
          state: { phase: 'counting', n: 1, lastTap: e.t },
          effects: [
            { type: 'timer', id: TIMER, ms: cfg.windowMs },
            { type: 'haptic', kind: 'light' },
            { type: 'announce', key: 'multi_tap_remaining', vars: { n: cfg.taps - 1 } },
          ],
        };
      }
      if (e.t - s.lastTap < GHOST_TAP_MS) return { state: s, effects: [] };
      const n = s.n + 1;
      if (n >= cfg.taps) {
        return { state: IDLE, effects: [{ type: 'cancelTimer', id: TIMER }, { type: 'done' }] };
      }
      return {
        state: { phase: 'counting', n, lastTap: e.t },
        effects: [
          { type: 'haptic', kind: 'light' },
          { type: 'announce', key: 'multi_tap_remaining', vars: { n: cfg.taps - n } },
        ],
      };
    }
    case 'timeout':
      if (e.id !== TIMER || s.phase === 'idle') return { state: s, effects: [] };
      return {
        state: IDLE,
        effects: [
          { type: 'announce', key: 'cancelled' },
          { type: 'haptic', kind: 'warning' },
        ],
      };
    case 'reset':
      return { state: IDLE, effects: [{ type: 'cancelTimer', id: TIMER }] };
  }
}
