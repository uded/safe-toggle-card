import type { ServiceCall } from '../../src/actions';
import type { HassEntity, HomeAssistant } from '../../src/types';

export type MockHass = HomeAssistant & {
  calls: ServiceCall[];
  /** HA hands cards a new hass object on every change; so does this. */
  next(id: string, patch: Partial<HassEntity>): MockHass;
  fail?: Error;
};

function entity(id: string, p: Partial<HassEntity>): HassEntity {
  return {
    entity_id: id,
    state: 'off',
    attributes: {},
    last_changed: '2026-11-19T10:00:00Z',
    last_updated: '2026-11-19T10:00:00Z',
    ...p,
  };
}

export function mockHass(
  states: Record<string, Partial<HassEntity>>,
  opts: { language?: string; calls?: ServiceCall[] } = {},
): MockHass {
  const language = opts.language ?? 'en';
  const calls = opts.calls ?? [];
  const hass: MockHass = {
    states: Object.fromEntries(Object.entries(states).map(([id, p]) => [id, entity(id, p)])),
    locale: { language },
    language,
    calls,
    formatEntityState: (s) => s.state.charAt(0).toUpperCase() + s.state.slice(1),
    async callService(domain, service, data, target) {
      const call: ServiceCall = { domain, service };
      if (data) call.data = data;
      if (target) call.target = target;
      calls.push(call);
      if (hass.fail) throw hass.fail;
    },
    next(id, patch) {
      const n = mockHass(
        { ...hass.states, [id]: { ...hass.states[id], ...patch } },
        { language, calls },
      );
      n.fail = hass.fail;
      return n;
    },
  };
  return hass;
}
