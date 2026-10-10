import type { CantonTaxData, TaxContext } from './types';

/** Baut den Steuerkontext für eine Gemeinde aus geladenen Kantons- und Bundesdaten. */
export function buildTaxContext(bund: CantonTaxData, canton: CantonTaxData, bfsId: number): TaxContext {
  const factors = canton.factors[String(bfsId)];
  if (!factors) throw new Error(`Keine Steuerfüsse für Gemeinde ${bfsId}`);
  return { year: canton.year, bfsId, cantonId: canton.cantonId, bund, canton, factors };
}

/** Gemeinde: [BFS-Nr., Name, Kantons-ID, Kantonskürzel] */
export type LocationRow = [number, string, number, string];
