import { domainOf } from './entity-model';

/** HA's state color cascade: per state, per domain active/inactive, then global. */
export function stateColorCss(entityId: string, state: string, active: boolean): string {
  const domain = domainOf(entityId);
  const kind = active ? 'active' : 'inactive';
  return `var(--state-${domain}-${state}-color, var(--state-${domain}-${kind}-color, var(--state-${kind}-color)))`;
}

/** The theme colors HA's ui_color selector offers, each backed by a `--<name>-color` variable. */
export const THEME_COLORS = [
  'primary',
  'accent',
  'red',
  'pink',
  'purple',
  'deep-purple',
  'indigo',
  'blue',
  'light-blue',
  'cyan',
  'teal',
  'green',
  'light-green',
  'lime',
  'yellow',
  'amber',
  'orange',
  'deep-orange',
  'brown',
  'grey',
  'blue-grey',
  'black',
  'white',
] as const;

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

export const isCardColor = (v: string): boolean =>
  v === 'state' || HEX.test(v) || (THEME_COLORS as readonly string[]).includes(v);

/** The card's own color as CSS, or undefined when the state colors apply. */
export function cardColorCss(color: string | undefined): string | undefined {
  if (!color || color === 'state') return undefined;
  return HEX.test(color) ? color : `var(--${color}-color)`;
}
