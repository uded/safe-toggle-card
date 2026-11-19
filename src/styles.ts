import { domainOf } from './entity-model';

/** HA's state color cascade: per state, per domain active/inactive, then global. */
export function stateColorCss(entityId: string, state: string, active: boolean): string {
  const domain = domainOf(entityId);
  const kind = active ? 'active' : 'inactive';
  return `var(--state-${domain}-${state}-color, var(--state-${domain}-${kind}-color, var(--state-${kind}-color)))`;
}
