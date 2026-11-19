import { describe, expect, it } from 'vitest';
import '../src/safe-toggle-card';

describe('bundle entry', () => {
  it('registers the safe-toggle-card element', () => {
    expect(customElements.get('safe-toggle-card')).toBeDefined();
  });

  it('announces itself to the HA card picker', () => {
    expect(window.customCards).toContainEqual(
      expect.objectContaining({ type: 'safe-toggle-card', preview: true }),
    );
  });
});
