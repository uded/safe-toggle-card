import { describe, expect, it } from 'vitest';
import { ConfigError, PRESETS, normalizeConfig, presetOf, stubConfig } from '../src/config';
import type { HomeAssistant } from '../src/types';

const base = { type: 'custom:safe-toggle-card', entity: 'lock.x' };
const HASH = 'v1$00112233445566778899aabbccddeeff$' + 'a'.repeat(64);

describe('normalizeConfig', () => {
  it('fills defaults', () => {
    const c = normalizeConfig(base);
    const dir = { gesture: 'slide', confirm: 'none', hold_ms: 0, taps: 3, tap_window_ms: 2000 };
    expect(c.activate).toMatchObject(dir);
    expect(c.deactivate).toMatchObject(dir);
    expect(c).toMatchObject({
      show_state: true,
      header_action: 'none',
      haptics: true,
      language: 'auto',
    });
  });

  it('keeps provided values', () => {
    const c = normalizeConfig({ ...base, activate: { gesture: 'multi_tap', taps: 5 } });
    expect(c.activate.gesture).toBe('multi_tap');
    expect(c.activate.taps).toBe(5);
  });

  it('rejects non-object config', () => {
    expect(() => normalizeConfig(null)).toThrow(ConfigError);
  });

  it('requires entity', () => {
    expect(() => normalizeConfig({ type: base.type })).toThrow(/entity/);
  });

  it('requires a pin block when a direction uses pin', () => {
    expect(() => normalizeConfig({ ...base, activate: { confirm: 'pin' } })).toThrow(/pin/);
  });

  it('requires a hash for inline pin', () => {
    expect(() =>
      normalizeConfig({ ...base, activate: { confirm: 'pin' }, pin: { source: 'inline' } }),
    ).toThrow(/hash/);
  });

  it('requires an entity for entity pin', () => {
    expect(() =>
      normalizeConfig({ ...base, activate: { confirm: 'pin' }, pin: { source: 'entity' } }),
    ).toThrow(/pin\.entity/);
  });

  it('rejects a malformed hash', () => {
    expect(() =>
      normalizeConfig({
        ...base,
        activate: { confirm: 'pin' },
        pin: { source: 'inline', hash: 'abc' },
      }),
    ).toThrow(/hash/);
  });

  it('fills pin defaults', () => {
    const c = normalizeConfig({
      ...base,
      activate: { confirm: 'pin' },
      pin: { source: 'inline', hash: HASH },
    });
    expect(c.pin).toMatchObject({ length: 4, max_attempts: 5, lockout_s: 30 });
  });

  it.each([
    ['taps', 1],
    ['taps', 11],
    ['hold_ms', -1],
    ['hold_ms', 5001],
    ['tap_window_ms', 400],
    ['tap_window_ms', 10001],
  ])('rejects %s = %s', (field, value) => {
    expect(() => normalizeConfig({ ...base, activate: { [field]: value } })).toThrow(
      new RegExp(field),
    );
  });

  it.each([
    ['length', 3],
    ['length', 9],
    ['max_attempts', 0],
    ['lockout_s', 3601],
  ])('rejects pin.%s = %s', (field, value) => {
    expect(() =>
      normalizeConfig({
        ...base,
        activate: { confirm: 'pin' },
        pin: { source: 'inline', hash: HASH, [field]: value },
      }),
    ).toThrow(new RegExp(field));
  });

  it('rejects unknown enum values', () => {
    expect(() => normalizeConfig({ ...base, activate: { gesture: 'swipe' } })).toThrow(/gesture/);
    expect(() => normalizeConfig({ ...base, deactivate: { confirm: 'yes' } })).toThrow(/confirm/);
  });

  it('normalises legacy service to perform_action', () => {
    const c = normalizeConfig({ ...base, activate: { action: { service: 'script.x' } } });
    expect(c.activate.action).toEqual({ perform_action: 'script.x' });
  });

  it('rejects an action without perform_action', () => {
    expect(() => normalizeConfig({ ...base, activate: { action: { data: {} } } })).toThrow(
      /perform_action/,
    );
  });
});

describe('presets', () => {
  it('slide_hold uses 800 ms', () => {
    expect(PRESETS.slide_hold).toEqual({ gesture: 'slide', hold_ms: 800, confirm: 'none' });
  });

  it('presetOf recognises every preset', () => {
    for (const [id, p] of Object.entries(PRESETS)) {
      const pinBlock = { source: 'inline', hash: HASH };
      const d = normalizeConfig({ ...base, activate: p, pin: pinBlock }).activate;
      expect(presetOf(d)).toBe(id);
    }
  });

  it('presetOf returns custom for an off-preset combination', () => {
    const d = normalizeConfig({ ...base, activate: { gesture: 'slide', hold_ms: 300 } }).activate;
    expect(presetOf(d)).toBe('custom');
  });
});

describe('stubConfig', () => {
  it('prefers a lock', () => {
    const hass = {
      states: { 'switch.a': { state: 'off' }, 'lock.b': { state: 'locked' } },
    } as unknown as HomeAssistant;
    expect(stubConfig(hass)).toMatchObject({
      entity: 'lock.b',
      activate: { gesture: 'slide' },
      deactivate: { gesture: 'tap' },
    });
  });

  it('falls back to a switch', () => {
    const hass = { states: { 'switch.a': { state: 'off' } } } as unknown as HomeAssistant;
    expect(stubConfig(hass).entity).toBe('switch.a');
  });
});
