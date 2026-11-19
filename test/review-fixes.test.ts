// Regression tests for the findings of the final branch review.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeCall } from '../src/actions';
import '../src/components/safe-toggle-control';
import type { SafeToggleControl } from '../src/components/safe-toggle-control';
import { normalizeConfig } from '../src/config';
import '../src/editor/safe-toggle-card-editor';
import type { SafeToggleCardEditor } from '../src/editor/safe-toggle-card-editor';
import { applyEditorData, editorData } from '../src/editor/schema';
import '../src/safe-toggle-card';
import type { SafeToggleCard } from '../src/safe-toggle-card';
import type { HomeAssistant } from '../src/types';
import { mockHass } from './helpers/mock-hass';

const dirCfg = (d: object) =>
  normalizeConfig({ type: 'x', entity: 'lock.x', activate: d }).activate;

async function control(props: Partial<SafeToggleControl> = {}) {
  const el = document.createElement('safe-toggle-control') as SafeToggleControl;
  Object.assign(
    el,
    { direction: 'activate', cfg: dirCfg({}), label: 'Slide', lang: 'en', haptics: false },
    props,
  );
  document.body.append(el);
  await el.updateComplete;
  return el;
}
const part = (el: SafeToggleControl, sel: string) => el.shadowRoot!.querySelector(sel)!;
const pointer = (type: string, target: Element, clientX: number, pointerId = 1) =>
  target.dispatchEvent(
    new PointerEvent(type, { clientX, clientY: 0, pointerId, bubbles: true, composed: true }),
  );
const key = (target: Element, k: string) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true }));
const events = (el: HTMLElement) => {
  const seen: string[] = [];
  for (const n of ['gesture-start', 'gesture-done', 'gesture-cancel']) {
    el.addEventListener(n, () => seen.push(n));
  }
  return seen;
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('review #1: pointer input needs an active pointer drag', () => {
  it('hover after a keyboard step does not drive the slider', async () => {
    const el = await control();
    const seen = events(el);
    key(part(el, '.handle'), 'ArrowRight');
    pointer('pointermove', part(el, '.track'), 500);
    pointer('pointerup', part(el, '.track'), 500);
    expect(seen).not.toContain('gesture-done');
  });

  it('hover after a keyboard step never starts a hold', async () => {
    const el = await control({ cfg: dirCfg({ hold_ms: 800 }) });
    const seen = events(el);
    key(part(el, '.handle'), 'ArrowRight');
    pointer('pointermove', part(el, '.track'), 500);
    vi.advanceTimersByTime(2000);
    expect(seen).not.toContain('gesture-done');
  });

  it('a second pointer cannot move or release the drag', async () => {
    const el = await control();
    const seen = events(el);
    const handle = part(el, '.handle');
    pointer('pointerdown', handle, 0, 1);
    pointer('pointermove', handle, 500, 2);
    pointer('pointerup', handle, 500, 2);
    expect(seen).toEqual(['gesture-start']);
  });
});

describe('review #4: the track hint waits for a real tap', () => {
  it('a scroll that starts on the track does not nudge', async () => {
    const el = await control();
    const haptic = vi.fn();
    el.addEventListener('haptic', haptic);
    el.haptics = true;
    pointer('pointerdown', part(el, '.track'), 10);
    pointer('pointercancel', part(el, '.track'), 10);
    await el.updateComplete;
    expect(part(el, '.track').classList.contains('nudge')).toBe(false);
    expect(haptic).not.toHaveBeenCalled();
  });
});

describe('review #6: hidden page cancels a drag', () => {
  it('visibility hidden returns the slider', async () => {
    const el = await control({ cfg: dirCfg({ hold_ms: 800 }) });
    const seen = events(el);
    const handle = part(el, '.handle');
    pointer('pointerdown', handle, 0);
    pointer('pointermove', handle, 500);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(2000);
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    expect(seen).toEqual(['gesture-start', 'gesture-cancel']);
  });
});

describe('iOS: multi-tap button opts out of double-tap zoom', () => {
  it('declares touch-action: manipulation on the button', () => {
    const css = (customElements.get('safe-toggle-control') as unknown as { styles: object }).styles;
    expect(String(css)).toMatch(/\.button\s*\{[^}]*touch-action:\s*manipulation/);
  });
});

describe('review #7: HA does not raise a second error toast', () => {
  it('calls the service with notifyOnError false', async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    await executeCall({ callService } as unknown as HomeAssistant, {
      domain: 'lock',
      service: 'unlock',
    });
    expect(callService).toHaveBeenCalledWith('lock', 'unlock', undefined, undefined, false);
  });
});

describe('review #2: PIN length follows the PIN that was set', () => {
  it('a 6 digit PIN sets pin.length 6', async () => {
    const el = document.createElement('safe-toggle-card-editor') as unknown as SafeToggleCardEditor;
    el.hass = mockHass({ 'lock.x': { state: 'locked' } });
    el.setConfig({
      type: 'custom:safe-toggle-card',
      entity: 'lock.x',
      activate: { confirm: 'pin' },
    });
    document.body.append(el);
    await vi.advanceTimersByTimeAsync(0);
    await el.updateComplete;
    const seen: Record<string, any>[] = [];
    el.addEventListener('config-changed', (e) => seen.push((e as CustomEvent).detail.config));
    const field = el.shadowRoot!.querySelector('safe-toggle-pin-field')!;
    await (field as unknown as { updateComplete: Promise<void> }).updateComplete;
    field.shadowRoot!.querySelector('input')!.value = '123456';
    (field.shadowRoot!.querySelector('button.save') as HTMLElement).click();
    expect(seen[0]!.pin.length).toBe(6);
  });
});

describe('review #3: custom action survives the ui_action selector', () => {
  const base = { type: 'custom:safe-toggle-card', entity: 'lock.x' };

  it('choosing perform-action before a service is kept in the config', () => {
    const data = editorData(base);
    const out = applyEditorData(base, {
      ...data,
      activate: { ...data.activate, action: { action: 'perform-action' } },
    });
    expect(out.activate.action).toEqual({ action: 'perform-action' });
    expect(normalizeConfig(out).activate.action).toBeUndefined();
  });

  it('a stored action is shown as perform-action in the form', () => {
    const data = editorData({ ...base, activate: { action: { perform_action: 'script.x' } } });
    expect(data.activate.action).toEqual({ action: 'perform-action', perform_action: 'script.x' });
  });

  it('a chosen service is kept and still normalises', () => {
    const data = editorData(base);
    const out = applyEditorData(base, {
      ...data,
      activate: {
        ...data.activate,
        action: { action: 'perform-action', perform_action: 'script.gate' },
      },
    });
    expect(normalizeConfig(out).activate.action).toEqual({ perform_action: 'script.gate' });
  });
});

describe('review #5: card resets mid-gesture', () => {
  async function card(config: object, hass = mockHass({ 'lock.x': { state: 'locked' } })) {
    const el = document.createElement('safe-toggle-card') as unknown as SafeToggleCard;
    el.setConfig({ type: 'custom:safe-toggle-card', entity: 'lock.x', haptics: false, ...config });
    el.hass = hass;
    document.body.append(el);
    await el.updateComplete;
    const ctl = el.shadowRoot!.querySelector('safe-toggle-control') as SafeToggleControl;
    await ctl.updateComplete;
    return { el, hass, handle: ctl.shadowRoot!.querySelector('.handle')! };
  }

  it('setConfig while the pointer is down drops the gesture', async () => {
    const { el, hass, handle } = await card({});
    pointer('pointerdown', handle, 0);
    pointer('pointermove', handle, 0.5);
    el.setConfig({ type: 'custom:safe-toggle-card', entity: 'lock.x', haptics: false });
    await el.updateComplete;
    pointer('pointermove', handle, 500);
    pointer('pointerup', handle, 500);
    await vi.advanceTimersByTimeAsync(0);
    expect(hass.calls).toEqual([]);
  });

  it('removal during a hold never calls', async () => {
    const { el, hass, handle } = await card({ activate: { hold_ms: 800 } });
    pointer('pointerdown', handle, 0);
    pointer('pointermove', handle, 500);
    el.remove();
    await vi.advanceTimersByTimeAsync(5000);
    expect(vi.getTimerCount()).toBe(0);
    expect(hass.calls).toEqual([]);
  });
});
