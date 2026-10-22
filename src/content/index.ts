import type { Locale } from '../i18n';
import services from './services.json';
import fractions from './fractions.json';
import tasks from './tasks.json';
import gallery from './gallery.json';
import prices from './prices.json';
import locations from './locations.json';
import quoteTabs from './quote-tabs.json';
import seasons from './seasons.json';

export type Service = (typeof services)[number];
export type Fraction = Omit<(typeof fractions)[number], 'range'> & { range: [number, number] | null };
export type GalleryItem = (typeof gallery)[number];
export type Location = (typeof locations)[number];
export type QuoteField = {
  k: string;
  label: string;
  type: 'text' | 'select' | 'chips' | 'date';
  options?: string[];
  full?: boolean;
};
export type QuoteTab = { name: string; key: string; fields: QuoteField[] };
export type Season = { months: number[]; label: string; text: string; btn: string; tab?: number; href?: string };

const base = {
  services,
  fractions: fractions as Fraction[],
  tasks,
  gallery,
  prices,
  locations,
  quoteTabs: quoteTabs as QuoteTab[],
  seasons: seasons as Season[],
};
export type Content = typeof base;

// A translated file at ./sk/<name>.json replaces the Serbian one for /sk/. None exist yet.
const overrides = import.meta.glob<{ default: unknown }>('./sk/*.json', { eager: true });

const fileKey: Record<keyof Content, string> = {
  services: 'services',
  fractions: 'fractions',
  tasks: 'tasks',
  gallery: 'gallery',
  prices: 'prices',
  locations: 'locations',
  quoteTabs: 'quote-tabs',
  seasons: 'seasons',
};

export function getContent(locale: Locale): Content {
  if (locale === 'sr') return base;
  const out = { ...base } as Record<keyof Content, unknown>;
  for (const k of Object.keys(fileKey) as (keyof Content)[]) {
    const hit = overrides[`./${locale}/${fileKey[k]}.json`];
    if (hit) out[k] = hit.default;
  }
  return out as Content;
}
