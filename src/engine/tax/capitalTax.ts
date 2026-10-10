/**
 * Kapitalleistungssteuer auf Bezüge aus Pensionskasse und Säule 3a.
 * Die kantonalen Berechnungsarten folgen devbrains-com/swisstaxcalculator (MIT),
 * Stand der Definitionen: Steuerperiode 2022, Tarife aus den aktuellen ESTV-Daten.
 * Wichtig: Alle Kapitalbezüge eines Jahres (beider Ehepartner) werden zusammengezählt.
 */
import { getTarifGroups, round100Down, roundHalfEven, taxForTarif } from './tariff';
import { churchIncomeFactor } from './incomeTax';
import type { CapitalTaxResult, Confession, TaxContext, TaxRelationship } from './types';

type DefinitionType = 'IncomeTaxFactor' | 'RentIncomeFactor' | 'RentIncomeFactorOwn' | 'Flattax' | 'Tarif';

interface Definition {
  type: DefinitionType;
  incomeTaxFactor?: number;
  rentIncomeFactor?: number;
  minTaxFactor?: number;
  maxTaxFactor?: number;
  taxFactorChurch?: number;
}

const DEFINITIONS: Record<number, Definition> = {
  0: { type: 'IncomeTaxFactor', incomeTaxFactor: 0.2 }, // Bund: 1/5 des ordentlichen Tarifs
  26: { type: 'RentIncomeFactor', rentIncomeFactor: 0.05, minTaxFactor: 0.02 }, // ZH
  4: { type: 'Tarif' }, // BE
  12: { type: 'IncomeTaxFactor', incomeTaxFactor: 1 / 3, minTaxFactor: 0.005 }, // LU
  22: { type: 'Flattax', taxFactorChurch: 0.005 }, // UR
  19: { type: 'RentIncomeFactor', rentIncomeFactor: 0.04, maxTaxFactor: 0.025 }, // SZ
  15: { type: 'IncomeTaxFactor', incomeTaxFactor: 0.4 }, // OW
  14: { type: 'IncomeTaxFactor', incomeTaxFactor: 0.4, minTaxFactor: 0.008 }, // NW
  9: { type: 'Flattax' }, // GL
  25: { type: 'IncomeTaxFactor', minTaxFactor: 0.01 }, // ZG
  7: { type: 'Tarif' }, // FR
  18: { type: 'IncomeTaxFactor', incomeTaxFactor: 0.25 }, // SO
  6: { type: 'Tarif' }, // BS
  5: { type: 'Tarif', maxTaxFactor: 0.045 }, // BL
  17: { type: 'IncomeTaxFactor', incomeTaxFactor: 0.2 }, // SH
  3: { type: 'Tarif' }, // AR
  2: { type: 'IncomeTaxFactor', incomeTaxFactor: 0.25, minTaxFactor: 0.005 }, // AI
  16: { type: 'Flattax' }, // SG
  10: { type: 'RentIncomeFactorOwn', rentIncomeFactor: 1 / 15, minTaxFactor: 0.015, maxTaxFactor: 0.02 }, // GR
  1: { type: 'IncomeTaxFactor', incomeTaxFactor: 0.3, minTaxFactor: 0.01 }, // AG
  20: { type: 'Flattax' }, // TG
  21: { type: 'RentIncomeFactor', rentIncomeFactor: 0.068, minTaxFactor: 0.02 }, // TI
  23: { type: 'IncomeTaxFactor', incomeTaxFactor: 0.33 }, // VD
  24: { type: 'RentIncomeFactor', rentIncomeFactor: 0.068, minTaxFactor: 0.02 }, // VS
  13: { type: 'IncomeTaxFactor', incomeTaxFactor: 0.25, minTaxFactor: 0.025 }, // NE
  8: { type: 'IncomeTaxFactor', incomeTaxFactor: 0.2 }, // GE
  11: { type: 'Tarif' } // JU
};

function baseTax(
  ctx: TaxContext,
  def: Definition,
  cantonId: number,
  relationship: TaxRelationship,
  children: number,
  capital: number
): number {
  const data = cantonId === 0 ? ctx.bund : ctx.canton;
  const groups = getTarifGroups(relationship, children);
  let tax = 0;
  switch (def.type) {
    case 'IncomeTaxFactor':
      tax = taxForTarif(data, 'EINKOMMENSSTEUER', groups, capital) * (def.incomeTaxFactor ?? 1);
      break;
    case 'RentIncomeFactor':
    case 'RentIncomeFactorOwn': {
      // Satzbestimmung über eine fiktive Jahresrente
      const reduced = round100Down(capital * (def.rentIncomeFactor ?? 1));
      if (reduced <= 0) {
        tax = 0;
        break;
      }
      const t = def.type === 'RentIncomeFactor' ? 'EINKOMMENSSTEUER' : 'VORSORGESTEUER';
      const taxReduced = taxForTarif(data, t, groups, reduced);
      tax = capital * (taxReduced / reduced);
      break;
    }
    case 'Flattax':
    case 'Tarif':
      tax = taxForTarif(data, 'VORSORGESTEUER', groups, capital);
      break;
  }
  if (def.minTaxFactor) tax = Math.max(tax, capital * def.minTaxFactor);
  if (def.maxTaxFactor) tax = Math.min(tax, capital * def.maxTaxFactor);
  return tax;
}

export function calculateCapitalWithdrawalTax(
  ctx: TaxContext,
  capital: number,
  relationship: TaxRelationship,
  children: number,
  confessions: Confession[]
): CapitalTaxResult {
  if (capital <= 0) return { bund: 0, canton: 0, city: 0, church: 0, total: 0 };
  const defCanton = DEFINITIONS[ctx.cantonId] ?? { type: 'IncomeTaxFactor', incomeTaxFactor: 0.25 };
  const bund = roundHalfEven(baseTax(ctx, DEFINITIONS[0], 0, relationship, children, capital));
  const base = baseTax(ctx, defCanton, ctx.cantonId, relationship, children, capital);
  const baseChurch = defCanton.taxFactorChurch ? capital * defCanton.taxFactorChurch : base;
  const f = ctx.factors;
  const canton = roundHalfEven((base * f.incomeCanton) / 100);
  const city = roundHalfEven((base * f.incomeCity) / 100);
  const n = confessions.length || 1;
  const church = roundHalfEven(
    confessions.reduce((sum, c) => sum + (baseChurch * churchIncomeFactor(c, f)) / n / 100, 0)
  );
  return { bund, canton, city, church, total: bund + canton + city + church };
}
