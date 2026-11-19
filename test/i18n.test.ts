import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import pl from '../src/i18n/pl.json';
import { resolveLang, t } from '../src/i18n';
import type { HomeAssistant } from '../src/types';

const hass = (language: string) => ({ locale: { language }, language }) as HomeAssistant;

describe('t', () => {
  it('substitutes placeholders', () => {
    expect(t('slide_label', { lang: 'en', vars: { target: 'unlock' } })).toBe('Slide to unlock');
  });

  it('uses Polish bundle', () => {
    expect(t('slide_label', { lang: 'pl', vars: { target: 'odblokować' } })).toBe(
      'Przesuń, aby odblokować',
    );
  });

  it('first override wins', () => {
    expect(
      t('slide_label', { lang: 'en', overrides: [{ slide_label: 'A' }, { slide_label: 'B' }] }),
    ).toBe('A');
  });

  it('skips undefined override layers', () => {
    expect(t('slide_label', { lang: 'en', overrides: [undefined, { slide_label: 'B' }] })).toBe(
      'B',
    );
  });

  it('ignores empty override strings', () => {
    expect(t('cancelled', { lang: 'en', overrides: [{ cancelled: '' }] })).toBe('Cancelled');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(t('slide_label', { lang: 'en', overrides: [{ slide_label: 'x {foo}' }] })).toBe(
      'x {foo}',
    );
  });
});

describe('resolveLang', () => {
  it.each([
    ['pl', 'pl'],
    ['pl-PL', 'pl'],
    ['en-GB', 'en'],
    ['de', 'en'],
  ])('auto with %s → %s', (language, expected) => {
    expect(resolveLang('auto', hass(language))).toBe(expected);
  });

  it('explicit language wins', () => {
    expect(resolveLang('pl', hass('en'))).toBe('pl');
  });

  it('auto without hass → en', () => {
    expect(resolveLang('auto', undefined)).toBe('en');
  });
});

describe('bundles', () => {
  it('pl has every en key', () => {
    expect(Object.keys(pl).sort()).toEqual(Object.keys(en).sort());
  });

  it('contains verb keys used by the entity model', () => {
    for (const k of [
      'verb_turn_on',
      'verb_turn_off',
      'verb_unlock',
      'verb_lock',
      'verb_run',
      'verb_stop',
      'verb_activate',
    ]) {
      expect(en).toHaveProperty(k);
    }
  });

  it('has no dashes used as punctuation', () => {
    for (const s of [...Object.values(en), ...Object.values(pl)]) {
      expect(s).not.toMatch(/—|–|--/);
    }
  });
});
