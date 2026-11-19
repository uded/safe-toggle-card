import type { ConfirmMode, Direction } from '../types';
import type { Effect } from './effects';

export const PENDING_MS = 10000;
export const STATELESS_FLASH_MS = 1000;
const TIMER = 'pending';

export type FlowState =
  | { phase: 'idle' }
  | { phase: 'gesture' | 'confirm' | 'pin'; direction: Direction; startState: string }
  /** `changed`: HA pushed the new state before callService resolved. */
  | { phase: 'executing'; direction: Direction; changed: boolean }
  | { phase: 'pending'; direction: Direction };

export type FlowEvent =
  | { type: 'gestureStart'; direction: Direction; entityState: string }
  | { type: 'gestureDone' }
  | { type: 'gestureCancel' }
  | { type: 'confirmOk' }
  | { type: 'pinOk' }
  | { type: 'dialogCancel' }
  | { type: 'callOk' }
  | { type: 'callError'; message: string }
  /** Dispatched only when the entity's state string changed. */
  | { type: 'entityState'; state: string }
  | { type: 'timeout'; id: string }
  | { type: 'reset' };

export type FlowEffect =
  | Effect
  | { type: 'dialog'; kind: 'confirm' | 'pin' | null }
  | { type: 'execute'; direction: Direction }
  | { type: 'toast'; message: string };

export interface FlowConfig {
  confirm: (d: Direction) => ConfirmMode;
  stateless: boolean;
}

type Out = { state: FlowState; effects: FlowEffect[] };

const IDLE: FlowState = { phase: 'idle' };
const none = (state: FlowState): Out => ({ state, effects: [] });
const execute = (direction: Direction, extra: FlowEffect[] = []): Out => ({
  state: { phase: 'executing', direction, changed: false },
  effects: [...extra, { type: 'execute', direction }],
});

/** Gesture, then optional dialog or PIN, then the service call and the wait for HA. */
export function flowReducer(s: FlowState, e: FlowEvent, cfg: FlowConfig): Out {
  switch (e.type) {
    case 'gestureStart':
      if (s.phase !== 'idle') return none(s);
      return none({ phase: 'gesture', direction: e.direction, startState: e.entityState });
    case 'gestureDone': {
      if (s.phase !== 'gesture') return none(s);
      const mode = cfg.confirm(s.direction);
      if (mode === 'none') return execute(s.direction);
      const kind = mode === 'dialog' ? 'confirm' : 'pin';
      return { state: { ...s, phase: kind }, effects: [{ type: 'dialog', kind }] };
    }
    case 'gestureCancel':
      return s.phase === 'gesture' ? none(IDLE) : none(s);
    case 'confirmOk':
      return s.phase === 'confirm'
        ? execute(s.direction, [{ type: 'dialog', kind: null }])
        : none(s);
    case 'pinOk':
      return s.phase === 'pin' ? execute(s.direction, [{ type: 'dialog', kind: null }]) : none(s);
    case 'dialogCancel':
      if (s.phase !== 'confirm' && s.phase !== 'pin') return none(s);
      return {
        state: IDLE,
        effects: [
          { type: 'dialog', kind: null },
          { type: 'announce', key: 'cancelled' },
        ],
      };
    case 'callOk':
      if (s.phase !== 'executing') return none(s);
      if (s.changed) return { state: IDLE, effects: [{ type: 'announce', key: 'done' }] };
      return {
        state: { phase: 'pending', direction: s.direction },
        effects: cfg.stateless
          ? [
              { type: 'timer', id: TIMER, ms: STATELESS_FLASH_MS },
              { type: 'haptic', kind: 'success' },
            ]
          : [{ type: 'timer', id: TIMER, ms: PENDING_MS }],
      };
    case 'callError':
      if (s.phase !== 'executing') return none(s);
      return {
        state: IDLE,
        effects: [
          { type: 'toast', message: e.message },
          { type: 'haptic', kind: 'failure' },
        ],
      };
    case 'entityState':
      switch (s.phase) {
        case 'gesture':
        case 'confirm':
        case 'pin': {
          if (e.state === s.startState) return none(s);
          const effects: FlowEffect[] =
            s.phase === 'gesture' ? [] : [{ type: 'dialog', kind: null }];
          effects.push({ type: 'announce', key: 'state_changed' });
          return { state: IDLE, effects };
        }
        case 'executing':
          return none({ ...s, changed: true });
        case 'pending':
          return {
            state: IDLE,
            effects: [
              { type: 'cancelTimer', id: TIMER },
              { type: 'announce', key: 'done' },
            ],
          };
        default:
          return none(s);
      }
    case 'timeout':
      return e.id === TIMER && s.phase === 'pending' ? none(IDLE) : none(s);
    case 'reset':
      return {
        state: IDLE,
        effects: [
          { type: 'dialog', kind: null },
          { type: 'cancelTimer', id: TIMER },
        ],
      };
  }
}
