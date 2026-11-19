import { LitElement, css, html } from 'lit';
import { t, type Lang } from '../i18n';
import { hashPin } from '../pin';

/** Sets or removes the inline PIN; only the salted hash ever leaves this element. */
export class SafeTogglePinField extends LitElement {
  static properties = {
    hasPin: { attribute: false },
    lang: { attribute: false },
    editing: { state: true },
    error: { state: true },
  };

  declare hasPin: boolean;
  declare lang: Lang;
  declare editing: boolean;
  declare error: string;

  constructor() {
    super();
    this.hasPin = false;
    this.lang = 'en';
    this.editing = false;
    this.error = '';
  }

  private emit(hash: string | null): void {
    this.dispatchEvent(
      new CustomEvent('pin-hash-changed', { detail: { hash }, bubbles: true, composed: true }),
    );
  }

  private save(): void {
    const input = this.renderRoot.querySelector('input');
    const value = input?.value.trim() ?? '';
    if (!/^\d{4,8}$/.test(value)) {
      this.error = t('editor_pin_invalid', { lang: this.lang });
      return;
    }
    if (input) input.value = '';
    this.error = '';
    this.editing = false;
    this.emit(hashPin(value));
  }

  render() {
    const tr = (k: Parameters<typeof t>[0]) => t(k, { lang: this.lang });
    if (this.hasPin && !this.editing) {
      return html`
        <div class="row">
          <span class="status">${tr('editor_pin_set')}</span>
          <button type="button" class="change" @click=${() => (this.editing = true)}>
            ${tr('editor_pin_change')}
          </button>
          <button type="button" class="remove" @click=${() => this.emit(null)}>
            ${tr('editor_pin_remove')}
          </button>
        </div>
        <p class="note">${tr('editor_pin_note')}</p>
      `;
    }
    return html`
      <div class="row">
        <input
          type="password"
          inputmode="numeric"
          autocomplete="off"
          maxlength="8"
          aria-label=${tr('editor_pin_new')}
          placeholder=${tr('editor_pin_new')}
          @keydown=${(e: KeyboardEvent) => e.key === 'Enter' && this.save()}
        />
        <button type="button" class="save" @click=${this.save}>${tr('editor_pin_save')}</button>
      </div>
      ${this.error ? html`<p class="error">${this.error}</p>` : ''}
      <p class="note">${this.hasPin ? '' : tr('editor_pin_missing')} ${tr('editor_pin_note')}</p>
    `;
  }

  static styles = css`
    .row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .status {
      flex: 1;
      color: var(--primary-text-color);
    }
    input {
      flex: 1;
      min-width: 0;
      height: 40px;
      padding: 0 12px;
      border-radius: 4px;
      border: 1px solid var(--divider-color, #ccc);
      background: var(--card-background-color, transparent);
      color: var(--primary-text-color);
      font: inherit;
    }
    button {
      font: inherit;
      border: none;
      background: none;
      color: var(--primary-color);
      padding: 8px 12px;
      border-radius: 20px;
      cursor: pointer;
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .note {
      margin: 8px 0 0;
      font-size: var(--ha-font-size-s, 12px);
      color: var(--secondary-text-color);
    }
    .error {
      margin: 8px 0 0;
      color: var(--error-color, #db4437);
    }
  `;
}

if (!customElements.get('safe-toggle-pin-field')) {
  customElements.define('safe-toggle-pin-field', SafeTogglePinField);
}
