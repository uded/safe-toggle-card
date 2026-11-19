import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireHaptic } from '../src/haptics';

describe('fireHaptic', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dispatches HA haptic event that crosses shadow roots', () => {
    const el = document.createElement('div');
    const seen: Event[] = [];
    el.addEventListener('haptic', (e) => seen.push(e));
    fireHaptic(el, 'success', true);
    expect(seen).toHaveLength(1);
    const e = seen[0] as CustomEvent;
    expect(e.detail).toBe('success');
    expect(e.bubbles).toBe(true);
    expect(e.composed).toBe(true);
  });

  it('vibrates when the browser supports it', () => {
    const vibrate = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    fireHaptic(document.createElement('div'), 'light', true);
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('does nothing when disabled', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    const el = document.createElement('div');
    const listener = vi.fn();
    el.addEventListener('haptic', listener);
    fireHaptic(el, 'success', false);
    expect(listener).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });
});
