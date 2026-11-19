import type { HapticKind } from './machines/effects';

const VIBRATE: Record<HapticKind, number | number[]> = {
  light: 10,
  selection: 10,
  medium: 20,
  heavy: 30,
  success: [15, 40, 15],
  warning: [30, 60, 30],
  failure: [50, 50, 50],
};

/**
 * The HA frontend forwards the `haptic` event to the Companion apps;
 * navigator.vibrate covers Android browsers (iOS Safari has no vibration API).
 */
export function fireHaptic(el: HTMLElement, kind: HapticKind, enabled: boolean): void {
  if (!enabled) return;
  el.dispatchEvent(new CustomEvent('haptic', { detail: kind, bubbles: true, composed: true }));
  if (typeof navigator.vibrate === 'function') navigator.vibrate(VIBRATE[kind]);
}
