import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/components/safe-toggle-control';
import type { SafeToggleControl } from '../../src/components/safe-toggle-control';
import { normalizeConfig } from '../../src/config';
import { stateColorCss } from '../../src/styles';
import type { DirectionConfig } from '../../src/types';

const dirCfg = (d: object): DirectionConfig =>
  normalizeConfig({ type: 'x', entity: 'lock.x', activate: d }).activate;

async function mount(props: Partial<SafeToggleControl>) {
  const el = document.createElement('safe-toggle-control') as SafeToggleControl;
  Object.assign(
    el,
    {
      direction: 'activate',
      cfg: dirCfg({}),
      busy: false,
      label: 'Slide to unlock',
      targetColor: 'red',
      lang: 'en',
      haptics: false,
      rtl: false,
    },
    props,
  );
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const q = <T extends Element>(el: SafeToggleControl, sel: string) =>
  el.shadowRoot!.querySelector(sel) as T;

function record(el: HTMLElement) {
  const seen: string[] = [];
  for (const n of ['gesture-start', 'gesture-done', 'gesture-cancel']) {
    el.addEventListener(n, () => seen.push(n));
  }
  return seen;
}

const pointer = (type: string, target: Element, clientX: number) =>
  target.dispatchEvent(
    new PointerEvent(type, { clientX, clientY: 0, pointerId: 1, bubbles: true, composed: true }),
  );
const key = (target: Element, type: 'keydown' | 'keyup', k: string) =>
  target.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, composed: true }));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('slide', () => {
  it('a full slide emits start then done', async () => {
    const el = await mount({});
    const seen = record(el);
    const handle = q(el, '.handle');
    pointer('pointerdown', handle, 0);
    pointer('pointermove', handle, 500);
    pointer('pointerup', handle, 500);
    expect(seen).toEqual(['gesture-start', 'gesture-done']);
  });

  it('tapping the track nudges and does not start', async () => {
    const el = await mount({});
    const seen = record(el);
    pointer('pointerdown', q(el, '.track'), 10);
    pointer('pointerup', q(el, '.track'), 12);
    await el.updateComplete;
    expect(seen).toEqual([]);
    expect(q(el, '.track').classList.contains('nudge')).toBe(true);
  });

  it('pointercancel mid-drag cancels', async () => {
    const el = await mount({ cfg: dirCfg({ hold_ms: 800 }) });
    const seen = record(el);
    const handle = q(el, '.handle');
    pointer('pointerdown', handle, 0);
    pointer('pointermove', handle, 0.5);
    pointer('pointercancel', handle, 0.5);
    expect(seen).toEqual(['gesture-start', 'gesture-cancel']);
  });

  it('in RTL, moving towards smaller x completes', async () => {
    const el = await mount({ rtl: true });
    const seen = record(el);
    const handle = q(el, '.handle');
    pointer('pointerdown', handle, 500);
    pointer('pointermove', handle, 0);
    pointer('pointerup', handle, 0);
    expect(seen).toEqual(['gesture-start', 'gesture-done']);
  });

  it('in LTR, moving towards smaller x does not complete', async () => {
    const el = await mount({});
    const seen = record(el);
    const handle = q(el, '.handle');
    pointer('pointerdown', handle, 500);
    pointer('pointermove', handle, 0);
    pointer('pointerup', handle, 0);
    expect(seen).toEqual(['gesture-start', 'gesture-cancel']);
  });

  it('keyboard: End then Enter completes', async () => {
    const el = await mount({});
    const seen = record(el);
    const handle = q(el, '.handle');
    key(handle, 'keydown', 'End');
    key(handle, 'keydown', 'Enter');
    expect(seen).toEqual(['gesture-start', 'gesture-done']);
  });

  it('exposes slider semantics and pan-y touch action', async () => {
    const el = await mount({});
    const handle = q(el, '.handle');
    expect(handle.getAttribute('role')).toBe('slider');
    expect(handle.getAttribute('aria-valuenow')).toBe('0');
    expect(handle.getAttribute('aria-valuetext')).toBe('Slide to unlock');
    key(handle, 'keydown', 'ArrowRight');
    await el.updateComplete;
    expect(handle.getAttribute('aria-valuenow')).toBe('10');
    const css = (el.constructor as typeof SafeToggleControl).styles.toString();
    expect(css).toMatch(/touch-action:\s*pan-y/);
  });

  it('reset() parks the handle at the start', async () => {
    const el = await mount({});
    const handle = q(el, '.handle');
    key(handle, 'keydown', 'End');
    el.reset();
    await el.updateComplete;
    expect(handle.getAttribute('aria-valuenow')).toBe('0');
  });
});

describe('tap and multi-tap', () => {
  it('multi-tap emits start once and done once', async () => {
    const el = await mount({
      cfg: dirCfg({ gesture: 'multi_tap', taps: 3 }),
      label: 'Tap 3 times',
    });
    const seen = record(el);
    const button = q<HTMLElement>(el, '.button');
    button.click();
    await el.updateComplete;
    expect(button.textContent).toContain('2 left');
    vi.advanceTimersByTime(200);
    button.click();
    vi.advanceTimersByTime(200);
    button.click();
    expect(seen).toEqual(['gesture-start', 'gesture-done']);
  });

  it('multi-tap window timeout cancels', async () => {
    const el = await mount({ cfg: dirCfg({ gesture: 'multi_tap', taps: 3 }) });
    const seen = record(el);
    q<HTMLElement>(el, '.button').click();
    vi.advanceTimersByTime(2000);
    expect(seen).toEqual(['gesture-start', 'gesture-cancel']);
  });

  it('a pointer drag on the button is not a tap', async () => {
    const el = await mount({ cfg: dirCfg({ gesture: 'tap' }) });
    const seen = record(el);
    const button = q<HTMLElement>(el, '.button');
    pointer('pointerdown', button, 0);
    pointer('pointerup', button, 40);
    button.click();
    expect(seen).toEqual([]);
  });

  it('tap: Enter key emits start and done', async () => {
    const el = await mount({ cfg: dirCfg({ gesture: 'tap' }) });
    const seen = record(el);
    key(q(el, '.button'), 'keydown', 'Enter');
    expect(seen).toEqual(['gesture-start', 'gesture-done']);
  });
});

describe('disabled', () => {
  it.each([
    ['direction null', { direction: null }],
    ['busy', { busy: true }],
  ])('%s ignores input', async (_name, props) => {
    const el = await mount({
      ...(props as Partial<SafeToggleControl>),
      cfg: dirCfg({ gesture: 'tap' }),
    });
    const seen = record(el);
    const button = q<HTMLElement>(el, '.button');
    button.click();
    key(button, 'keydown', 'Enter');
    expect(seen).toEqual([]);
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('disabled slide ignores the handle', async () => {
    const el = await mount({ busy: true });
    const seen = record(el);
    const handle = q(el, '.handle');
    pointer('pointerdown', handle, 0);
    pointer('pointermove', handle, 500);
    pointer('pointerup', handle, 500);
    expect(seen).toEqual([]);
    expect(handle.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('stateColorCss', () => {
  it('builds the HA state color cascade', () => {
    expect(stateColorCss('lock.x', 'unlocked', true)).toBe(
      'var(--state-lock-unlocked-color, var(--state-lock-active-color, var(--state-active-color)))',
    );
    expect(stateColorCss('switch.x', 'off', false)).toBe(
      'var(--state-switch-off-color, var(--state-switch-inactive-color, var(--state-inactive-color)))',
    );
  });
});
