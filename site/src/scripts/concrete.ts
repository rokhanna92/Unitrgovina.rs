// Concrete calculator maths, shared by the server render and the browser.
export type CalcKey = 'L' | 'W' | 'D' | 'r';
export type CalcValues = Record<CalcKey, number>;

export const CALC_ROWS: { k: CalcKey; unit: string; min: number; max: number; step: number }[] = [
  { k: 'L', unit: 'm', min: 1, max: 60, step: 0.5 },
  { k: 'W', unit: 'm', min: 1, max: 40, step: 0.5 },
  { k: 'D', unit: 'cm', min: 5, max: 60, step: 1 },
  { k: 'r', unit: '%', min: 0, max: 15, step: 1 },
];
export const CALC_DEFAULTS: CalcValues = { L: 10, W: 8, D: 15, r: 5 };
export const PUMPS = [28, 36, 42];
export const DEFAULT_PUMP = '36 m';
const MIXER_M3 = 10;

export const fmt = (n: number, d: number) => (Math.round(n * 10 ** d) / 10 ** d).toFixed(d).replace('.', ',');
export const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : fmt(n, 1));

type Words = { tura: string; ture: string; mixers: string };
// Serbian plural: 2, 3, 4 (but not 12-14) take "ture"
const word = (n: number, w: Words) => {
  const a = n % 10, b = n % 100;
  return a >= 2 && a <= 4 && (b < 12 || b > 14) ? w.ture : w.tura;
};

export function calcConcrete(v: CalcValues, w: Words) {
  const V = v.L * v.W * (v.D / 100) * (1 + v.r / 100);
  const vol = Math.round(V * 10) / 10;
  const trips = Math.max(1, Math.ceil(vol / MIXER_M3 - 1e-9));
  const bars = Array.from({ length: Math.min(trips, 12) }, (_, k) => Math.round(Math.min(1, Math.max(0, (vol - k * MIXER_M3) / MIXER_M3)) * 100) + '%');
  return { vol, volStr: fmt(vol, 1), trips, tripsStr: `${trips} ${word(trips, w)} ${w.mixers}`, bars };
}
