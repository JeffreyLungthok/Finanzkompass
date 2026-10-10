import fs from 'node:fs';
import path from 'node:path';
import { buildTaxContext, type LocationRow } from '../tax/context';
import type { CantonTaxData } from '../tax/types';

const DIR = path.resolve(__dirname, '../../../public/data/tax/2026');
const load = <T>(f: string): T => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) as T;
export const locations = load<LocationRow[]>('locations.json');

export function ctxFor(bfs: number) {
  const loc = locations.find((l) => l[0] === bfs);
  if (!loc) throw new Error('unknown bfs ' + bfs);
  return buildTaxContext(load<CantonTaxData>('bund.json'), load<CantonTaxData>(`${loc[2]}.json`), bfs);
}
