/**
 * Lädt die aufbereiteten ESTV-Steuerdaten (statische JSON-Dateien unter /data/tax/<jahr>/).
 */
import type { CantonTaxData } from '../engine/tax/types';
import type { LocationRow } from '../engine/tax/context';

const base = `${import.meta.env.BASE_URL}data/tax`;
const cache = new Map<string, Promise<unknown>>();

function getJson<T>(url: string): Promise<T> {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url).then((r) => {
        if (!r.ok) throw new Error(`Steuerdaten konnten nicht geladen werden (${r.status})`);
        return r.json();
      })
    );
  }
  return cache.get(url) as Promise<T>;
}

export async function taxYear(): Promise<number> {
  const info = await getJson<{ years: number[]; latest: number }>(`${base}/years.json`);
  return info.latest;
}

export async function loadLocations(): Promise<LocationRow[]> {
  const year = await taxYear();
  return getJson<LocationRow[]>(`${base}/${year}/locations.json`);
}

export async function loadTaxData(cantonId: number): Promise<{ bund: CantonTaxData; canton: CantonTaxData; year: number }> {
  const year = await taxYear();
  const [bund, canton] = await Promise.all([
    getJson<CantonTaxData>(`${base}/${year}/bund.json`),
    getJson<CantonTaxData>(`${base}/${year}/${cantonId}.json`)
  ]);
  return { bund, canton, year };
}

/** Sucht Gemeinden nach Name (ohne Akzente, Anfang zuerst). */
export function searchLocations(rows: LocationRow[], query: string, limit = 8): LocationRow[] {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = norm(query.trim());
  if (!q) return [];
  const starts: LocationRow[] = [];
  const contains: LocationRow[] = [];
  for (const r of rows) {
    const n = norm(r[1]);
    if (n.startsWith(q)) starts.push(r);
    else if (n.includes(q) || `${n} ${r[3].toLowerCase()}`.includes(q)) contains.push(r);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}
