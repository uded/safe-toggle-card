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
