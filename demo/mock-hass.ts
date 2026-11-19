// A pretend Home Assistant for the demo page: services flip state after a short delay.
import type { HassEntity, HomeAssistant } from '../src/types';

type Listener = (hass: HomeAssistant) => void;

const NEXT: Record<string, Record<string, string>> = {
  unlock: { lock: 'unlocked' },
  lock: { lock: 'locked' },
  turn_on: { default: 'on' },
  turn_off: { default: 'off' },
};

export function createDemoHass(initial: Record<string, Partial<HassEntity>>, language = 'en') {
  let states: Record<string, HassEntity> = Object.fromEntries(
    Object.entries(initial).map(([id, p]) => [
      id,
      { entity_id: id, state: 'off', attributes: {}, last_changed: '', last_updated: '', ...p },
    ]),
  );
  const listeners = new Set<Listener>();
  const log = (msg: string) => document.dispatchEvent(new CustomEvent('demo-log', { detail: msg }));

  const set = (id: string, state: string) => {
    const now = new Date().toISOString();
    states = { ...states, [id]: { ...states[id]!, state, last_changed: now, last_updated: now } };
    const hass = build();
    listeners.forEach((l) => l(hass));
  };

  function build(): HomeAssistant {
    return {
      states,
      language,
      locale: { language },
      formatEntityState: (s) => s.state.charAt(0).toUpperCase() + s.state.slice(1),
      async callService(domain, service, data, target) {
        log(`${domain}.${service} ${JSON.stringify({ ...data, ...target })}`);
        const id = (target as { entity_id?: string } | undefined)?.entity_id;
        if (!id || !states[id]) return;
        const d = id.split('.')[0]!;
        if (d === 'scene') return setTimeout(() => set(id, new Date().toISOString()), 300);
        const transitional = d === 'lock' ? (service === 'unlock' ? 'unlocking' : 'locking') : null;
        if (transitional) set(id, transitional);
        const next = NEXT[service]?.[d] ?? NEXT[service]?.default;
        if (next) setTimeout(() => set(id, next), 600);
      },
    };
  }

  return {
    get hass() {
      return build();
    },
    subscribe(l: Listener) {
      listeners.add(l);
      l(build());
    },
  };
}
