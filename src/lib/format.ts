const nf0 = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('de-CH', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** CHF 12’345 */
export const chf = (v: number) => `CHF\u00a0${nf0.format(Math.round(v))}`;
/** 12’345 */
export const num = (v: number) => nf0.format(Math.round(v));
/** Kompakt für Achsen und Kacheln: 850’000 → 850k, 1’250’000 → 1,25 Mio. */
export function chfShort(v: number, withUnit = true): string {
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  let s: string;
  if (a >= 1_000_000) s = `${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2).replace('.', ',').replace(/,?0+$/, '')} Mio.`;
  else if (a >= 10_000) s = `${nf0.format(Math.round(a / 1000))}k`;
  else s = nf0.format(Math.round(a));
  return `${sign}${withUnit ? 'CHF\u00a0' : ''}${s}`;
}
export const pct = (v: number, digits = 0) =>
  `${(v * 100).toFixed(digits).replace('.', ',')}\u00a0%`;
export const pct1 = (v: number) => `${nf1.format(v * 100)}\u00a0%`;

export function parseNumber(input: string): number | null {
  const cleaned = input.replace(/[’'`\s]/g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
