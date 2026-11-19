import type {
  ActionConfig,
  ConfirmMode,
  DirectionConfig,
  Gesture,
  HomeAssistant,
  PinConfig,
  SafeToggleConfig,
  TextOverrides,
} from './types';
import { isPinHash } from './pin';

/** Thrown by setConfig; HA renders the message as an error card. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

export type PresetId =
  | 'tap'
  | 'tap_confirm'
  | 'tap_pin'
  | 'multi_tap'
  | 'multi_tap_pin'
  | 'slide'
  | 'slide_hold'
  | 'slide_pin';

type PresetFields = Pick<DirectionConfig, 'gesture' | 'hold_ms' | 'confirm'>;

export const PRESETS: Record<PresetId, PresetFields> = {
  tap: { gesture: 'tap', hold_ms: 0, confirm: 'none' },
  tap_confirm: { gesture: 'tap', hold_ms: 0, confirm: 'dialog' },
  tap_pin: { gesture: 'tap', hold_ms: 0, confirm: 'pin' },
  multi_tap: { gesture: 'multi_tap', hold_ms: 0, confirm: 'none' },
  multi_tap_pin: { gesture: 'multi_tap', hold_ms: 0, confirm: 'pin' },
  slide: { gesture: 'slide', hold_ms: 0, confirm: 'none' },
  slide_hold: { gesture: 'slide', hold_ms: 800, confirm: 'none' },
  slide_pin: { gesture: 'slide', hold_ms: 0, confirm: 'pin' },
};

export function presetOf(d: DirectionConfig): PresetId | 'custom' {
  for (const [id, p] of Object.entries(PRESETS) as [PresetId, PresetFields][]) {
    if (p.gesture === d.gesture && p.hold_ms === d.hold_ms && p.confirm === d.confirm) return id;
  }
  return 'custom';
}

const GESTURES: readonly Gesture[] = ['tap', 'multi_tap', 'slide'];
const CONFIRMS: readonly ConfirmMode[] = ['none', 'dialog', 'pin'];

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(raw: Raw, key: string, def: number, min: number, max: number, path: string): number {
  const v = raw[key] ?? def;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
    throw new ConfigError(`${path}${key} must be a number from ${min} to ${max}`);
  }
  return v;
}

function oneOf<T extends string>(
  raw: Raw,
  key: string,
  values: readonly T[],
  def: T,
  path: string,
): T {
  const v = raw[key] ?? def;
  if (!values.includes(v as T)) {
    throw new ConfigError(`${path}${key} must be one of: ${values.join(', ')}`);
  }
  return v as T;
}

function texts(v: unknown, path: string): TextOverrides | undefined {
  if (v === undefined) return undefined;
  if (!isObject(v)) throw new ConfigError(`${path}texts must be a map of strings`);
  return v as TextOverrides;
}

function action(v: unknown, path: string): ActionConfig | undefined {
  if (v === undefined) return undefined;
  if (!isObject(v)) throw new ConfigError(`${path}action must be an object`);
  const name = v.perform_action ?? v.service;
  // the editor's ui_action selector: type picked, no service yet, or "none"
  if (name === undefined && (v.action === 'perform-action' || v.action === 'none')) {
    return undefined;
  }
  if (typeof name !== 'string' || !name.includes('.')) {
    throw new ConfigError(`${path}action.perform_action must look like domain.service`);
  }
  const out: ActionConfig = { perform_action: name };
  if (isObject(v.target)) out.target = v.target;
  if (isObject(v.data)) out.data = v.data;
  return out;
}

function direction(v: unknown, key: string): DirectionConfig {
  const raw = isObject(v) ? v : {};
  const p = `${key}.`;
  const out: DirectionConfig = {
    gesture: oneOf(raw, 'gesture', GESTURES, 'slide', p),
    taps: num(raw, 'taps', 3, 2, 10, p),
    tap_window_ms: num(raw, 'tap_window_ms', 2000, 500, 10000, p),
    hold_ms: num(raw, 'hold_ms', 0, 0, 5000, p),
    confirm: oneOf(raw, 'confirm', CONFIRMS, 'none', p),
  };
  const a = action(raw.action, p);
  if (a) out.action = a;
  const t = texts(raw.texts, p);
  if (t) out.texts = t;
  return out;
}

function pin(v: unknown): PinConfig {
  if (!isObject(v)) throw new ConfigError('pin is required when a direction uses confirm: pin');
  const p = 'pin.';
  const out: PinConfig = {
    source: oneOf(v, 'source', ['inline', 'entity'] as const, 'inline', p),
    length: num(v, 'length', 4, 4, 8, p),
    max_attempts: num(v, 'max_attempts', 5, 1, 20, p),
    lockout_s: num(v, 'lockout_s', 30, 0, 3600, p),
  };
  if (out.source === 'inline') {
    if (typeof v.hash !== 'string' || !isPinHash(v.hash)) {
      throw new ConfigError('pin.hash is missing or malformed; set the PIN in the visual editor');
    }
    out.hash = v.hash;
  } else {
    if (typeof v.entity !== 'string' || !v.entity.startsWith('input_text.')) {
      throw new ConfigError('pin.entity must be an input_text entity');
    }
    out.entity = v.entity;
  }
  return out;
}

/**
 * `lenient` is for the editor: a config being edited may lack an entity or a PIN yet,
 * and the form still needs the defaults filled in.
 */
export function normalizeConfig(raw: unknown, opts: { lenient?: boolean } = {}): SafeToggleConfig {
  if (!isObject(raw)) throw new ConfigError('Invalid configuration');
  const hasEntity = typeof raw.entity === 'string' && raw.entity.includes('.');
  if (!hasEntity && !opts.lenient) throw new ConfigError('entity is required');
  const cfg: SafeToggleConfig = {
    type: String(raw.type ?? 'custom:safe-toggle-card'),
    entity: hasEntity ? (raw.entity as string) : '',
    show_state: raw.show_state !== false,
    header_action: oneOf(raw, 'header_action', ['none', 'more-info'] as const, 'none', ''),
    haptics: raw.haptics !== false,
    language: oneOf(raw, 'language', ['auto', 'en', 'pl'] as const, 'auto', ''),
    activate: direction(raw.activate, 'activate'),
    deactivate: direction(raw.deactivate, 'deactivate'),
  };
  if (typeof raw.name === 'string') cfg.name = raw.name;
  if (typeof raw.icon === 'string') cfg.icon = raw.icon;
  const t = texts(raw.texts, '');
  if (t) cfg.texts = t;
  if ((cfg.activate.confirm === 'pin' || cfg.deactivate.confirm === 'pin') && !opts.lenient) {
    cfg.pin = pin(raw.pin);
  }
  return cfg;
}

export function stubConfig(hass: HomeAssistant): Partial<SafeToggleConfig> {
  const ids = Object.keys(hass.states);
  const entity =
    ids.find((id) => id.startsWith('lock.')) ?? ids.find((id) => id.startsWith('switch.')) ?? '';
  return {
    type: 'custom:safe-toggle-card',
    entity,
    activate: { ...PRESETS.slide, taps: 3, tap_window_ms: 2000 },
    deactivate: { ...PRESETS.tap, taps: 3, tap_window_ms: 2000 },
  };
}
