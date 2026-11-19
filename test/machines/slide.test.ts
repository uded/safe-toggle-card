import { describe, expect, it } from 'vitest';
import {
  initialSlide,
  slideReducer,
  type SlideEvent,
  type SlideState,
} from '../../src/machines/slide';

const cfg0 = { travelPx: 200, holdMs: 0 };
const cfgHold = { travelPx: 200, holdMs: 800 };

function run(events: SlideEvent[], cfg = cfg0, from: SlideState = initialSlide) {
  let state = from;
  let effects: ReturnType<typeof slideReducer>['effects'] = [];
  for (const e of events) ({ state, effects } = slideReducer(state, e, cfg));
  return { state, effects };
}

const grab = { type: 'down', x: 10, onHandle: true } as const;
const to = (x: number) => ({ type: 'move', x }) as const;
const key = (k: 'ArrowRight' | 'ArrowLeft' | 'Home' | 'End' | 'Enter', pressed = true) =>
  ({ type: 'key', key: k, pressed }) as const;

describe('slideReducer: pointer', () => {
  it('pressing the track (not the handle) nudges', () => {
    const r = run([{ type: 'down', x: 50, onHandle: false }]);
    expect(r.state.phase).toBe('idle');
    expect(r.effects).toEqual([{ type: 'nudge' }, { type: 'haptic', kind: 'light' }]);
  });

  it('tracks progress and clamps it', () => {
    expect(run([grab, to(110)]).state).toMatchObject({ phase: 'dragging', progress: 0.5 });
    expect(run([grab, to(400)]).state.progress).toBe(1);
    expect(run([grab, to(-50)]).state.progress).toBe(0);
  });

  it('release at the end commits when holdMs is 0', () => {
    const r = run([grab, to(202), { type: 'up' }]);
    expect(r.effects).toContainEqual({ type: 'done' });
    expect(r.effects).toContainEqual({ type: 'haptic', kind: 'success' });
    // stays at the end until the card resets the control after the action
    expect(r.state).toMatchObject({ phase: 'idle', progress: 1 });
  });

  it('release short of the end returns', () => {
    const r = run([grab, to(190), { type: 'up' }]);
    expect(r.state.phase).toBe('returning');
    expect(r.effects).not.toContainEqual({ type: 'done' });
    const back = slideReducer(r.state, { type: 'returned' }, cfg0);
    expect(back.state).toEqual(initialSlide);
  });

  it('reaching the end with holdMs starts holding', () => {
    const r = run([grab, to(205)], cfgHold);
    expect(r.state.phase).toBe('holding');
    expect(r.effects).toEqual([
      { type: 'timer', id: 'hold', ms: 800 },
      { type: 'haptic', kind: 'selection' },
    ]);
  });

  it('leaving the end while holding goes back to dragging', () => {
    const r = run([grab, to(205), to(190)], cfgHold);
    expect(r.state.phase).toBe('dragging');
    expect(r.effects).toEqual([{ type: 'cancelTimer', id: 'hold' }]);
  });

  it('hold timeout commits without release', () => {
    const r = run([grab, to(205), { type: 'timeout', id: 'hold' }], cfgHold);
    expect(r.effects).toContainEqual({ type: 'done' });
  });

  it('release while holding returns and cancels the timer', () => {
    const r = run([grab, to(205), { type: 'up' }], cfgHold);
    expect(r.state.phase).toBe('returning');
    expect(r.effects).toContainEqual({ type: 'cancelTimer', id: 'hold' });
  });

  it('release at the end with holdMs does not commit', () => {
    const r = run([grab, to(205), { type: 'up' }], cfgHold);
    expect(r.effects).not.toContainEqual({ type: 'done' });
  });

  it('pointercancel returns from dragging and holding', () => {
    expect(run([grab, to(100), { type: 'cancel' }]).state.phase).toBe('returning');
    const h = run([grab, to(205), { type: 'cancel' }], cfgHold);
    expect(h.state.phase).toBe('returning');
    expect(h.effects).toContainEqual({ type: 'cancelTimer', id: 'hold' });
  });

  it('ignores a stale hold timeout', () => {
    const r = run([grab, to(100), { type: 'timeout', id: 'hold' }], cfgHold);
    expect(r.state.phase).toBe('dragging');
    expect(r.effects).toEqual([]);
  });
});

describe('slideReducer: keyboard', () => {
  it('arrows step by 10 percent', () => {
    const r = run([key('ArrowRight'), key('ArrowRight'), key('ArrowRight')]);
    expect(r.state).toMatchObject({ phase: 'dragging', progress: 0.3 });
    expect(run([key('ArrowRight'), key('ArrowLeft')]).state.progress).toBe(0);
  });

  it('End and Home jump', () => {
    expect(run([key('End')]).state.progress).toBe(1);
    expect(run([key('End'), key('Home')]).state.progress).toBe(0);
  });

  it('ten arrow presses reach exactly the end', () => {
    expect(run(Array.from({ length: 10 }, () => key('ArrowRight'))).state.progress).toBe(1);
  });

  it('Enter at the end commits', () => {
    expect(run([key('End'), key('Enter')]).effects).toContainEqual({ type: 'done' });
  });

  it('Enter short of the end nudges', () => {
    const r = run([key('ArrowRight'), key('Enter')]);
    expect(r.effects).toContainEqual({ type: 'nudge' });
    expect(r.effects).not.toContainEqual({ type: 'done' });
  });

  it('with holdMs, holding Enter at the end starts the hold', () => {
    const r = run([key('End'), key('Enter')], cfgHold);
    expect(r.state).toMatchObject({ phase: 'holding', keyHold: true });
    expect(r.effects).toContainEqual({ type: 'timer', id: 'hold', ms: 800 });
  });

  it('releasing Enter early cancels the hold', () => {
    const r = run([key('End'), key('Enter'), key('Enter', false)], cfgHold);
    expect(r.state.phase).toBe('dragging');
    expect(r.effects).toEqual([{ type: 'cancelTimer', id: 'hold' }]);
  });

  it('arrows do not auto-start a hold', () => {
    expect(run([key('End')], cfgHold).state.phase).toBe('dragging');
  });
});

describe('slideReducer: reset', () => {
  it('returns to the initial state from any phase', () => {
    const r = run([grab, to(205), { type: 'reset' }], cfgHold);
    expect(r.state).toEqual(initialSlide);
    expect(r.effects).toEqual([{ type: 'cancelTimer', id: 'hold' }]);
  });
});
