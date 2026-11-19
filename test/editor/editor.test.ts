import { afterEach, describe, expect, it } from 'vitest';
import { normalizeConfig } from '../../src/config';
import '../../src/editor/safe-toggle-card-editor';
import type { SafeToggleCardEditor } from '../../src/editor/safe-toggle-card-editor';
import { verifyPin } from '../../src/pin';
import { mockHass } from '../helpers/mock-hass';

async function mount(config: object) {
  const el = document.createElement('safe-toggle-card-editor') as unknown as SafeToggleCardEditor;
  el.hass = mockHass({ 'lock.x': { state: 'locked' } });
  el.setConfig({ type: 'custom:safe-toggle-card', ...config });
  document.body.append(el);
  await new Promise((r) => setTimeout(r, 0));
  await el.updateComplete;
  return el;
}
const changes = (el: HTMLElement) => {
  const seen: Record<string, any>[] = [];
  el.addEventListener('config-changed', (e) => seen.push((e as CustomEvent).detail.config));
  return seen;
};

afterEach(() => document.body.replaceChildren());

describe('normalizeConfig lenient mode', () => {
  it('accepts a config without entity or PIN', () => {
    const c = normalizeConfig({ type: 'x', activate: { confirm: 'pin' } }, { lenient: true });
    expect(c.entity).toBe('');
    expect(c.pin).toBeUndefined();
  });
});

describe('safe-toggle-card-editor', () => {
  it('maps ha-form value-changed to config-changed', async () => {
    const el = await mount({ entity: 'lock.x' });
    const seen = changes(el);
    const form = el.shadowRoot!.querySelector('ha-form')!;
    const data = (form as unknown as { data: Record<string, any> }).data;
    form.dispatchEvent(
      new CustomEvent('value-changed', {
        detail: { value: { ...data, activate: { ...data.activate, preset: 'tap_confirm' } } },
      }),
    );
    expect(seen[0]!.activate).toMatchObject({ gesture: 'tap', confirm: 'dialog' });
  });

  it('pin field writes only the hash into the config', async () => {
    const el = await mount({ entity: 'lock.x', activate: { confirm: 'pin' } });
    const seen = changes(el);
    const field = el.shadowRoot!.querySelector('safe-toggle-pin-field')!;
    await (field as unknown as { updateComplete: Promise<void> }).updateComplete;
    field.shadowRoot!.querySelector('input')!.value = '4321';
    (field.shadowRoot!.querySelector('button.save') as HTMLElement).click();
    expect(verifyPin('4321', seen[0]!.pin.hash)).toBe(true);
    expect(JSON.stringify(seen[0])).not.toContain('4321');
    expect(() => normalizeConfig(seen[0])).not.toThrow();
  });

  it('hides the pin field for an entity source', async () => {
    const el = await mount({
      entity: 'lock.x',
      activate: { confirm: 'pin' },
      pin: { source: 'entity', entity: 'input_text.code' },
    });
    expect(el.shadowRoot!.querySelector('safe-toggle-pin-field')).toBeNull();
  });
});
