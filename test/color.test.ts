// The card-level `color` option: same values as HA's Tile card.
import { afterEach, describe, expect, it } from 'vitest';
import type { SafeToggleControl } from '../src/components/safe-toggle-control';
import { ConfigError, normalizeConfig } from '../src/config';
import {
  applyEditorData,
  buildSchema,
  computeLabel,
  type HaFormSchema,
} from '../src/editor/schema';
import '../src/safe-toggle-card';
import type { SafeToggleCard } from '../src/safe-toggle-card';
import { cardColorCss } from '../src/styles';
import { mockHass } from './helpers/mock-hass';

const base = { type: 'custom:safe-toggle-card', entity: 'input_boolean.away' };

afterEach(() => document.body.replaceChildren());

describe('cardColorCss', () => {
  it('maps a theme color name to its HA variable', () => {
    expect(cardColorCss('red')).toBe('var(--red-color)');
    expect(cardColorCss('deep-purple')).toBe('var(--deep-purple-color)');
    expect(cardColorCss('primary')).toBe('var(--primary-color)');
  });

  it('passes a hex color through', () => {
    expect(cardColorCss('#8e44ad')).toBe('#8e44ad');
  });

  it('returns nothing for state, so the state colors apply', () => {
    expect(cardColorCss('state')).toBeUndefined();
    expect(cardColorCss(undefined)).toBeUndefined();
  });
});

describe('config color', () => {
  it('defaults to state', () => {
    expect(normalizeConfig(base).color).toBe('state');
  });

  it('accepts theme names and hex values', () => {
    expect(normalizeConfig({ ...base, color: 'teal' }).color).toBe('teal');
    expect(normalizeConfig({ ...base, color: '#abc' }).color).toBe('#abc');
  });

  it('rejects anything else', () => {
    expect(() => normalizeConfig({ ...base, color: 'url(x)' })).toThrow(ConfigError);
    expect(() => normalizeConfig({ ...base, color: 42 })).toThrow(ConfigError);
  });
});

describe('card with a color', () => {
  async function mount(state: string, extra: object = {}) {
    const el = document.createElement('safe-toggle-card') as unknown as SafeToggleCard;
    el.setConfig({ ...base, haptics: false, color: 'purple', ...extra });
    el.hass = mockHass({ 'input_boolean.away': { state } });
    document.body.append(el);
    await el.updateComplete;
    const ctl = el.shadowRoot!.querySelector('safe-toggle-control') as SafeToggleControl;
    const icon = el.shadowRoot!.querySelector('.icon') as HTMLElement;
    return { ctl, icon };
  }

  it('colors the slider in both directions', async () => {
    expect((await mount('off')).ctl.targetColor).toBe('var(--purple-color)');
    document.body.replaceChildren();
    expect((await mount('on')).ctl.targetColor).toBe('var(--purple-color)');
  });

  it('colors the header icon only while active, like the Tile card', async () => {
    expect((await mount('on')).icon.style.getPropertyValue('--icon-color')).toBe(
      'var(--purple-color)',
    );
    document.body.replaceChildren();
    expect((await mount('off')).icon.style.getPropertyValue('--icon-color')).toContain('inactive');
  });

  it('keeps state colors when color is state', async () => {
    const { ctl } = await mount('off', { color: 'state' });
    expect(ctl.targetColor).toContain('--state-input_boolean-on-color');
  });
});

describe('editor color field', () => {
  const schema = buildSchema(base, mockHass({}), 'en');
  const names = schema.map((s) => s.name);

  it('uses the ui_color selector with state as default, right after icon', () => {
    const field = schema.find((s) => s.name === 'color') as HaFormSchema;
    expect(field.selector).toEqual({
      ui_color: { default_color: 'state', include_state: true },
    });
    expect(names.indexOf('color')).toBe(names.indexOf('icon') + 1);
  });

  it('stores a picked color and drops the state default from the YAML', () => {
    expect(applyEditorData(base, { ...base, color: 'teal' }).color).toBe('teal');
    expect(
      applyEditorData({ ...base, color: 'teal' }, { ...base, color: 'state' }),
    ).not.toHaveProperty('color');
  });

  it('has a label in both languages', () => {
    expect(computeLabel({ name: 'color' }, 'en')).toBe('Color');
    expect(computeLabel({ name: 'color' }, 'pl')).toBe('Kolor');
  });
});
