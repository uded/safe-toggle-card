import { LitElement, html } from 'lit';

// Placeholder until the visual editor lands (Task 13).
export class SafeToggleCardEditor extends LitElement {
  setConfig(): void {}

  render() {
    return html``;
  }
}

if (!customElements.get('safe-toggle-card-editor')) {
  customElements.define('safe-toggle-card-editor', SafeToggleCardEditor);
}
