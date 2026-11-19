import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/safe-toggle-card';
import type { SafeToggleCard } from '../../src/safe-toggle-card';
import type { SafeToggleControl } from '../../src/components/safe-toggle-control';
import type { SafeToggleDialog } from '../../src/components/safe-toggle-dialog';
import { hashPin } from '../../src/pin';
import { mockHass, type MockHass } from '../helpers/mock-hass';

const PIN = hashPin('1234');

async function mount(config: object, hass: MockHass) {
  const el = document.createElement('safe-toggle-card') as unknown as SafeToggleCard;
  el.setConfig({ type: 'custom:safe-toggle-card', haptics: false, ...config });
  el.hass = hass;
  document.body.append(el);
  await settle(el);
  return el;
}

async function settle(el: SafeToggleCard) {
  await el.updateComplete;
  await control(el)?.updateComplete;
  await dialog(el)?.updateComplete;
}

const control = (el: SafeToggleCard) =>
  el.shadowRoot!.querySelector('safe-toggle-control') as SafeToggleControl | null;
const dialog = (el: SafeToggleCard) =>
  el.shadowRoot!.querySelector('safe-toggle-dialog') as SafeToggleDialog | null;
const handle = (el: SafeToggleCard) => control(el)!.shadowRoot!.querySelector('.handle')!;
const live = (el: SafeToggleCard) => el.shadowRoot!.querySelector('[aria-live]')!.textContent ?? '';

const pointer = (type: string, target: Element, clientX: number) =>
  target.dispatchEvent(
    new PointerEvent(type, { clientX, clientY: 0, pointerId: 1, bubbles: true, composed: true }),
  );
const grab = (el: SafeToggleCard) => {
  pointer('pointerdown', handle(el), 0);
  pointer('pointermove', handle(el), 0.5);
};
const finish = (el: SafeToggleCard) => {
  pointer('pointermove', handle(el), 500);
  pointer('pointerup', handle(el), 500);
};
const slide = (el: SafeToggleCard) => {
  grab(el);
  finish(el);
};

async function flush(el: SafeToggleCard) {
  for (let i = 0; i < 3; i++) {
    await Promise.resolve();
    await settle(el);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('safe-toggle-card: happy path', () => {
  it('slide unlocks once, waits for HA, then finishes', async () => {
    const hass = mockHass({ 'lock.x': { state: 'locked' } });
    const el = await mount({ entity: 'lock.x' }, hass);
    slide(el);
    await flush(el);
    expect(hass.calls).toEqual([
      { domain: 'lock', service: 'unlock', target: { entity_id: 'lock.x' } },
    ]);
    expect(control(el)!.busy).toBe(true);
    el.hass = hass.next('lock.x', { state: 'unlocked' });
    await flush(el);
    expect(control(el)!.busy).toBe(false);
    expect(live(el)).toContain('Done');
    expect(control(el)!.direction).toBe('deactivate');
  });

  it('shows name and formatted state in the header', async () => {
    const hass = mockHass({ 'lock.x': { state: 'locked', attributes: { friendly_name: 'Door' } } });
    const el = await mount({ entity: 'lock.x' }, hass);
    const text = el.shadowRoot!.querySelector('.header')!.textContent!;
    expect(text).toContain('Door');
    expect(text).toContain('Locked');
  });

  it('slide + PIN: correct PIN calls, wrong PIN does not', async () => {
    const hass = mockHass({ 'lock.x': { state: 'locked' } });
    const el = await mount(
      { entity: 'lock.x', activate: { confirm: 'pin' }, pin: { hash: PIN } },
      hass,
    );
    slide(el);
    await flush(el);
    expect(dialog(el)!.kind).toBe('pin');
    const key = (k: string) =>
      (dialog(el)!.shadowRoot!.querySelector(`button[data-key="${k}"]`) as HTMLElement).click();
    for (const k of '9999') key(k);
    await flush(el);
    expect(hass.calls).toEqual([]);
    for (const k of '1234') key(k);
    await flush(el);
    expect(hass.calls).toHaveLength(1);
    expect(dialog(el)!.kind).toBeNull();
  });

  it('Polish texts with a Polish HA locale', async () => {
    const hass = mockHass({ 'lock.x': { state: 'locked' } }, { language: 'pl' });
    const el = await mount({ entity: 'lock.x' }, hass);
    expect(control(el)!.label).toBe('Przesuń, aby odblokować');
  });
});

describe('safe-toggle-card: review focus', () => {
  it('missing entity renders a warning and disables the control', async () => {
    const el = await mount({ entity: 'lock.gone' }, mockHass({}));
    expect(el.shadowRoot!.textContent).toContain('Entity not found: lock.gone');
    expect(control(el)!.direction).toBeNull();
  });

  it('attribute-only updates do not interrupt a drag', async () => {
    let hass = mockHass({ 'lock.x': { state: 'locked' } });
    const el = await mount({ entity: 'lock.x' }, hass);
    grab(el);
    for (let i = 0; i < 5; i++) {
      hass = hass.next('lock.x', { attributes: { tick: i } });
      el.hass = hass;
      await settle(el);
    }
    finish(el);
    await flush(el);
    expect(hass.calls).toHaveLength(1);
  });

  it('a state change mid-drag cancels without calling', async () => {
    const hass = mockHass({ 'lock.x': { state: 'locked' } });
    const el = await mount({ entity: 'lock.x' }, hass);
    grab(el);
    el.hass = hass.next('lock.x', { state: 'unlocked' });
    await flush(el);
    finish(el);
    await flush(el);
    expect(hass.calls).toEqual([]);
    expect(live(el)).toContain('State changed');
  });

  it('removal during pending leaves no timers or calls behind', async () => {
    const hass = mockHass({ 'lock.x': { state: 'locked' } });
    const el = await mount({ entity: 'lock.x' }, hass);
    slide(el);
    await flush(el);
    el.remove();
    vi.advanceTimersByTime(20000);
    expect(vi.getTimerCount()).toBe(0);
    expect(hass.calls).toHaveLength(1);
  });

  it('removal mid multi-tap never calls', async () => {
    const hass = mockHass({ 'switch.x': { state: 'off' } });
    const el = await mount({ entity: 'switch.x', activate: { gesture: 'multi_tap' } }, hass);
    const button = control(el)!.shadowRoot!.querySelector('.button') as HTMLElement;
    button.click();
    vi.advanceTimersByTime(200);
    button.click();
    el.remove();
    vi.advanceTimersByTime(5000);
    expect(vi.getTimerCount()).toBe(0);
    expect(hass.calls).toEqual([]);
  });

  it('setConfig mid-drag resets everything', async () => {
    const hass = mockHass({ 'lock.x': { state: 'locked' } });
    const el = await mount({ entity: 'lock.x', activate: { confirm: 'dialog' } }, hass);
    slide(el);
    await flush(el);
    expect(dialog(el)!.kind).toBe('confirm');
    el.setConfig({ type: 'custom:safe-toggle-card', entity: 'lock.x', haptics: false });
    await flush(el);
    expect(dialog(el)!.kind).toBeNull();
    expect(handle(el).getAttribute('aria-valuenow')).toBe('0');
    slide(el);
    await flush(el);
    expect(hass.calls).toHaveLength(1);
  });
});

describe('safe-toggle-card: header, errors, special states', () => {
  it('header is inert by default', async () => {
    const el = await mount({ entity: 'lock.x' }, mockHass({ 'lock.x': { state: 'locked' } }));
    const spy = vi.fn();
    el.addEventListener('hass-more-info', spy);
    (el.shadowRoot!.querySelector('.header') as HTMLElement).click();
    expect(spy).not.toHaveBeenCalled();
  });

  it('header_action more-info opens the dialog', async () => {
    const el = await mount(
      { entity: 'lock.x', header_action: 'more-info' },
      mockHass({ 'lock.x': { state: 'locked' } }),
    );
    const spy = vi.fn();
    el.addEventListener('hass-more-info', spy);
    (el.shadowRoot!.querySelector('.header') as HTMLElement).click();
    expect(spy).toHaveBeenCalledOnce();
    expect((spy.mock.calls[0]![0] as CustomEvent).detail).toEqual({ entityId: 'lock.x' });
  });

  it('a failing call raises a HA notification and returns to idle', async () => {
    const hass = mockHass({ 'lock.x': { state: 'locked' } });
    hass.fail = new Error('Lock jammed');
    const el = await mount({ entity: 'lock.x' }, hass);
    const spy = vi.fn();
    el.addEventListener('hass-notification', spy);
    slide(el);
    await flush(el);
    expect((spy.mock.calls[0]![0] as CustomEvent).detail.message).toContain('Lock jammed');
    expect(control(el)!.busy).toBe(false);
  });

  it('scene shows last activated and only activates', async () => {
    const hass = mockHass({ 'scene.x': { state: '2026-11-19T09:00:00Z' } });
    vi.setSystemTime(new Date('2026-11-19T10:00:00Z'));
    const el = await mount({ entity: 'scene.x' }, hass);
    expect(el.shadowRoot!.querySelector('.header')!.textContent).toContain('Last activated');
    expect(control(el)!.direction).toBe('activate');
    slide(el);
    await flush(el);
    expect(hass.calls).toEqual([
      { domain: 'scene', service: 'turn_on', target: { entity_id: 'scene.x' } },
    ]);
  });

  it('transitional lock shows a busy control', async () => {
    const el = await mount({ entity: 'lock.x' }, mockHass({ 'lock.x': { state: 'unlocking' } }));
    expect(control(el)!.busy).toBe(true);
    expect(el.shadowRoot!.querySelector('.header')!.textContent).toContain('Unlocking');
  });

  it('unavailable switch is disabled without a spinner', async () => {
    const el = await mount(
      { entity: 'switch.x' },
      mockHass({ 'switch.x': { state: 'unavailable' } }),
    );
    expect(control(el)!.direction).toBeNull();
    expect(control(el)!.busy).toBe(false);
  });

  it('exposes grid options and card size', async () => {
    const el = await mount({ entity: 'lock.x' }, mockHass({ 'lock.x': { state: 'locked' } }));
    expect(el.getCardSize()).toBe(2);
    expect(el.getGridOptions()).toEqual({ columns: 6, rows: 2, min_columns: 3 });
  });

  it('invalid config throws from setConfig', () => {
    const el = document.createElement('safe-toggle-card') as unknown as SafeToggleCard;
    expect(() => el.setConfig({ type: 'custom:safe-toggle-card' })).toThrow(/entity/);
  });
});
