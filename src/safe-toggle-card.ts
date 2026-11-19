import { LitElement, html } from 'lit';

export class SafeToggleCard extends LitElement {
  static properties = {
    smoke: { reflect: true },
  };

  declare smoke: string;

  constructor() {
    super();
    this.smoke = '';
  }

  render() {
    return html``;
  }
}

if (!customElements.get('safe-toggle-card')) {
  customElements.define('safe-toggle-card', SafeToggleCard);
}
