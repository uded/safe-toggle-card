// Minimal Home Assistant frontend types; only what the card touches.

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  locale: { language: string };
  language: string;
  callService(domain: string, service: string, data?: object, target?: object): Promise<unknown>;
  formatEntityState(stateObj: HassEntity): string;
}

export type Direction = 'activate' | 'deactivate';

export type Gesture = 'tap' | 'multi_tap' | 'slide';
export type ConfirmMode = 'none' | 'dialog' | 'pin';

/** Text overrides keyed by translation key; narrowed to TextKey in i18n. */
export type TextOverrides = Partial<Record<string, string>>;

export interface ActionConfig {
  perform_action: string;
  target?: object;
  data?: object;
}

export interface DirectionConfig {
  gesture: Gesture;
  taps: number;
  tap_window_ms: number;
  hold_ms: number;
  confirm: ConfirmMode;
  action?: ActionConfig;
  texts?: TextOverrides;
}

export interface PinConfig {
  source: 'inline' | 'entity';
  hash?: string;
  entity?: string;
  length: number;
  max_attempts: number;
  lockout_s: number;
}

export interface SafeToggleConfig {
  type: string;
  entity: string;
  name?: string;
  icon?: string;
  show_state: boolean;
  header_action: 'none' | 'more-info';
  haptics: boolean;
  language: 'auto' | 'en' | 'pl';
  activate: DirectionConfig;
  deactivate: DirectionConfig;
  pin?: PinConfig;
  texts?: TextOverrides;
}
