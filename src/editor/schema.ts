// Pure helpers behind the visual editor: the ha-form schema, labels, and the mapping
// between the card config and the form data (presets, pin entity, empty values).
import { PRESETS, normalizeConfig, presetOf, type PresetId } from '../config';
import { isStateless, isSupported } from '../entity-model';
import en from '../i18n/en.json';
import { t, type Lang, type TextKey } from '../i18n';
import type { Direction, HomeAssistant } from '../types';

export interface HaFormSchema {
  name?: string;
  type?: 'expandable' | 'grid' | 'constant';
  title?: string;
  required?: boolean;
  selector?: Record<string, unknown>;
  schema?: HaFormSchema[];
}

type Raw = Record<string, any>;

const DIRECTIONS: Direction[] = ['activate', 'deactivate'];
const PRESET_IDS = [...(Object.keys(PRESETS) as PresetId[]), 'custom'] as const;
const DIRECTION_TEXT_KEYS: TextKey[] = [
  'slide_label',
  'tap_label',
  'multi_tap_label',
  'confirm_title',
  'confirm_text',
];
const CARD_TEXT_KEYS = (Object.keys(en) as TextKey[]).filter((k) => !k.startsWith('editor_'));

const lenient = (raw: Raw) => normalizeConfig(raw, { lenient: true });

function select(lang: Lang, prefix: string, values: readonly string[]) {
  return {
    select: {
      mode: 'dropdown',
      options: values.map((value) => ({
        value,
        label: t(`${prefix}${value}` as TextKey, { lang }),
      })),
    },
  };
}

const text = (name: string): HaFormSchema => ({ name, selector: { text: {} } });
const number = (name: string, min: number, max: number, step = 1): HaFormSchema => ({
  name,
  selector: { number: { min, max, step, mode: 'box' } },
});

function directionSchema(raw: Raw, dir: Direction, lang: Lang): HaFormSchema[] {
  const d = lenient(raw)[dir];
  const fields: HaFormSchema[] = [
    { name: 'preset', selector: select(lang, 'editor_preset_', PRESET_IDS) },
    { name: 'gesture', selector: select(lang, 'editor_gesture_', ['tap', 'multi_tap', 'slide']) },
  ];
  if (d.gesture === 'multi_tap') {
    fields.push(number('taps', 2, 10), number('tap_window_ms', 500, 10000, 100));
  }
  if (d.gesture === 'slide') fields.push(number('hold_ms', 0, 5000, 100));
  fields.push(
    { name: 'confirm', selector: select(lang, 'editor_confirm_', ['none', 'dialog', 'pin']) },
    { name: 'action', selector: { ui_action: { actions: ['perform-action'] } } },
    {
      type: 'expandable',
      name: 'texts',
      title: t('editor_texts', { lang }),
      schema: DIRECTION_TEXT_KEYS.map(text),
    },
  );
  return fields;
}

function pinSchema(raw: Raw, lang: Lang): HaFormSchema[] {
  const source = raw.pin?.source === 'entity' ? 'entity' : 'inline';
  const fields: HaFormSchema[] = [
    { name: 'source', selector: select(lang, 'editor_source_', ['inline', 'entity']) },
  ];
  // inline: no length field, the PIN field sets pin.length from the PIN itself
  if (source === 'entity') {
    fields.push({ name: 'entity_pin', selector: { entity: { domain: 'input_text' } } });
  }
  fields.push(number('max_attempts', 1, 20), number('lockout_s', 0, 3600));
  return fields;
}

export const usesPin = (raw: Raw): boolean => DIRECTIONS.some((d) => raw[d]?.confirm === 'pin');

export function buildSchema(raw: Raw, hass: HomeAssistant | undefined, lang: Lang): HaFormSchema[] {
  const states = hass?.states ?? {};
  const include = Object.keys(states).filter((id) => isSupported(id, states[id]));
  const schema: HaFormSchema[] = [
    { name: 'entity', required: true, selector: { entity: { include_entities: include } } },
    text('name'),
    { name: 'icon', selector: { icon: {} } },
    { name: 'color', selector: { ui_color: { default_color: 'state', include_state: true } } },
    { name: 'show_state', selector: { boolean: {} } },
    { name: 'header_action', selector: select(lang, 'editor_header_', ['none', 'more-info']) },
    { name: 'haptics', selector: { boolean: {} } },
    { name: 'language', selector: select(lang, 'editor_language_', ['auto', 'en', 'pl']) },
  ];
  const dirs = isStateless(raw.entity ?? '') ? (['activate'] as Direction[]) : DIRECTIONS;
  for (const dir of dirs) {
    schema.push({
      type: 'expandable',
      name: dir,
      title: t(`editor_${dir}`, { lang }),
      schema: directionSchema(raw, dir, lang),
    });
  }
  if (usesPin(raw)) {
    schema.push({
      type: 'expandable',
      name: 'pin',
      title: t('editor_pin', { lang }),
      schema: pinSchema(raw, lang),
    });
  }
  schema.push({
    type: 'expandable',
    name: 'texts',
    title: t('editor_texts', { lang }),
    schema: CARD_TEXT_KEYS.map(text),
  });
  return schema;
}

/** Form data: config with defaults filled, the current preset and the pin entity renamed. */
export function editorData(raw: Raw): Raw {
  const cfg = lenient(raw);
  const data: Raw = {
    ...raw,
    show_state: cfg.show_state,
    header_action: cfg.header_action,
    haptics: cfg.haptics,
    language: cfg.language,
  };
  for (const dir of DIRECTIONS) {
    data[dir] = { ...raw[dir], ...cfg[dir], preset: presetOf(cfg[dir]) };
    // the ui_action selector needs the action type to show the service picker
    const custom = cfg[dir].action;
    if (custom) data[dir].action = { action: 'perform-action', ...custom };
    else if (raw[dir]?.action?.action === 'perform-action') {
      data[dir].action = { action: 'perform-action' };
    } else delete data[dir].action;
  }
  if (raw.pin) {
    const { entity, ...pin } = raw.pin;
    data.pin = { source: 'inline', ...pin, ...(entity ? { entity_pin: entity } : {}) };
  }
  return data;
}

function cleanTexts(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const out = Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(
      ([, s]) => typeof s === 'string' && s.trim() !== '',
    ),
  ) as Record<string, string>;
  return Object.keys(out).length ? out : undefined;
}

/** Maps ha-form data back to a card config; a newly chosen preset overwrites its fields. */
export function applyEditorData(raw: Raw, data: Raw): Raw {
  const before = editorData(raw);
  const out: Raw = { ...raw, ...data };
  for (const key of ['name', 'icon']) if (!out[key]) delete out[key];
  if (!out.color || out.color === 'state') delete out.color;
  for (const dir of DIRECTIONS) {
    if (!data[dir]) continue;
    const { preset, ...d } = data[dir] as Raw;
    if (preset && preset !== 'custom' && preset !== before[dir]?.preset) {
      Object.assign(d, PRESETS[preset as PresetId]);
    }
    const a = d.action as Raw | undefined;
    if (!a || (a.action && a.action !== 'perform-action')) {
      delete d.action;
    } else if (!a.perform_action) {
      // type chosen, service not yet: keep it so the selector does not snap back
      d.action = { action: 'perform-action' };
    } else {
      d.action = { perform_action: a.perform_action, target: a.target, data: a.data };
      for (const k of ['target', 'data']) if (!d.action[k]) delete d.action[k];
    }
    const texts = cleanTexts(d.texts);
    if (texts) d.texts = texts;
    else delete d.texts;
    out[dir] = d;
  }
  if (data.pin) {
    const { entity_pin, ...pin } = data.pin as Raw;
    if (pin.source === 'entity' && entity_pin) pin.entity = entity_pin;
    else delete pin.entity;
    out.pin = pin;
  }
  const texts = cleanTexts(out.texts);
  if (texts) out.texts = texts;
  else delete out.texts;
  return out;
}

export function computeLabel(schema: HaFormSchema, lang: Lang): string {
  const name = schema.name ?? '';
  if (`editor_${name}` in en) return t(`editor_${name}` as TextKey, { lang });
  if (name in en) return t(name as TextKey, { lang });
  return name;
}

export function computeHelper(schema: HaFormSchema, raw: Raw, lang: Lang): string | undefined {
  if (schema.name === 'header_action' && raw.header_action === 'more-info') {
    return t('header_action_warning', { lang });
  }
  return undefined;
}
