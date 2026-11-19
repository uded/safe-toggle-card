import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { buildCall, executeCall } from './actions';
import './components/safe-toggle-control';
import type { SafeToggleControl } from './components/safe-toggle-control';
import './components/safe-toggle-dialog';
import { normalizeConfig, stubConfig } from './config';
import {
  domainOf,
  isActive,
  isStateless,
  isTransitional,
  nextDirection,
  targetVerbKey,
} from './entity-model';
import { fireHaptic } from './haptics';
import { resolveLang, t, type Lang, type TextKey } from './i18n';
import { TimerBag } from './machines/effects';
import { flowReducer, type FlowEvent, type FlowState } from './machines/flow';
import { stateColorCss } from './styles';
import type { Direction, HassEntity, HomeAssistant, SafeToggleConfig } from './types';

declare global {
  interface Window {
    customCards?: { type: string; name: string; description: string; preview?: boolean }[];
  }
}

const GESTURE_LABEL: Record<SafeToggleConfig['activate']['gesture'], TextKey> = {
  slide: 'slide_label',
  tap: 'tap_label',
  multi_tap: 'multi_tap_label',
};

function relativeTime(iso: string, lang: Lang): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const s = Math.round((then - Date.now()) / 1000);
  const fmt = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(s) >= size) return fmt.format(Math.round(s / size), unit);
  }
  return fmt.format(s, 'second');
}

/** State the entity ends up in after switching in `dir`; drives the target color. */
function targetState(entityId: string, dir: Direction): string {
  if (domainOf(entityId) === 'lock') return dir === 'activate' ? 'unlocked' : 'locked';
  return dir === 'activate' ? 'on' : 'off';
}

export class SafeToggleCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { state: true },
    flow: { state: true },
    dialogKind: { state: true },
    liveText: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config?: SafeToggleConfig;
  declare flow: FlowState;
  declare dialogKind: 'confirm' | 'pin' | null;
  declare liveText: string;

  private readonly timers = new TimerBag();
  private lastState?: string;
  /** Bumped on setConfig and disconnect so late service-call results are dropped. */
  private generation = 0;

  constructor() {
    super();
    this.flow = { phase: 'idle' };
    this.dialogKind = null;
    this.liveText = '';
  }

  static async getConfigElement(): Promise<HTMLElement> {
    await import('./editor/safe-toggle-card-editor');
    return document.createElement('safe-toggle-card-editor');
  }

  static getStubConfig(hass: HomeAssistant) {
    return stubConfig(hass);
  }

  setConfig(raw: unknown): void {
    const config = normalizeConfig(raw);
    this.resetAll();
    this.config = config;
  }

  getCardSize(): number {
    return 2;
  }

  getGridOptions() {
    return { columns: 6, rows: 2, min_columns: 3 };
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.resetAll();
  }

  private resetAll(): void {
    this.generation++;
    this.timers.clearAll();
    this.flow = { phase: 'idle' };
    this.dialogKind = null;
    this.control?.reset();
  }

  private get control(): SafeToggleControl | null {
    return this.renderRoot?.querySelector('safe-toggle-control') ?? null;
  }

  private get stateObj(): HassEntity | undefined {
    return this.config ? this.hass?.states[this.config.entity] : undefined;
  }

  private get uiLang(): Lang {
    return resolveLang(this.config?.language ?? 'auto', this.hass);
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('hass')) return;
    const state = this.stateObj?.state;
    const prev = this.lastState;
    this.lastState = state;
    if (prev !== undefined && state !== undefined && state !== prev) {
      this.dispatchFlow({ type: 'entityState', state });
    }
  }

  // Flow

  private dispatchFlow(e: FlowEvent): void {
    const config = this.config;
    if (!config) return;
    const before = this.flow.phase;
    const { state, effects } = flowReducer(this.flow, e, {
      confirm: (d) => config[d].confirm,
      stateless: isStateless(config.entity),
    });
    this.flow = state;
    const generation = this.generation;
    for (const fx of effects) {
      switch (fx.type) {
        case 'dialog':
          this.dialogKind = fx.kind;
          break;
        case 'execute':
          this.execute(fx.direction, generation);
          break;
        case 'toast':
          this.dispatchEvent(
            new CustomEvent('hass-notification', {
              detail: { message: t('error', { lang: this.uiLang, vars: { message: fx.message } }) },
              bubbles: true,
              composed: true,
            }),
          );
          break;
        case 'timer':
          this.timers.set(fx.id, fx.ms, () => this.dispatchFlow({ type: 'timeout', id: fx.id }));
          break;
        case 'cancelTimer':
          this.timers.clear(fx.id);
          break;
        case 'haptic':
          fireHaptic(this, fx.kind, config.haptics);
          break;
        case 'announce':
          this.liveText = this.text(fx.key, fx.vars);
          break;
        default:
          break;
      }
    }
    if (state.phase === 'idle' && before !== 'idle') this.control?.reset();
  }

  private execute(dir: Direction, generation: number): void {
    const { config, hass } = this;
    if (!config || !hass) return;
    let call;
    try {
      call = buildCall(config, dir);
    } catch (err) {
      queueMicrotask(() => this.dispatchFlow({ type: 'callError', message: String(err) }));
      return;
    }
    executeCall(hass, call).then(
      () => {
        if (generation === this.generation) this.dispatchFlow({ type: 'callOk' });
      },
      (err: unknown) => {
        if (generation !== this.generation) return;
        const message = err instanceof Error ? err.message : String(err);
        this.dispatchFlow({ type: 'callError', message });
      },
    );
  }

  // Derived view state

  /** The flow's captured direction while it runs; otherwise what the entity state implies. */
  private get direction(): Direction | null {
    if (!this.config) return null;
    if (this.flow.phase !== 'idle') return this.flow.direction;
    return nextDirection(this.config.entity, this.stateObj);
  }

  private text(key: TextKey, vars?: Record<string, string | number>): string {
    const dir = this.direction;
    const overrides = [dir ? this.config?.[dir].texts : undefined, this.config?.texts];
    return t(key, { lang: this.uiLang, overrides, vars });
  }

  private get name(): string {
    const s = this.stateObj;
    const friendly = s?.attributes.friendly_name;
    return (
      this.config?.name ?? (typeof friendly === 'string' ? friendly : (this.config?.entity ?? ''))
    );
  }

  private targetVerb(dir: Direction): string {
    return this.text(targetVerbKey(this.config!.entity, dir));
  }

  private onGestureStart = () => {
    const dir = this.direction;
    const s = this.stateObj;
    if (!dir || !s) return;
    this.dispatchFlow({ type: 'gestureStart', direction: dir, entityState: s.state });
  };
  private onGestureDone = () => this.dispatchFlow({ type: 'gestureDone' });
  private onGestureCancel = () => this.dispatchFlow({ type: 'gestureCancel' });
  private onAnnounce = (e: CustomEvent<string>) => (this.liveText = e.detail);

  private onHeader(): void {
    if (this.config?.header_action !== 'more-info') return;
    this.dispatchEvent(
      new CustomEvent('hass-more-info', {
        detail: { entityId: this.config.entity },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // Render

  private renderHeader(s: HassEntity) {
    const config = this.config!;
    const unavailable = s.state === 'unavailable' || s.state === 'unknown';
    const color = unavailable
      ? 'var(--state-unavailable-color, var(--disabled-color))'
      : stateColorCss(config.entity, s.state, isStateless(config.entity) || isActive(s));
    const stateText = isStateless(config.entity)
      ? this.text('last_activated', { time: relativeTime(s.state, this.uiLang) })
      : (this.hass?.formatEntityState?.(s) ?? s.state);
    const interactive = config.header_action === 'more-info';
    return html`
      <div
        class="header ${interactive ? 'interactive' : ''}"
        role=${interactive ? 'button' : nothing}
        tabindex=${interactive ? 0 : nothing}
        @click=${this.onHeader}
        @keydown=${(e: KeyboardEvent) => (e.key === 'Enter' ? this.onHeader() : undefined)}
      >
        <div class="icon" style="--icon-color: ${color}">
          <ha-state-icon .hass=${this.hass} .stateObj=${s} .icon=${config.icon}></ha-state-icon>
        </div>
        <div class="info">
          <span class="name">${this.name}</span>
          ${config.show_state ? html`<span class="state">${stateText}</span>` : nothing}
        </div>
      </div>
    `;
  }

  render() {
    const config = this.config;
    if (!config) return nothing;
    const s = this.stateObj;
    const dir = this.direction;
    const dirCfg = config[dir ?? 'activate'];
    const verb = this.targetVerb(dir ?? 'activate');
    const label = this.text(GESTURE_LABEL[dirCfg.gesture], { target: verb, n: dirCfg.taps });
    const busy =
      this.flow.phase === 'executing' ||
      this.flow.phase === 'pending' ||
      (s !== undefined && isTransitional(s));
    const targetColor = stateColorCss(
      config.entity,
      targetState(config.entity, dir ?? 'activate'),
      dir !== 'deactivate',
    );
    const rtl = this.hass?.translationMetadata?.dir === 'rtl' || document.dir === 'rtl';
    return html`
      <ha-card>
        ${
          s
            ? this.renderHeader(s)
            : html`<div class="header warning">
                ${this.text('entity_not_found', { entity: config.entity })}
              </div>`
        }
        <safe-toggle-control
          .direction=${s ? dir : null}
          .cfg=${dirCfg}
          .busy=${busy}
          .label=${label}
          .targetColor=${targetColor}
          .lang=${this.uiLang}
          .haptics=${config.haptics}
          .rtl=${rtl}
          @gesture-start=${this.onGestureStart}
          @gesture-done=${this.onGestureDone}
          @gesture-cancel=${this.onGestureCancel}
          @announce=${this.onAnnounce}
        ></safe-toggle-control>
        <safe-toggle-dialog
          .kind=${this.dialogKind}
          .heading=${this.text('confirm_title')}
          .text=${this.text('confirm_text', { target: verb, name: this.name })}
          .pin=${config.pin}
          .hass=${this.hass}
          .lang=${this.uiLang}
          .haptics=${config.haptics}
          @confirm-ok=${() => this.dispatchFlow({ type: 'confirmOk' })}
          @pin-ok=${() => this.dispatchFlow({ type: 'pinOk' })}
          @dialog-cancel=${() => this.dispatchFlow({ type: 'dialogCancel' })}
        ></safe-toggle-dialog>
        <div class="sr-only" aria-live="polite">${this.liveText}</div>
      </ha-card>
    `;
  }

  static styles = css`
    ha-card {
      height: 100%;
      box-sizing: border-box;
      padding: 10px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 12px;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 36px;
    }
    .header.interactive {
      cursor: pointer;
    }
    .header.warning {
      color: var(--warning-color, #ffa600);
      font-size: var(--ha-font-size-m, 14px);
    }
    .icon {
      flex: none;
      width: 36px;
      height: 36px;
      border-radius: var(--tile-icon-border-radius, 50%);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--icon-color);
      background: color-mix(in srgb, var(--icon-color) 20%, transparent);
      --mdc-icon-size: 24px;
    }
    .info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .name {
      font-size: var(--ha-font-size-m, 14px);
      font-weight: var(--ha-font-weight-medium, 500);
      line-height: 20px;
      color: var(--primary-text-color);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .state {
      font-size: var(--ha-font-size-s, 12px);
      line-height: 16px;
      color: var(--secondary-text-color);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `;
}

if (!customElements.get('safe-toggle-card')) {
  customElements.define('safe-toggle-card', SafeToggleCard);
  window.customCards = window.customCards ?? [];
  window.customCards.push({
    type: 'safe-toggle-card',
    name: 'Safe Toggle Card',
    description: 'Toggle an entity behind a slide, multi-tap, confirmation or PIN.',
    preview: true,
  });
}
