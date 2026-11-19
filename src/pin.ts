// Dashboard PIN: a speed bump against kids and accidents, not security.
// SHA-256 comes from @noble/hashes because crypto.subtle is missing on plain http.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import type { HassEntity } from './types';

const PIN_HASH_RE = /^v1\$([0-9a-f]{32})\$([0-9a-f]{64})$/;

export const makeSalt = (): string => bytesToHex(randomBytes(16));

export const isPinHash = (s: string): boolean => PIN_HASH_RE.test(s);

/** Frozen format: v1$<saltHex>$<hex(SHA-256(UTF-8(saltHex + pin)))>. */
export function hashPin(pin: string, saltHex: string = makeSalt()): string {
  return `v1$${saltHex}$${bytesToHex(sha256(utf8ToBytes(saltHex + pin)))}`;
}

export function verifyPin(pin: string, stored: string): boolean {
  const m = PIN_HASH_RE.exec(stored);
  return m !== null && hashPin(pin, m[1]) === stored;
}

export function verifyEntityPin(
  pin: string,
  entityState?: HassEntity,
): 'ok' | 'wrong' | 'unavailable' {
  const expected = entityState?.state.trim() ?? '';
  if (expected === '' || expected === 'unavailable' || expected === 'unknown') return 'unavailable';
  return pin.trim() === expected ? 'ok' : 'wrong';
}

export interface LockoutState {
  attempts: number;
  lockedUntil: number | null;
}

export function registerAttempt(
  s: LockoutState,
  ok: boolean,
  now: number,
  cfg: { max_attempts: number; lockout_s: number },
): LockoutState {
  if (ok) return { attempts: 0, lockedUntil: null };
  const expired = s.lockedUntil !== null && now >= s.lockedUntil;
  const attempts = (expired ? 0 : s.attempts) + 1;
  if (cfg.lockout_s > 0 && attempts >= cfg.max_attempts) {
    return { attempts, lockedUntil: now + cfg.lockout_s * 1000 };
  }
  return { attempts, lockedUntil: null };
}

export function lockRemainingS(s: LockoutState, now: number): number {
  if (s.lockedUntil === null || now >= s.lockedUntil) return 0;
  return Math.ceil((s.lockedUntil - now) / 1000);
}
