import { describe, expect, it } from 'vitest';
import {
  applyEditorData,
  buildSchema,
  computeHelper,
  computeLabel,
  editorData,
  type HaFormSchema,
} from '../../src/editor/schema';
import { mockHass } from '../helpers/mock-hass';

const hass = mockHass({
  'lock.x': { state: 'locked' },
  'switch.x': { state: 'off' },
  'climate.x': { state: 'heat' },
  'climate.y': { state: 'off' },
  'scene.x': { state: '2026-11-19T10:00:00Z' },
});
const raw = (extra: object = {}) => ({
  type: 'custom:safe-toggle-card',
  entity: 'lock.x',
  ...extra,
});

const names = (schema: HaFormSchema[]) => schema.map((s) => s.name ?? s.type);
const find = (schema: HaFormSchema[], name: string): HaFormSchema | undefined => {
  for (const s of schema) {
    if (s.name === name) return s;
    const inner = s.schema && find(s.schema, name);
    if (inner) return inner;
  }
  return undefined;
};

describe('buildSchema', () => {
  it('has entity, display, both directions and texts for a lock', () => {
    const n = names(buildSchema(raw(), hass, 'en'));
    expect(n).toEqual(expect.arrayContaining(['entity', 'activate', 'deactivate', 'texts']));
    expect(n).not.toContain('pin');
  });

  it('drops deactivate for a scene', () => {
    expect(names(buildSchema(raw({ entity: 'scene.x' }), hass, 'en'))).not.toContain('deactivate');
  });

  it('shows the pin section only when a direction uses pin', () => {
    const n = names(buildSchema(raw({ deactivate: { confirm: 'pin' } }), hass, 'en'));
    expect(n).toContain('pin');
  });

  it('limits the entity picker to supported entities', () => {
    const entity = find(buildSchema(raw(), hass, 'en'), 'entity')!;
    const include = (entity.selector as { entity: { include_entities: string[] } }).entity
      .include_entities;
    expect(include).toEqual(expect.arrayContaining(['lock.x', 'switch.x', 'scene.x', 'climate.y']));
    expect(include).not.toContain('climate.x');
  });

  it('shows gesture-specific fields only', () => {
    const slide = buildSchema(raw(), hass, 'en');
    const act = find(slide, 'activate')!.schema!;
    expect(names(act)).toContain('hold_ms');
    expect(names(act)).not.toContain('taps');
    const multi = buildSchema(raw({ activate: { gesture: 'multi_tap' } }), hass, 'en');
    const act2 = find(multi, 'activate')!.schema!;
    expect(names(act2)).toEqual(expect.arrayContaining(['taps', 'tap_window_ms']));
    expect(names(act2)).not.toContain('hold_ms');
  });

  it('pin entity selector only offers input_text', () => {
    const s = buildSchema(
      raw({ activate: { confirm: 'pin' }, pin: { source: 'entity' } }),
      hass,
      'en',
    );
    expect(find(s, 'entity_pin')?.selector).toEqual({ entity: { domain: 'input_text' } });
  });
});

describe('editorData / applyEditorData', () => {
  it('exposes the current preset', () => {
    expect(editorData(raw({ activate: { gesture: 'slide', hold_ms: 800 } })).activate.preset).toBe(
      'slide_hold',
    );
    expect(editorData(raw({ activate: { gesture: 'slide', hold_ms: 300 } })).activate.preset).toBe(
      'custom',
    );
  });

  it('choosing a preset writes its fields into that direction', () => {
    const before = raw();
    const data = editorData(before);
    const out = applyEditorData(before, {
      ...data,
      activate: { ...data.activate, preset: 'slide_pin' },
    });
    expect(out.activate).toMatchObject({ gesture: 'slide', hold_ms: 0, confirm: 'pin' });
    expect(out.activate).not.toHaveProperty('preset');
  });

  it('editing a raw field keeps it and drops the preset key', () => {
    const before = raw();
    const data = editorData(before);
    const out = applyEditorData(before, { ...data, activate: { ...data.activate, hold_ms: 300 } });
    expect(out.activate).toMatchObject({ gesture: 'slide', hold_ms: 300 });
    expect(out.activate).not.toHaveProperty('preset');
  });

  it('maps the pin entity field and keeps the stored hash', () => {
    const before = raw({ activate: { confirm: 'pin' }, pin: { source: 'inline', hash: 'h' } });
    const data = editorData(before);
    const out = applyEditorData(before, { ...data, pin: { ...data.pin, length: 6 } });
    expect(out.pin).toEqual({ source: 'inline', hash: 'h', length: 6 });
    const ent = applyEditorData(before, {
      ...data,
      pin: { ...data.pin, source: 'entity', entity_pin: 'input_text.code' },
    });
    expect(ent.pin).toMatchObject({ source: 'entity', entity: 'input_text.code' });
    expect(ent.pin).not.toHaveProperty('entity_pin');
  });

  it('drops an empty custom action', () => {
    const before = raw({ activate: { action: { perform_action: 'script.x' } } });
    const data = editorData(before);
    const out = applyEditorData(before, {
      ...data,
      activate: { ...data.activate, action: { action: 'none' } },
    });
    expect(out.activate).not.toHaveProperty('action');
  });

  it('drops empty text overrides', () => {
    const before = raw({ texts: { cancelled: 'Nope' } });
    const out = applyEditorData(before, {
      ...editorData(before),
      texts: { cancelled: '', done: 'OK' },
    });
    expect(out.texts).toEqual({ done: 'OK' });
  });
});

describe('labels and helpers', () => {
  it('warns under header_action when more-info is chosen', () => {
    const field = { name: 'header_action', selector: { select: {} } };
    expect(computeHelper(field, raw({ header_action: 'more-info' }), 'en')).toContain(
      'bypasses the protection',
    );
    expect(computeHelper(field, raw(), 'en')).toBeUndefined();
  });

  it('labels editor fields and text overrides', () => {
    expect(computeLabel({ name: 'hold_ms' }, 'en')).toBe('Hold at the end (ms)');
    expect(computeLabel({ name: 'slide_label' }, 'en')).toBe('Slide to {target}');
    expect(computeLabel({ name: 'hold_ms' }, 'pl')).toBe('Przytrzymanie na końcu (ms)');
  });
});
