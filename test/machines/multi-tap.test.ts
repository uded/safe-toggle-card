import { describe, expect, it } from 'vitest';
import { multiTapReducer, type MultiTapState } from '../../src/machines/multi-tap';

const cfg = { taps: 3, windowMs: 2000 };
const idle: MultiTapState = { phase: 'idle' };
const tap = (s: MultiTapState, t: number) => multiTapReducer(s, { type: 'tap', t }, cfg);

describe('multiTapReducer', () => {
  it('first tap arms the window', () => {
    const r = tap(idle, 0);
    expect(r.state).toEqual({ phase: 'counting', n: 1, lastTap: 0 });
    expect(r.effects).toEqual([
      { type: 'timer', id: 'multi_tap', ms: 2000 },
      { type: 'haptic', kind: 'light' },
      { type: 'announce', key: 'multi_tap_remaining', vars: { n: 2 } },
    ]);
  });

  it('ignores ghost taps closer than 80 ms', () => {
    const r = tap(tap(idle, 0).state, 50);
    expect(r.state).toEqual({ phase: 'counting', n: 1, lastTap: 0 });
    expect(r.effects).toEqual([]);
  });

  it('completes on the last tap', () => {
    const s2 = tap(tap(idle, 0).state, 200);
    expect(s2.state).toMatchObject({ n: 2 });
    expect(s2.effects).toContainEqual({
      type: 'announce',
      key: 'multi_tap_remaining',
      vars: { n: 1 },
    });
    const s3 = tap(s2.state, 400);
    expect(s3.state).toEqual(idle);
    expect(s3.effects).toEqual([{ type: 'cancelTimer', id: 'multi_tap' }, { type: 'done' }]);
  });

  it('timeout cancels', () => {
    const r = multiTapReducer(tap(idle, 0).state, { type: 'timeout', id: 'multi_tap' }, cfg);
    expect(r.state).toEqual(idle);
    expect(r.effects).toEqual([
      { type: 'announce', key: 'cancelled' },
      { type: 'haptic', kind: 'warning' },
    ]);
  });

  it('ignores foreign timer ids and timeouts when idle', () => {
    const s = tap(idle, 0).state;
    expect(multiTapReducer(s, { type: 'timeout', id: 'hold' }, cfg)).toEqual({
      state: s,
      effects: [],
    });
    expect(multiTapReducer(idle, { type: 'timeout', id: 'multi_tap' }, cfg)).toEqual({
      state: idle,
      effects: [],
    });
  });

  it('reset clears the timer', () => {
    const r = multiTapReducer(tap(idle, 0).state, { type: 'reset' }, cfg);
    expect(r).toEqual({ state: idle, effects: [{ type: 'cancelTimer', id: 'multi_tap' }] });
  });
});
