import { describe, expect, it } from 'vitest';
import '../src/safe-toggle-card';

describe('bundle entry', () => {
  it('registers the safe-toggle-card element', () => {
    expect(customElements.get('safe-toggle-card')).toBeDefined();
  });

  it('round-trips a reflected Lit reactive property', async () => {
    const el = document.createElement('safe-toggle-card') as HTMLElement & {
      smoke: string;
      updateComplete: Promise<boolean>;
    };
    el.smoke = 'ok';
    document.body.append(el);
    await el.updateComplete;
    expect(el.smoke).toBe('ok');
    expect(el.getAttribute('smoke')).toBe('ok');
    el.remove();
  });
});
