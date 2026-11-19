import { ConfigError } from './config';
import { defaultService } from './entity-model';
import type { Direction, HomeAssistant, SafeToggleConfig } from './types';

export interface ServiceCall {
  domain: string;
  service: string;
  data?: object;
  target?: object;
}

/** The per-direction custom action wins; otherwise the domain default on the card entity. */
export function buildCall(cfg: SafeToggleConfig, dir: Direction): ServiceCall {
  const custom = cfg[dir].action;
  if (custom) {
    const dot = custom.perform_action.indexOf('.');
    const call: ServiceCall = {
      domain: custom.perform_action.slice(0, dot),
      service: custom.perform_action.slice(dot + 1),
    };
    if (custom.data) call.data = custom.data;
    if (custom.target) call.target = custom.target;
    return call;
  }
  const svc = defaultService(cfg.entity, dir);
  if (!svc) throw new ConfigError(`${cfg.entity} has no ${dir} service`);
  return { ...svc, target: { entity_id: cfg.entity } };
}

export async function executeCall(hass: HomeAssistant, call: ServiceCall): Promise<void> {
  await hass.callService(call.domain, call.service, call.data, call.target);
}
