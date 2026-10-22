import type { Copy } from './sr';

type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] };

// Slovak copy. Only the lines present in the design reference are here; every missing key falls back to Serbian.
// TODO(sk): translate the remaining keys of src/i18n/sr.ts and have a native speaker check all of it,
// then remove the noindex on /sk/ (src/pages/sk/index.astro).
export const sk: DeepPartial<Copy> = {
  // TODO(sk): meta.title, meta.description
  header: {
    nav: ['Betón', 'Kamenivo', 'Stavebný materiál', 'Poľnohospodárstvo', 'Palivo'],
    cta: 'Vyžiadajte si ponuku',
  },
  hero: {
    display: ['Stavebný materiál', 'Padina, Kovačica'],
    h1: 'Betón, štrk, kamenivo a palivo s dopravou',
    sub: 'Rodinná firma z Padiny od roku 1990.',
    cta: 'Vyžiadajte si ponuku',
    call: 'Zavolajte nám 063 667 570',
  },
};
