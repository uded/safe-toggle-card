import type { TextKey } from '../i18n';

export type HapticKind =
  'success' | 'warning' | 'failure' | 'light' | 'medium' | 'heavy' | 'selection';

/** Side effects requested by a reducer; components run them. */
export type Effect =
  | { type: 'haptic'; kind: HapticKind }
  | { type: 'announce'; key: TextKey; vars?: Record<string, string | number> }
  /** Schedule a { type: 'timeout', id } event back into the same reducer. */
  | { type: 'timer'; id: string; ms: number }
  | { type: 'cancelTimer'; id: string }
  | { type: 'nudge' }
  /** The gesture is complete. */
  | { type: 'done' };

export interface Step<S> {
  state: S;
  effects: Effect[];
}

/** Named timeouts; setting an id again replaces the pending one. */
export class TimerBag {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  set(id: string, ms: number, cb: () => void): void {
    this.clear(id);
    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        cb();
      }, ms),
    );
  }

  clear(id: string): void {
    const handle = this.timers.get(id);
    if (handle !== undefined) clearTimeout(handle);
    this.timers.delete(id);
  }

  clearAll(): void {
    for (const id of [...this.timers.keys()]) this.clear(id);
  }
}
