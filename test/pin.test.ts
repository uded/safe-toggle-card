import { describe, expect, it } from 'vitest';
import {
  hashPin,
  isPinHash,
  lockRemainingS,
  makeSalt,
  registerAttempt,
  verifyEntityPin,
  verifyPin,
  type LockoutState,
} from '../src/pin';
import type { HassEntity } from '../src/types';

const SALT = '00112233445566778899aabbccddeeff';
const VECTOR = `v1$${SALT}$f377124b2c2ffeb096001d94cb0e3df86fbe20ad9981335bc624b960d4d80924`;
const text = (state: string): HassEntity => ({
  entity_id: 'input_text.pin',
  state,
  attributes: {},
  last_changed: '',
  last_updated: '',
});

describe('hashPin / verifyPin', () => {
  it('matches the frozen v1 test vector', () => {
    expect(hashPin('1234', SALT)).toBe(VECTOR);
  });

  it('verifies the right PIN only', () => {
    expect(verifyPin('1234', VECTOR)).toBe(true);
    expect(verifyPin('1235', VECTOR)).toBe(false);
  });

  it('returns false for a malformed stored hash', () => {
    expect(verifyPin('1234', 'garbage')).toBe(false);
    expect(verifyPin('1234', 'v2$x$y')).toBe(false);
  });

  it('uses a fresh salt each time', () => {
    const a = hashPin('1234');
    const b = hashPin('1234');
    expect(a).not.toBe(b);
    expect(verifyPin('1234', a)).toBe(true);
    expect(verifyPin('1234', b)).toBe(true);
  });

  it('makeSalt is 32 lowercase hex chars', () => {
    expect(makeSalt()).toMatch(/^[0-9a-f]{32}$/);
  });

  it('isPinHash checks the format', () => {
    expect(isPinHash(VECTOR)).toBe(true);
    expect(isPinHash('v1$abc$def')).toBe(false);
  });
});

describe('verifyEntityPin', () => {
  it('compares trimmed values', () => {
    expect(verifyEntityPin(' 1234 ', text('1234'))).toBe('ok');
    expect(verifyEntityPin('1234', text(' 1234\n'))).toBe('ok');
    expect(verifyEntityPin('1235', text('1234'))).toBe('wrong');
  });

  it.each([['unavailable'], ['unknown'], ['']])('state %j fails closed', (s) => {
    expect(verifyEntityPin('1234', text(s))).toBe('unavailable');
  });

  it('missing entity fails closed', () => {
    expect(verifyEntityPin('1234', undefined)).toBe('unavailable');
  });
});

describe('lockout', () => {
  const cfg = { max_attempts: 5, lockout_s: 30 };
  const fresh: LockoutState = { attempts: 0, lockedUntil: null };
  const fail = (s: LockoutState, n: number, now: number) => {
    for (let i = 0; i < n; i++) s = registerAttempt(s, false, now, cfg);
    return s;
  };

  it('locks after max_attempts wrong entries', () => {
    const s = fail(fresh, 5, 0);
    expect(s.lockedUntil).toBe(30000);
    expect(lockRemainingS(s, 10000)).toBe(20);
  });

  it('does not lock before max_attempts', () => {
    const s = fail(fresh, 4, 0);
    expect(s.lockedUntil).toBeNull();
    expect(lockRemainingS(s, 0)).toBe(0);
  });

  it('correct attempt resets the counter', () => {
    const s = registerAttempt(fail(fresh, 3, 0), true, 0, cfg);
    expect(s).toEqual(fresh);
  });

  it('counts afresh after the lockout expires', () => {
    const s = registerAttempt(fail(fresh, 5, 0), false, 31000, cfg);
    expect(s).toEqual({ attempts: 1, lockedUntil: null });
  });

  it('rounds remaining seconds up', () => {
    expect(lockRemainingS({ attempts: 5, lockedUntil: 30000 }, 29001)).toBe(1);
  });

  it('lockout_s 0 never locks', () => {
    let s = fresh;
    for (let i = 0; i < 10; i++)
      s = registerAttempt(s, false, 0, { max_attempts: 5, lockout_s: 0 });
    expect(s.lockedUntil).toBeNull();
  });
});
