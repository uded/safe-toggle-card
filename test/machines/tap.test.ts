import { describe, expect, it } from 'vitest';
import { tapReducer, type TapState } from '../../src/machines/tap';

const idle: TapState = { phase: 'idle' };
const down = tapReducer(idle, { type: 'down', x: 0, y: 0, t: 0 }).state;

describe('tapReducer', () => {
  it('a short, still press is a tap', () => {
    const r = tapReducer(down, { type: 'up', x: 5, y: 5, t: 100 });
    expect(r).toEqual({ state: idle, tapped: true });
  });

  it('moving more than 10 px is not a tap', () => {
    expect(tapReducer(down, { type: 'up', x: 11, y: 0, t: 100 }).tapped).toBe(false);
    expect(tapReducer(down, { type: 'up', x: 0, y: -11, t: 100 }).tapped).toBe(false);
  });

  it('holding longer than 500 ms is not a tap', () => {
    expect(tapReducer(down, { type: 'up', x: 0, y: 0, t: 501 }).tapped).toBe(false);
  });

  it('up without down is not a tap', () => {
    expect(tapReducer(idle, { type: 'up', x: 0, y: 0, t: 10 }).tapped).toBe(false);
  });

  it('cancel returns to idle', () => {
    expect(tapReducer(down, { type: 'cancel' })).toEqual({ state: idle, tapped: false });
  });
});
