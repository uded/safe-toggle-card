import { LitElement, css, html, nothing } from 'lit';
import { resolveLang } from '../i18n';
import type { HomeAssistant } from '../types';
import './pin-field';
import {
  applyEditorData,
  buildSchema,
  computeHelper,
  computeLabel,
  editorData,
  usesPin,
  type HaFormSchema,
} from './schema';

type Raw = Record<string, any>;

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<{ createCardElement(c: object): HTMLElement }>;
  }
}

/** ha-form is lazy-loaded by HA; instantiating an entities card editor pulls it in. */
async function ensureHaForm(): Promise<void> {
  if (customElements.get('ha-form') || !window.loadCardHelpers) return;
  try {
    const helpers = await window.loadCardHelpers();
    const card = helpers.createCardElement({ type: 'entities', entities: [] });
    await (
      card.constructor as unknown as { getConfigElement(): Promise<unknown> }
    ).getConfigElement();
  } catch {
    // the form stays empty; HA shows the YAML editor as a fallback
  }
}

export class SafeToggleCardEditor extends LitElement {
  static properties = {
    hass: { attribute: false },
    config: { state: true },
    formReady: { state: true },
  };

  declare hass?: HomeAssistant;
  declare config: Raw;
  declare formReady: boolean;

  constructor() {
    super();
    this.config = {};
    this.formReady = false;
  }

  setConfig(config: Raw): void {
    this.config = config;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void ensureHaForm().then(() => (this.formReady = true));
  }

  private get uiLang() {
    return resolveLang('auto', this.hass);
  }

  private commit(config: Raw): void {
    this.config = config;
    this.dispatchEvent(
      new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }),
    );
  }

  private onValueChanged(e: CustomEvent<{ value: Raw }>): void {
    e.stopPropagation();
    this.commit(applyEditorData(this.config, e.detail.value));
  }

  private onPinHash(e: CustomEvent<{ hash: string | null }>): void {
    const pin: Raw = { source: 'inline', ...this.config.pin };
    if (e.detail.hash) pin.hash = e.detail.hash;
    else delete pin.hash;
    this.commit({ ...this.config, pin });
  }

  render() {
    if (!this.formReady) return nothing;
    const lang = this.uiLang;
    const inlinePin = usesPin(this.config) && this.config.pin?.source !== 'entity';
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${editorData(this.config)}
        .schema=${buildSchema(this.config, this.hass, lang)}
        .computeLabel=${(s: HaFormSchema) => computeLabel(s, lang)}
        .computeHelper=${(s: HaFormSchema) => computeHelper(s, this.config, lang)}
        @value-changed=${this.onValueChanged}
      ></ha-form>
      ${
        inlinePin
          ? html`<safe-toggle-pin-field
              .hasPin=${Boolean(this.config.pin?.hash)}
              .lang=${lang}
              @pin-hash-changed=${this.onPinHash}
            ></safe-toggle-pin-field>`
          : nothing
      }
    `;
  }

  static styles = css`
    safe-toggle-pin-field {
      display: block;
      margin-top: 16px;
    }
  `;
}

if (!customElements.get('safe-toggle-card-editor')) {
  customElements.define('safe-toggle-card-editor', SafeToggleCardEditor);
}
