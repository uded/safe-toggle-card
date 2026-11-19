import { LitElement, css, html, nothing, type PropertyValues } from 'lit';
import { fireHaptic } from '../haptics';
import { t, type Lang, type TextKey } from '../i18n';
import {
  lockRemainingS,
  registerAttempt,
  verifyEntityPin,
  verifyPin,
  type LockoutState,
} from '../pin';
import type { HomeAssistant, PinConfig } from '../types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'backspace', '0', 'submit'] as const;

/** Walks open shadow roots down to the element that really has focus. */
function deepActiveElement(): HTMLElement | null {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el instanceof HTMLElement ? el : null;
}

/**
 * Confirm or PIN dialog on a native <dialog>: showModal() uses the top layer,
 * so it works inside the card's shadow root without HA's lazy-loaded ha-dialog.
 */
export class SafeToggleDialog extends LitElement {
  static properties = {
    kind: { attribute: false },
    heading: { attribute: false },
    text: { attribute: false },
    pin: { attribute: false },
    hass: { attribute: false },
    lang: { attribute: false },
    haptics: { attribute: false },
    digits: { state: true },
    message: { state: true },
    shaking: { state: true },
  };

  declare kind: 'confirm' | 'pin' | null;
  declare heading: string;
  declare text: string;
  declare pin?: PinConfig;
  declare hass?: HomeAssistant;
  declare lang: Lang;
  declare haptics: boolean;
  declare digits: string;
  declare message: string;
  declare shaking: boolean;

  private lockout: LockoutState = { attempts: 0, lockedUntil: null };
  private lockTicker?: ReturnType<typeof setInterval>;
  private returnFocus: HTMLElement | null = null;

  constructor() {
    super();
    this.kind = null;
    this.heading = '';
    this.text = '';
    this.lang = 'en';
    this.haptics = true;
    this.digits = '';
    this.message = '';
    this.shaking = false;
  }

  private get dialog(): HTMLDialogElement | null {
    return this.renderRoot.querySelector('dialog');
  }

  private tr(key: TextKey, vars?: Record<string, string | number>): string {
    return t(key, { lang: this.lang, vars });
  }

  private get pinLength(): number {
    const pin = this.pin;
    if (pin?.source === 'entity' && pin.entity) {
      const value = this.hass?.states[pin.entity]?.state.trim() ?? '';
      if (/^\d{1,16}$/.test(value)) return value.length;
    }
    return pin?.length ?? 4;
  }

  private get lockedS(): number {
    return lockRemainingS(this.lockout, Date.now());
  }

  protected updated(changed: PropertyValues<this>): void {
    if (!changed.has('kind')) return;
    const dialog = this.dialog;
    if (!dialog) return;
    if (this.kind && !dialog.open) {
      this.returnFocus = deepActiveElement();
      this.digits = '';
      this.message = this.lockedS > 0 ? this.tr('pin_locked', { s: this.lockedS }) : '';
      dialog.showModal();
      if (this.lockedS > 0) this.startLockTicker();
    } else if (!this.kind && dialog.open) {
      dialog.close();
      this.stopLockTicker();
      this.returnFocus?.focus();
      this.returnFocus = null;
    }
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopLockTicker();
  }

  private emit(name: 'confirm-ok' | 'pin-ok' | 'dialog-cancel'): void {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
  }

  private onCancel(e: Event): void {
    e.preventDefault();
    this.emit('dialog-cancel');
  }

  private onBackdrop(e: MouseEvent): void {
    if (e.target === this.dialog) this.emit('dialog-cancel');
  }

  private onKeydown(e: KeyboardEvent): void {
    if (this.kind !== 'pin') return;
    if (/^\d$/.test(e.key)) this.press(e.key as (typeof KEYS)[number]);
    else if (e.key === 'Backspace') this.press('backspace');
    else if (e.key === 'Enter') this.press('submit');
    else return;
    e.preventDefault();
  }

  private press(key: (typeof KEYS)[number]): void {
    if (this.lockedS > 0) return;
    if (key === 'backspace') {
      this.digits = this.digits.slice(0, -1);
      return;
    }
    if (key === 'submit') {
      if (this.digits) this.submit();
      return;
    }
    if (this.digits.length >= 16) return;
    fireHaptic(this, 'light', this.haptics);
    this.digits += key;
    this.message = '';
    if (this.digits.length >= this.pinLength) this.submit();
  }

  private submit(): void {
    const pin = this.pin;
    const entered = this.digits;
    this.digits = '';
    if (!pin) return;
    if (pin.source === 'entity') {
      const result = verifyEntityPin(
        entered,
        pin.entity ? this.hass?.states[pin.entity] : undefined,
      );
      if (result === 'unavailable') {
        this.message = this.tr('pin_entity_unavailable');
        fireHaptic(this, 'failure', this.haptics);
        return;
      }
      this.settle(result === 'ok');
    } else {
      this.settle(verifyPin(entered, pin.hash ?? ''));
    }
  }

  private settle(ok: boolean): void {
    const pin = this.pin!;
    this.lockout = registerAttempt(this.lockout, ok, Date.now(), pin);
    if (ok) {
      this.message = '';
      this.emit('pin-ok');
      return;
    }
    fireHaptic(this, 'failure', this.haptics);
    this.shaking = true;
    setTimeout(() => (this.shaking = false), 400);
    if (this.lockedS > 0) {
      this.message = this.tr('pin_locked', { s: this.lockedS });
      this.startLockTicker();
    } else {
      this.message = this.tr('pin_wrong');
    }
  }

  private startLockTicker(): void {
    this.stopLockTicker();
    this.lockTicker = setInterval(() => {
      const s = this.lockedS;
      this.message = s > 0 ? this.tr('pin_locked', { s }) : '';
      if (s === 0) this.stopLockTicker();
    }, 1000);
  }

  private stopLockTicker(): void {
    if (this.lockTicker !== undefined) clearInterval(this.lockTicker);
    this.lockTicker = undefined;
  }

  private renderKeypad() {
    const locked = this.lockedS > 0;
    const label = (k: (typeof KEYS)[number]) =>
      k === 'backspace' ? this.tr('pin_backspace') : k === 'submit' ? this.tr('pin_submit') : k;
    return html`
      <div class="dots ${this.shaking ? 'shake' : ''}" aria-hidden="true">
        ${Array.from(
          { length: this.pinLength },
          (_, i) => html`<span class="dot ${i < this.digits.length ? 'filled' : ''}"></span>`,
        )}
      </div>
      <div class="keypad">
        ${KEYS.map(
          (k) => html`
            <button
              type="button"
              class="key ${k.length > 1 ? 'aux' : ''}"
              data-key=${k}
              aria-label=${label(k)}
              ?disabled=${locked}
              @click=${() => this.press(k)}
            >
              ${k === 'backspace' ? '⌫' : k === 'submit' ? '✓' : k}
            </button>
          `,
        )}
      </div>
    `;
  }

  render() {
    return html`
      <dialog
        aria-labelledby="heading"
        @cancel=${this.onCancel}
        @click=${this.onBackdrop}
        @keydown=${this.onKeydown}
      >
        <h2 id="heading">${this.kind === 'pin' ? this.tr('pin_title') : this.heading}</h2>
        <p class="text">${this.text}</p>
        ${this.kind === 'pin' ? this.renderKeypad() : nothing}
        <p class="message" role="status" aria-live="assertive">${this.message}</p>
        <div class="actions">
          <button type="button" class="cancel" @click=${() => this.emit('dialog-cancel')}>
            ${this.tr('confirm_cancel')}
          </button>
          ${
            this.kind === 'confirm'
              ? html`<button type="button" class="ok" @click=${() => this.emit('confirm-ok')}>
                  ${this.tr('confirm_ok')}
                </button>`
              : nothing
          }
        </div>
      </dialog>
    `;
  }

  static styles = css`
    dialog {
      border: none;
      border-radius: var(--ha-dialog-border-radius, 24px);
      background: var(--ha-dialog-surface-background, var(--card-background-color, #fff));
      color: var(--primary-text-color);
      padding: 24px;
      width: min(320px, calc(100vw - 32px));
      box-sizing: border-box;
      font-family: var(--ha-font-family-body, inherit);
      box-shadow: var(--ha-card-box-shadow, 0 8px 24px rgba(0, 0, 0, 0.3));
    }
    dialog::backdrop {
      background: var(--ha-dialog-scrim-color, rgba(0, 0, 0, 0.32));
    }
    h2 {
      margin: 0 0 8px;
      font-size: var(--ha-font-size-xl, 1.25rem);
      font-weight: var(--ha-font-weight-normal, 400);
    }
    .text {
      margin: 0 0 16px;
      color: var(--secondary-text-color);
    }
    .dots {
      display: flex;
      justify-content: center;
      gap: 12px;
      margin-bottom: 16px;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      border: 2px solid var(--primary-color);
    }
    .dot.filled {
      background: var(--primary-color);
    }
    .shake {
      animation: shake 0.4s;
    }
    @keyframes shake {
      25% {
        transform: translateX(-8px);
      }
      75% {
        transform: translateX(8px);
      }
    }
    .keypad {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
    }
    button {
      font: inherit;
      border: none;
      cursor: pointer;
      color: var(--primary-text-color);
      -webkit-tap-highlight-color: transparent;
    }
    button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .key {
      height: 56px;
      border-radius: 28px;
      font-size: 1.4rem;
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.15));
    }
    .key.aux {
      font-size: 1.2rem;
    }
    .key:disabled {
      opacity: 0.4;
      cursor: default;
    }
    .message {
      min-height: 1.4em;
      margin: 12px 0 0;
      color: var(--error-color, #db4437);
      text-align: center;
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 8px;
    }
    .actions button {
      background: none;
      padding: 8px 12px;
      border-radius: 20px;
      color: var(--primary-color);
      font-weight: var(--ha-font-weight-medium, 500);
    }
    @media (prefers-reduced-motion: reduce) {
      .shake {
        animation: none;
      }
    }
  `;
}

if (!customElements.get('safe-toggle-dialog')) {
  customElements.define('safe-toggle-dialog', SafeToggleDialog);
}
