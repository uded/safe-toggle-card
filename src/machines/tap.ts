export const TAP_MAX_MOVE_PX = 10;
export const TAP_MAX_MS = 500;

export type TapState = { phase: 'idle' } | { phase: 'pressed'; x: number; y: number; t: number };

export type TapEvent =
  { type: 'down' | 'up'; x: number; y: number; t: number } | { type: 'cancel' };

const IDLE: TapState = { phase: 'idle' };

/** Distinguishes a deliberate tap from a scroll or a long press. */
export function tapReducer(s: TapState, e: TapEvent): { state: TapState; tapped: boolean } {
  switch (e.type) {
    case 'down':
      return { state: { phase: 'pressed', x: e.x, y: e.y, t: e.t }, tapped: false };
    case 'up': {
      if (s.phase !== 'pressed') return { state: IDLE, tapped: false };
      const still =
        Math.abs(e.x - s.x) <= TAP_MAX_MOVE_PX && Math.abs(e.y - s.y) <= TAP_MAX_MOVE_PX;
      return { state: IDLE, tapped: still && e.t - s.t <= TAP_MAX_MS };
    }
    case 'cancel':
      return { state: IDLE, tapped: false };
  }
}
