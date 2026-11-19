import { describe, expect, it, vi } from 'vitest';
import { buildCall, executeCall } from '../src/actions';
import { normalizeConfig } from '../src/config';
import type { HomeAssistant } from '../src/types';

const cfg = (extra: object = {}) =>
  normalizeConfig({ type: 'custom:safe-toggle-card', entity: 'lock.x', ...extra });

describe('buildCall', () => {
  it('uses the domain default with the card entity as target', () => {
    expect(buildCall(cfg(), 'activate')).toEqual({
      domain: 'lock',
      service: 'unlock',
      target: { entity_id: 'lock.x' },
    });
  });

  it('uses a custom action as given', () => {
    const c = cfg({ activate: { action: { perform_action: 'script.open_gate', data: { a: 1 } } } });
    expect(buildCall(c, 'activate')).toEqual({
      domain: 'script',
      service: 'open_gate',
      data: { a: 1 },
    });
  });

  it('keeps a custom target', () => {
    const c = cfg({
      deactivate: {
        action: { perform_action: 'switch.turn_off', target: { entity_id: 'switch.y' } },
      },
    });
    expect(buildCall(c, 'deactivate')).toEqual({
      domain: 'switch',
      service: 'turn_off',
      target: { entity_id: 'switch.y' },
    });
  });

  it('throws when a scene has no deactivate service', () => {
    const c = normalizeConfig({ type: 'custom:safe-toggle-card', entity: 'scene.x' });
    expect(() => buildCall(c, 'deactivate')).toThrow();
  });
});

describe('executeCall', () => {
  it('calls hass.callService once with data and target', async () => {
    const callService = vi.fn().mockResolvedValue(undefined);
    const hass = { callService } as unknown as HomeAssistant;
    await executeCall(hass, { domain: 'lock', service: 'unlock', target: { entity_id: 'lock.x' } });
    expect(callService).toHaveBeenCalledOnce();
    expect(callService).toHaveBeenCalledWith('lock', 'unlock', undefined, { entity_id: 'lock.x' });
  });

  it('propagates a rejection', async () => {
    const hass = {
      callService: vi.fn().mockRejectedValue(new Error('nope')),
    } as unknown as HomeAssistant;
    await expect(executeCall(hass, { domain: 'a', service: 'b' })).rejects.toThrow('nope');
  });
});
