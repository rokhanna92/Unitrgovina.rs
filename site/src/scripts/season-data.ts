import type { Season } from '../content';

// The season banner entry for a month (0 = January). The last entry is the fallback.
export function seasonFor(seasons: Season[], month: number): Season {
  return seasons.find((s) => s.months.includes(month)) ?? seasons[seasons.length - 1];
}
