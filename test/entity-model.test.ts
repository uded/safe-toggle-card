import { describe, expect, it } from 'vitest';
import {
  defaultService,
  isActive,
  isStateless,
  isSupported,
  isTransitional,
  nextDirection,
  targetVerbKey,
} from '../src/entity-model';
import type { HassEntity } from '../src/types';

const ent = (entity_id: string, state: string): HassEntity => ({
  entity_id,
  state,
  attributes: {},
  last_changed: '2026-11-19T10:00:00Z',
  last_updated: '2026-11-19T10:00:00Z',
});

describe('defaultService', () => {
  it.each([
    ['lock.door', 'activate', { domain: 'lock', service: 'unlock' }],
    ['lock.door', 'deactivate', { domain: 'lock', service: 'lock' }],
    ['light.x', 'activate', { domain: 'light', service: 'turn_on' }],
    ['light.x', 'deactivate', { domain: 'light', service: 'turn_off' }],
    ['input_boolean.x', 'activate', { domain: 'input_boolean', service: 'turn_on' }],
    ['switch.x', 'deactivate', { domain: 'switch', service: 'turn_off' }],
    ['script.x', 'activate', { domain: 'script', service: 'turn_on' }],
    ['script.x', 'deactivate', { domain: 'script', service: 'turn_off' }],
    ['scene.x', 'activate', { domain: 'scene', service: 'turn_on' }],
    ['scene.x', 'deactivate', null],
    ['climate.x', 'activate', { domain: 'homeassistant', service: 'turn_on' }],
    ['climate.x', 'deactivate', { domain: 'homeassistant', service: 'turn_off' }],
  ] as const)('%s %s', (id, dir, expected) => {
    expect(defaultService(id, dir)).toEqual(expected);
  });
});

describe('isActive', () => {
  it.each(['unlocked', 'open', 'jammed', 'unlocking', 'opening'])('lock %s is active', (s) => {
    expect(isActive(ent('lock.x', s))).toBe(true);
  });
  it('lock locked is inactive', () => expect(isActive(ent('lock.x', 'locked'))).toBe(false));
  it('switch on/off', () => {
    expect(isActive(ent('switch.x', 'on'))).toBe(true);
    expect(isActive(ent('switch.x', 'off'))).toBe(false);
  });
});

describe('isTransitional', () => {
  it.each(['locking', 'unlocking', 'opening'])('%s', (s) =>
    expect(isTransitional(ent('lock.x', s))).toBe(true),
  );
  it('locked is not', () => expect(isTransitional(ent('lock.x', 'locked'))).toBe(false));
});

describe('isStateless', () => {
  it('scene only', () => {
    expect(isStateless('scene.x')).toBe(true);
    expect(isStateless('script.x')).toBe(false);
  });
});

describe('isSupported', () => {
  it.each([
    ['climate.x', 'heat', false],
    ['climate.x', 'off', true],
    ['switch.x', 'unavailable', true],
    ['media_player.x', 'unavailable', false],
    ['lock.x', 'jammed', true],
    ['scene.x', '2026-11-19T10:00:00Z', true],
  ] as const)('%s in %s → %s', (id, s, expected) => {
    expect(isSupported(id, ent(id, s))).toBe(expected);
  });
  it('named domain without a state object is supported', () => {
    expect(isSupported('switch.x', undefined)).toBe(true);
  });
  it('unnamed domain without a state object is not', () => {
    expect(isSupported('climate.x', undefined)).toBe(false);
  });
});

describe('nextDirection', () => {
  it('on switch deactivates', () =>
    expect(nextDirection('switch.x', ent('switch.x', 'on'))).toBe('deactivate'));
  it('off switch activates', () =>
    expect(nextDirection('switch.x', ent('switch.x', 'off'))).toBe('activate'));
  it('locked lock activates (unlock)', () =>
    expect(nextDirection('lock.x', ent('lock.x', 'locked'))).toBe('activate'));
  it.each(['unavailable', 'unknown'])('%s → null', (s) =>
    expect(nextDirection('switch.x', ent('switch.x', s))).toBeNull(),
  );
  it('transitional → null', () =>
    expect(nextDirection('lock.x', ent('lock.x', 'locking'))).toBeNull());
  it('scene always activates', () =>
    expect(nextDirection('scene.x', ent('scene.x', '2026-11-19T10:00:00Z'))).toBe('activate'));
  it('missing entity → null', () => expect(nextDirection('switch.x', undefined)).toBeNull());
});

describe('targetVerbKey', () => {
  it.each([
    ['lock.x', 'activate', 'verb_unlock'],
    ['lock.x', 'deactivate', 'verb_lock'],
    ['script.x', 'activate', 'verb_run'],
    ['script.x', 'deactivate', 'verb_stop'],
    ['scene.x', 'activate', 'verb_activate'],
    ['switch.x', 'activate', 'verb_turn_on'],
    ['light.x', 'deactivate', 'verb_turn_off'],
  ] as const)('%s %s → %s', (id, dir, key) => {
    expect(targetVerbKey(id, dir)).toBe(key);
  });
});
