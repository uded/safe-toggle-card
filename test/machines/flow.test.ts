import { describe, expect, it } from 'vitest';
import { flowReducer, type FlowEvent, type FlowState } from '../../src/machines/flow';
import type { ConfirmMode, Direction } from '../../src/types';

const cfgWith = (confirm: ConfirmMode, stateless = false) => ({
  confirm: (_d: Direction) => confirm,
  stateless,
});

function run(events: FlowEvent[], cfg = cfgWith('none'), from: FlowState = { phase: 'idle' }) {
  let state = from;
  let effects: ReturnType<typeof flowReducer>['effects'] = [];
  for (const e of events) ({ state, effects } = flowReducer(state, e, cfg));
  return { state, effects };
}

const start = { type: 'gestureStart', direction: 'activate', entityState: 'off' } as const;
const done = { type: 'gestureDone' } as const;
const idle = { phase: 'idle' };

describe('flowReducer: confirm none', () => {
  it('gesture start enters the gesture phase', () => {
    expect(run([start]).state).toEqual({
      phase: 'gesture',
      direction: 'activate',
      startState: 'off',
    });
  });

  it('gesture done executes', () => {
    const r = run([start, done]);
    expect(r.state).toMatchObject({ phase: 'executing', direction: 'activate' });
    expect(r.effects).toEqual([{ type: 'execute', direction: 'activate' }]);
  });

  it('call ok waits for the state change', () => {
    const r = run([start, done, { type: 'callOk' }]);
    expect(r.state).toMatchObject({ phase: 'pending', direction: 'activate' });
    expect(r.effects).toEqual([{ type: 'timer', id: 'pending', ms: 10000 }]);
    const s = run([{ type: 'entityState', state: 'on' }], cfgWith('none'), r.state);
    expect(s.state).toEqual(idle);
    expect(s.effects).toEqual([
      { type: 'cancelTimer', id: 'pending' },
      { type: 'announce', key: 'done' },
    ]);
  });

  it('state pushed before the call resolves ends the flow on callOk', () => {
    const r = run([start, done, { type: 'entityState', state: 'on' }, { type: 'callOk' }]);
    expect(r.state).toEqual(idle);
    expect(r.effects).toEqual([{ type: 'announce', key: 'done' }]);
  });

  it('pending times out after 10 s without a state change', () => {
    const r = run([start, done, { type: 'callOk' }, { type: 'timeout', id: 'pending' }]);
    expect(r.state).toEqual(idle);
  });

  it('gesture cancel returns to idle', () => {
    expect(run([start, { type: 'gestureCancel' }]).state).toEqual(idle);
  });
});

describe('flowReducer: dialogs', () => {
  it('dialog confirm opens and confirms', () => {
    const a = run([start, done], cfgWith('dialog'));
    expect(a.state).toMatchObject({ phase: 'confirm', direction: 'activate' });
    expect(a.effects).toEqual([{ type: 'dialog', kind: 'confirm' }]);
    const b = run([{ type: 'confirmOk' }], cfgWith('dialog'), a.state);
    expect(b.state).toMatchObject({ phase: 'executing' });
    expect(b.effects).toEqual([
      { type: 'dialog', kind: null },
      { type: 'execute', direction: 'activate' },
    ]);
  });

  it('dialog cancel returns to idle', () => {
    const r = run([start, done, { type: 'dialogCancel' }], cfgWith('dialog'));
    expect(r.state).toEqual(idle);
    expect(r.effects).toEqual([
      { type: 'dialog', kind: null },
      { type: 'announce', key: 'cancelled' },
    ]);
  });

  it('pin opens the pin dialog and pinOk executes', () => {
    const a = run([start, done], cfgWith('pin'));
    expect(a.effects).toEqual([{ type: 'dialog', kind: 'pin' }]);
    const b = run([{ type: 'pinOk' }], cfgWith('pin'), a.state);
    expect(b.effects).toContainEqual({ type: 'execute', direction: 'activate' });
  });

  it('confirmOk is ignored in the pin phase', () => {
    const a = run([start, done], cfgWith('pin'));
    expect(run([{ type: 'confirmOk' }], cfgWith('pin'), a.state).effects).toEqual([]);
  });

  it('uses the confirm mode of the captured direction', () => {
    const cfg = {
      confirm: (d: Direction) => (d === 'activate' ? 'pin' : 'none'),
      stateless: false,
    } as const;
    const off = { type: 'gestureStart', direction: 'deactivate', entityState: 'on' } as const;
    expect(run([off, done], cfg).effects).toEqual([{ type: 'execute', direction: 'deactivate' }]);
  });
});

describe('flowReducer: stale direction', () => {
  it.each(['none', 'dialog', 'pin'] as const)('a state change aborts (%s)', (mode) => {
    const events: FlowEvent[] = mode === 'none' ? [start] : [start, done];
    const r = run([...events, { type: 'entityState', state: 'on' }], cfgWith(mode));
    expect(r.state).toEqual(idle);
    expect(r.effects).toContainEqual({ type: 'announce', key: 'state_changed' });
    expect(r.effects).not.toContainEqual(expect.objectContaining({ type: 'execute' }));
    if (mode !== 'none') expect(r.effects).toContainEqual({ type: 'dialog', kind: null });
  });

  it('the same state string is a no-op', () => {
    const before = run([start]);
    const r = run([{ type: 'entityState', state: 'off' }], cfgWith('none'), before.state);
    expect(r).toEqual({ state: before.state, effects: [] });
  });
});

describe('flowReducer: double fire', () => {
  it('ignores gesture events while executing or pending', () => {
    const exec = run([start, done]).state;
    expect(run([done], cfgWith('none'), exec).effects).toEqual([]);
    expect(run([start], cfgWith('none'), exec).state).toEqual(exec);
    const pending = run([{ type: 'callOk' }], cfgWith('none'), exec).state;
    expect(run([start, done], cfgWith('none'), pending).effects).toEqual([]);
  });
});

describe('flowReducer: errors, stateless, reset', () => {
  it('call error toasts and returns to idle', () => {
    const r = run([start, done, { type: 'callError', message: 'boom' }]);
    expect(r.state).toEqual(idle);
    expect(r.effects).toEqual([
      { type: 'toast', message: 'boom' },
      { type: 'haptic', kind: 'failure' },
    ]);
  });

  it('stateless entities flash for 1 s', () => {
    const r = run([start, done, { type: 'callOk' }], cfgWith('none', true));
    expect(r.effects).toEqual([
      { type: 'timer', id: 'pending', ms: 1000 },
      { type: 'haptic', kind: 'success' },
    ]);
    expect(run([{ type: 'timeout', id: 'pending' }], cfgWith('none', true), r.state).state).toEqual(
      idle,
    );
  });

  it('reset clears everything', () => {
    const r = run([start, done, { type: 'reset' }], cfgWith('dialog'));
    expect(r.state).toEqual(idle);
    expect(r.effects).toEqual([
      { type: 'dialog', kind: null },
      { type: 'cancelTimer', id: 'pending' },
    ]);
  });
});
