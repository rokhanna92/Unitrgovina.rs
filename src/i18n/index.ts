import { sr, type Copy } from './sr';
import { sk } from './sk';

export const locales = ['sr', 'sk'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'sr';

export const htmlLang: Record<Locale, string> = { sr: 'sr-Latn', sk: 'sk' };
export const ogLocale: Record<Locale, string> = { sr: 'sr_RS', sk: 'sk_SK' };
export const homePath: Record<Locale, string> = { sr: '/', sk: '/sk/' };

// Flip to true once a native speaker has signed off the Slovak copy:
// /sk/ then loses its noindex, joins the sitemap and both pages get hreflang links.
export const skReady = false;

function merge<T>(base: T, over: unknown): T {
  if (over === undefined) return base;
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over as Record<string, unknown>)) out[k] = merge(out[k], v);
  return out as T;
}

export function getCopy(locale: Locale): Copy {
  return locale === 'sk' ? merge(sr, sk) : sr;
}

export function asLocale(value: string | undefined): Locale {
  return (locales as readonly string[]).includes(value ?? '') ? (value as Locale) : defaultLocale;
}
