import { hashPin } from '../src/pin';
import '../src/safe-toggle-card';
import type { HomeAssistant } from '../src/types';
import { createDemoHass } from './mock-hass';

// Stand-ins for HA's own elements so the card renders outside Home Assistant.
const ICONS: Record<string, string> = { lock: '🔒', switch: '⏻', light: '💡', scene: '🎬' };
customElements.define(
  'ha-state-icon',
  class extends HTMLElement {
    set stateObj(s: { entity_id: string }) {
      this.textContent = ICONS[s.entity_id.split('.')[0]!] ?? '●';
    }
  },
);
customElements.define(
  'ha-icon',
  class extends HTMLElement {
    set icon(name: string) {
      this.textContent = name.endsWith('left') ? '‹' : '›';
    }
  },
);

customElements.define(
  'ha-card',
  class extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' }).innerHTML =
        // same fallbacks as HA's ha-card
        `<style>:host{display:block;background:var(--ha-card-background,var(--card-background-color,#fff));border-radius:var(--ha-card-border-radius,12px);border:var(--ha-card-border-width,1px) solid var(--ha-card-border-color,var(--divider-color,#e0e0e0));box-shadow:var(--ha-card-box-shadow,none)}</style><slot></slot>`;
    }
  },
);

const PIN = hashPin('1234');
const configs = [
  {
    entity: 'input_boolean.away_mode',
    name: 'Away mode (slide both ways)',
    icon: 'mdi:airplane',
    color: 'deep-purple',
  },
  {
    entity: 'lock.front_door',
    name: 'Front door (slide + PIN 1234 to unlock, tap to lock)',
    activate: { gesture: 'slide', confirm: 'pin' },
    deactivate: { gesture: 'tap' },
    pin: { source: 'inline', hash: PIN },
  },
  {
    entity: 'switch.pump',
    name: 'Pump (3 taps)',
    activate: { gesture: 'multi_tap', taps: 3 },
    deactivate: { gesture: 'multi_tap', taps: 3 },
  },
  {
    entity: 'light.garden',
    name: 'Garden light (tap + dialog)',
    activate: { gesture: 'tap', confirm: 'dialog' },
    deactivate: { gesture: 'tap', confirm: 'dialog' },
  },
  {
    entity: 'scene.away',
    name: 'Away scene (slide and hold)',
    activate: { gesture: 'slide', hold_ms: 800 },
  },
];

const initial = {
  'input_boolean.away_mode': { state: 'off' },
  'lock.front_door': { state: 'locked' },
  'switch.pump': { state: 'off' },
  'light.garden': { state: 'on' },
  'scene.away': { state: new Date(Date.now() - 3600_000).toISOString() },
};

let language = 'en';
let demo = createDemoHass(initial, language);
const container = document.getElementById('cards')!;

function mount() {
  container.replaceChildren();
  const cards = configs.map((c) => {
    const el = document.createElement('safe-toggle-card') as HTMLElement & {
      setConfig(c: object): void;
      hass: HomeAssistant;
    };
    el.setConfig({ type: 'custom:safe-toggle-card', ...c });
    container.append(el);
    return el;
  });
  demo.subscribe((hass) => cards.forEach((el) => (el.hass = hass)));
}
mount();

document.addEventListener('demo-log', (e) => {
  const log = document.getElementById('log')!;
  log.textContent = `${new Date().toLocaleTimeString()} ${(e as CustomEvent).detail}\n${log.textContent}`;
});
document.getElementById('theme')!.onclick = () => {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
};
document.getElementById('dir')!.onclick = () => {
  document.dir = document.dir === 'rtl' ? 'ltr' : 'rtl';
  mount();
};
document.getElementById('lang')!.onclick = () => {
  language = language === 'en' ? 'pl' : 'en';
  demo = createDemoHass(initial, language);
  mount();
};
