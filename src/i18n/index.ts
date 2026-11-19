import type { HomeAssistant, TextOverrides } from '../types';
import en from './en.json';
import pl from './pl.json';

export type TextKey = keyof typeof en;
export type Lang = 'en' | 'pl';

const BUNDLES: Record<Lang, Partial<Record<TextKey, string>>> = { en, pl };

export function resolveLang(configLang: 'auto' | Lang, hass?: HomeAssistant): Lang {
  if (configLang !== 'auto') return configLang;
  const base = (hass?.locale?.language ?? hass?.language ?? 'en').toLowerCase().split('-')[0];
  return base === 'pl' ? 'pl' : 'en';
}

export interface TOptions {
  lang: Lang;
  /** Most specific first: direction texts, then card texts. */
  overrides?: (TextOverrides | undefined)[];
  vars?: Record<string, string | number>;
}

export function t(key: TextKey, opts: TOptions): string {
  const override = opts.overrides
    ?.map((o) => o?.[key])
    .find((s) => typeof s === 'string' && s !== '');
  const template = override ?? BUNDLES[opts.lang][key] ?? en[key];
  return template.replace(/\{(\w+)\}/g, (m, name: string) =>
    opts.vars && name in opts.vars ? String(opts.vars[name]) : m,
  );
}
