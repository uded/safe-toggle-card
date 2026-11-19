import type { Direction, HassEntity } from './types';

/** Domains with on/off state served by their own turn_on / turn_off services. */
const ON_OFF_DOMAINS = new Set([
  'input_boolean',
  'switch',
  'light',
  'fan',
  'automation',
  'siren',
  'humidifier',
]);
const NAMED_DOMAINS = new Set([...ON_OFF_DOMAINS, 'lock', 'script', 'scene']);
const TRANSITIONAL = new Set(['locking', 'unlocking', 'opening']);
const UNAVAILABLE = new Set(['unavailable', 'unknown']);

export type VerbKey =
  | 'verb_turn_on'
  | 'verb_turn_off'
  | 'verb_unlock'
  | 'verb_lock'
  | 'verb_run'
  | 'verb_stop'
  | 'verb_activate';

export const domainOf = (entityId: string): string => entityId.split('.', 1)[0] ?? '';

export const isStateless = (entityId: string): boolean => domainOf(entityId) === 'scene';

export function isActive(s: HassEntity): boolean {
  if (domainOf(s.entity_id) === 'lock') return s.state !== 'locked';
  return s.state === 'on';
}

export const isTransitional = (s: HassEntity): boolean => TRANSITIONAL.has(s.state);

/** Named domains are always supported; any other entity only while its state is on/off. */
export function isSupported(entityId: string, s?: HassEntity): boolean {
  if (NAMED_DOMAINS.has(domainOf(entityId))) return true;
  return s?.state === 'on' || s?.state === 'off';
}

export function nextDirection(entityId: string, s?: HassEntity): Direction | null {
  if (!s || UNAVAILABLE.has(s.state) || isTransitional(s)) return null;
  if (isStateless(entityId)) return 'activate';
  return isActive(s) ? 'deactivate' : 'activate';
}

export function defaultService(
  entityId: string,
  dir: Direction,
): { domain: string; service: string } | null {
  const domain = domainOf(entityId);
  const on = dir === 'activate';
  switch (domain) {
    case 'lock':
      return { domain, service: on ? 'unlock' : 'lock' };
    case 'scene':
      return on ? { domain, service: 'turn_on' } : null;
    case 'script':
      return { domain, service: on ? 'turn_on' : 'turn_off' };
    default:
      return {
        domain: ON_OFF_DOMAINS.has(domain) ? domain : 'homeassistant',
        service: on ? 'turn_on' : 'turn_off',
      };
  }
}

export function targetVerbKey(entityId: string, dir: Direction): VerbKey {
  const on = dir === 'activate';
  switch (domainOf(entityId)) {
    case 'lock':
      return on ? 'verb_unlock' : 'verb_lock';
    case 'script':
      return on ? 'verb_run' : 'verb_stop';
    case 'scene':
      return 'verb_activate';
    default:
      return on ? 'verb_turn_on' : 'verb_turn_off';
  }
}
