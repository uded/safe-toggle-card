import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../src/components/safe-toggle-dialog';
import type { SafeToggleDialog } from '../../src/components/safe-toggle-dialog';
import { hashPin } from '../../src/pin';
import type { HomeAssistant, PinConfig } from '../../src/types';

const inlinePin: PinConfig = {
  source: 'inline',
  hash: hashPin('1234'),
  length: 4,
  max_attempts: 5,
  lockout_s: 30,
};

async function mount(props: Partial<SafeToggleDialog>) {
  const el = document.createElement('safe-toggle-dialog') as SafeToggleDialog;
  Object.assign(
    el,
    { lang: 'en', haptics: false, heading: 'Confirm', text: 'Unlock door?' },
    props,
  );
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const q = <T extends Element>(el: SafeToggleDialog, sel: string) =>
  el.shadowRoot!.querySelector(sel) as T;
const press = async (el: SafeToggleDialog, keys: string) => {
  for (const k of keys) q<HTMLButtonElement>(el, `button[data-key="${k}"]`).click();
  await el.updateComplete;
};
const events = (el: HTMLElement) => {
  const seen: string[] = [];
  for (const n of ['confirm-ok', 'pin-ok', 'dialog-cancel'])
    el.addEventListener(n, () => seen.push(n));
  return seen;
};

describe('safe-toggle-dialog: confirm', () => {
  afterEach(() => document.body.replaceChildren());

  it('opens with heading and text', async () => {
    const el = await mount({ kind: 'confirm' });
    expect(q<HTMLDialogElement>(el, 'dialog').open).toBe(true);
    expect(el.shadowRoot!.textContent).toContain('Confirm');
    expect(el.shadowRoot!.textContent).toContain('Unlock door?');
  });

  it('confirm button fires confirm-ok', async () => {
    const el = await mount({ kind: 'confirm' });
    const seen = events(el);
    q<HTMLButtonElement>(el, 'button.ok').click();
    expect(seen).toEqual(['confirm-ok']);
  });

  it('Escape (dialog cancel event) fires dialog-cancel', async () => {
    const el = await mount({ kind: 'confirm' });
    const seen = events(el);
    q<HTMLDialogElement>(el, 'dialog').dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(seen).toEqual(['dialog-cancel']);
  });

  it('closes when kind becomes null', async () => {
    const el = await mount({ kind: 'confirm' });
    el.kind = null;
    await el.updateComplete;
    expect(q<HTMLDialogElement>(el, 'dialog').open).toBe(false);
  });

  it('returns focus to the previously focused element', async () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    const el = await mount({ kind: 'confirm' });
    el.kind = null;
    await el.updateComplete;
    expect(document.activeElement).toBe(button);
  });
});

describe('safe-toggle-dialog: pin', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('auto-submits a correct PIN', async () => {
    const el = await mount({ kind: 'pin', pin: inlinePin });
    const seen = events(el);
    await press(el, '1234');
    expect(seen).toEqual(['pin-ok']);
  });

  it('rejects a wrong PIN and clears the digits', async () => {
    const el = await mount({ kind: 'pin', pin: inlinePin });
    const seen = events(el);
    await press(el, '1235');
    expect(seen).toEqual([]);
    expect(el.shadowRoot!.querySelectorAll('.dot.filled')).toHaveLength(0);
    expect(q(el, '.message').textContent).toContain('Wrong PIN');
  });

  it('accepts physical keyboard digits and Backspace', async () => {
    const el = await mount({ kind: 'pin', pin: inlinePin });
    const seen = events(el);
    const dialog = q<HTMLDialogElement>(el, 'dialog');
    for (const key of ['1', '2', '9', 'Backspace', '3', '4']) {
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    }
    await el.updateComplete;
    expect(seen).toEqual(['pin-ok']);
  });

  it('locks the keypad after max attempts, then unlocks', async () => {
    const el = await mount({ kind: 'pin', pin: inlinePin });
    for (let i = 0; i < 5; i++) await press(el, '0000');
    const digit = q<HTMLButtonElement>(el, 'button[data-key="1"]');
    expect(digit.disabled).toBe(true);
    expect(q(el, '.message').textContent).toContain('30 s');
    vi.advanceTimersByTime(30000);
    await el.updateComplete;
    expect(q<HTMLButtonElement>(el, 'button[data-key="1"]').disabled).toBe(false);
  });

  it('fails closed when the PIN entity is unavailable', async () => {
    const hass = {
      states: {
        'input_text.pin': {
          entity_id: 'input_text.pin',
          state: 'unavailable',
          attributes: {},
          last_changed: '',
          last_updated: '',
        },
      },
    } as unknown as HomeAssistant;
    const el = await mount({
      kind: 'pin',
      hass,
      pin: { ...inlinePin, source: 'entity', hash: undefined, entity: 'input_text.pin' },
    });
    const seen = events(el);
    await press(el, '1234');
    q<HTMLButtonElement>(el, 'button[data-key="submit"]').click();
    await el.updateComplete;
    expect(seen).toEqual([]);
    expect(q(el, '.message').textContent).toContain('unavailable');
  });

  it('entity source auto-submits at the entity value length', async () => {
    const hass = {
      states: {
        'input_text.pin': {
          entity_id: 'input_text.pin',
          state: '123456',
          attributes: {},
          last_changed: '',
          last_updated: '',
        },
      },
    } as unknown as HomeAssistant;
    const el = await mount({
      kind: 'pin',
      hass,
      pin: { ...inlinePin, source: 'entity', hash: undefined, entity: 'input_text.pin' },
    });
    const seen = events(el);
    await press(el, '1234');
    expect(seen).toEqual([]);
    await press(el, '56');
    expect(seen).toEqual(['pin-ok']);
  });
});
