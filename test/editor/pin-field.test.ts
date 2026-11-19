import { afterEach, describe, expect, it } from 'vitest';
import '../../src/editor/pin-field';
import type { SafeTogglePinField } from '../../src/editor/pin-field';
import { verifyPin } from '../../src/pin';

async function mount(hasPin: boolean) {
  const el = document.createElement('safe-toggle-pin-field') as unknown as SafeTogglePinField;
  Object.assign(el, { hasPin, lang: 'en' });
  document.body.append(el);
  await el.updateComplete;
  return el;
}
const q = <T extends Element>(el: SafeTogglePinField, sel: string) =>
  el.shadowRoot!.querySelector(sel) as T;
const capture = (el: HTMLElement) => {
  const seen: (string | null)[] = [];
  el.addEventListener('pin-hash-changed', (e) => seen.push((e as CustomEvent).detail.hash));
  return seen;
};

afterEach(() => document.body.replaceChildren());

describe('safe-toggle-pin-field', () => {
  it('Set emits a hash that verifies and never the plaintext', async () => {
    const el = await mount(false);
    const seen = capture(el);
    q<HTMLInputElement>(el, 'input').value = '1234';
    q<HTMLButtonElement>(el, 'button.save').click();
    expect(seen).toHaveLength(1);
    expect(verifyPin('1234', seen[0]!)).toBe(true);
    expect(seen[0]).not.toContain('1234');
    expect(q<HTMLInputElement>(el, 'input').value).toBe('');
  });

  it('rejects non-digit or too short PINs', async () => {
    const el = await mount(false);
    const seen = capture(el);
    for (const v of ['12', '12ab', '123456789']) {
      q<HTMLInputElement>(el, 'input').value = v;
      q<HTMLButtonElement>(el, 'button.save').click();
      await el.updateComplete;
    }
    expect(seen).toEqual([]);
    expect(el.shadowRoot!.textContent).toContain('4 to 8 digits');
  });

  it('Remove emits null', async () => {
    const el = await mount(true);
    const seen = capture(el);
    expect(el.shadowRoot!.textContent).toContain('PIN is set');
    q<HTMLButtonElement>(el, 'button.remove').click();
    expect(seen).toEqual([null]);
  });

  it('Change switches back to the input', async () => {
    const el = await mount(true);
    q<HTMLButtonElement>(el, 'button.change').click();
    await el.updateComplete;
    expect(q(el, 'input')).not.toBeNull();
  });
});
