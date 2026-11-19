import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimerBag } from '../../src/machines/effects';

describe('TimerBag', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires once after the delay', () => {
    const bag = new TimerBag();
    const cb = vi.fn();
    bag.set('a', 100, cb);
    vi.advanceTimersByTime(99);
    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(cb).toHaveBeenCalledOnce();
  });

  it('setting the same id replaces the previous timer', () => {
    const bag = new TimerBag();
    const first = vi.fn();
    const second = vi.fn();
    bag.set('a', 100, first);
    bag.set('a', 100, second);
    vi.advanceTimersByTime(200);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it('clear and clearAll cancel pending timers', () => {
    const bag = new TimerBag();
    const a = vi.fn();
    const b = vi.fn();
    bag.set('a', 100, a);
    bag.set('b', 100, b);
    bag.clear('a');
    vi.advanceTimersByTime(50);
    bag.clearAll();
    vi.advanceTimersByTime(100);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });
});
