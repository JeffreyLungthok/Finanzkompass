/**
 * Einkommens- und Vermögenssteuer für ein Steuersubjekt (Einzelperson oder Ehepaar).
 * Abzüge, Tarife und Steuerfüsse kommen aus den ESTV-Daten des Wohnorts.
 * Struktur angelehnt an devbrains-com/swisstaxcalculator (MIT), erweitert um
 * Pensionskassen-Einkäufe, Renteneinkommen, Schuldzinsen-Begrenzung u. a.
 */
import { roundHalfEven, getTarifGroups, taxForTarif } from './tariff';
import type {
  CantonTaxData,
  Confession,
  DeductionItem,
  Factors,
  TaxContext,
  TaxResult,
  TaxSubjectInput
} from './types';

/** Reduktion der Bundessteuer pro Kind (Elterntarif, Art. 36 Abs. 2bis DBG). */
const BUND_CHILD_TAX_REDUCTION: Record<number, number> = {
  2022: 251,
  2023: 255,
  2024: 259,
  2025: 263,
  2026: 263
};
export const bundChildReduction = (year: number) => {
  if (BUND_CHILD_TAX_REDUCTION[year]) return BUND_CHILD_TAX_REDUCTION[year];
  const years = Object.keys(BUND_CHILD_TAX_REDUCTION).map(Number);
  return BUND_CHILD_TAX_REDUCTION[Math.max(...years)];
};

/** Kopf- bzw. Personalsteuer pro Kanton (CHF pro Person). */
const PERSONNEL_TAX: Record<number, { amount: number; marriedBoth: boolean }> = {
  26: { amount: 24, marriedBoth: true },
  12: { amount: 50, marriedBoth: true },
  22: { amount: 70, marriedBoth: true },
  14: { amount: 50, marriedBoth: false },
  18: { amount: 30, marriedBoth: true },
  17: { amount: 60, marriedBoth: false },
  21: { amount: 40, marriedBoth: true },
  24: { amount: 24, marriedBoth: false },
  8: { amount: 25, marriedBoth: false }
};

const deductionIndex = new WeakMap<CantonTaxData, Map<string, DeductionItem>>();
function deduction(data: CantonTaxData, taxType: 'EINKOMMENSSTEUER' | 'VERMOEGENSSTEUER', id: string) {
  let idx = deductionIndex.get(data);
  if (!idx) {
    idx = new Map();
    for (const tt of ['EINKOMMENSSTEUER', 'VERMOEGENSSTEUER'] as const) {
      for (const item of data.deductions[tt] ?? []) idx.set(`${tt}|${item.id}`, item);
    }
    deductionIndex.set(data, idx);
  }
  return idx.get(`${taxType}|${id}`);
}

/** Wendet eine Abzugsdefinition der ESTV auf einen Betrag an. */
function applyFormat(item: DeductionItem | undefined, amount = 0): number {
  if (!item) return 0;
  switch (item.format) {
    case 'MAXIMUM':
      return Math.max(0, Math.min(amount, item.maximum));
    case 'PERCENT':
      return roundHalfEven((amount * item.percent) / 100);
    case 'PERCENT,MAXIMUM':
      return Math.min(roundHalfEven((amount * item.percent) / 100), item.maximum);
    case 'PERCENT,MINIMUM,MAXIMUM':
      return Math.min(Math.max(roundHalfEven((amount * item.percent) / 100), item.minimum), item.maximum);
    case 'STANDARDIZED':
      return item.amount;
    default:
      return 0;
  }
}

interface Deductions {
  canton: number;
  bund: number;
}

function incomeDeductions(ctx: TaxContext, s: TaxSubjectInput): Deductions {
  const C = ctx.canton;
  const B = ctx.bund;
  const T = 'EINKOMMENSSTEUER' as const;
  let canton = 0;
  let bund = 0;
  const add = (id: string, amount?: number, opts: { multiplier?: number; min?: number; cap?: number } = {}) => {
    const fmt = (data: CantonTaxData) => {
      let v = applyFormat(deduction(data, T, id), amount);
      if (opts.multiplier !== undefined) v *= opts.multiplier;
      if (opts.min !== undefined) v = Math.max(v, opts.min);
      if (opts.cap !== undefined) v = Math.min(v, opts.cap);
      return v;
    };
    canton += fmt(C);
    bund += fmt(B);
  };
  const addDirect = (amount: number) => {
    canton += amount;
    bund += amount;
  };

  const married = s.relationship === 'm';
  const anyPension = s.persons.some((p) => p.hasPensionFund || p.pillar3a > 0);

  for (const p of s.persons) {
    if (p.employmentNet > 0) {
      // Pauschale Berufskosten, Fahrkosten, Verpflegung
      add('HauptErw_EK', p.employmentNet);
      if (p.travelExpenses) add('Fahrkosten_EK', p.travelExpenses);
      const workload = (p.workload ?? 100) / 100;
      const meal = (data: CantonTaxData) => {
        const item = deduction(data, T, 'VerpflMitVerb_EK');
        return item ? item.maximum * Math.min(1, workload) : 0;
      };
      canton += meal(C);
      bund += meal(B);
    }
    // Säule 3a (Maximum gemäss Tarifdaten)
    if (p.pillar3a > 0) {
      const id = p.hasPensionFund ? 'S3aMax_mitVorsorge_EK' : 'S3aMax_ohneVorsorge_EK';
      const capC = deduction(C, T, id)?.maximum ?? 7258;
      const capB = deduction(B, T, id)?.maximum ?? 7258;
      canton += Math.min(p.pillar3a, capC);
      bund += Math.min(p.pillar3a, capB);
    }
    // Einkäufe in die Pensionskasse sind voll abzugsfähig
    if (p.pkBuyIn > 0) addDirect(p.pkBuyIn);
  }

  // Versicherungsprämien und Zinsen von Sparkapitalien
  const premiums = s.persons.reduce((sum, p) => sum + (p.insurancePremiums ?? 4560), 0);
  if (married) {
    add(anyPension ? 'KKSparzVerhMitBVGS3a_EK' : 'KKSparVerhOhneBVGS3a_EK', premiums);
  } else {
    add(anyPension ? 'KKSparLedigMitBVGS3a_EK' : 'KKSparLedigOhneBVGS3a_EK', premiums);
  }
  if (s.children > 0) {
    const perChild = s.insurancePremiumsKids !== undefined ? s.insurancePremiumsKids / s.children : 1400;
    for (let i = 0; i < s.children; i++) add('KKSparProKind_EK', perChild);
  }

  if (married) {
    add('SozVerheiratet_EK');
    // Zweitverdienerabzug: nur wenn beide erwerbstätig sind, höchstens das tiefere Einkommen
    const earnings = s.persons.map((p) => p.employmentNet).sort((a, b) => a - b);
    if (earnings.length === 2 && earnings[0] > 0) add('ZweitVerdiener_EK', earnings[0], { cap: earnings[0] });
  }

  const netTotal = s.persons.reduce((sum, p) => sum + p.employmentNet + p.otherIncome, 0) + s.householdIncome;
  if (s.relationship === 's') {
    add('SozLedig_EK', netTotal);
    if (s.children > 0) {
      add('SozAlleinerzieher_EK', netTotal);
      add('SozKindAlleinerzieher_EK', netTotal);
    }
  }
  if (s.children > 0) {
    add('SozKind_EK', undefined, { multiplier: s.children });
    add('EigenBetr_EK');
    for (let i = 0; i < s.children; i++) add('FremdBetr_EK', s.childcareCosts / s.children);
  }

  // Pauschale Vermögensverwaltungskosten (nur Kantone, die sie kennen)
  if (s.securities > 0) {
    const vm = deduction(C, T, 'VMVerwaltungsKosten_EK');
    if (vm) canton += applyFormat(vm, s.securities);
  }

  // Schuldzinsen: höchstens Vermögensertrag + 50'000 (Art. 33 Abs. 1 lit. a DBG)
  if (s.debtInterest > 0) addDirect(Math.min(s.debtInterest, s.investmentIncome + 50000));
  if (s.maintenanceRealEstate > 0) addDirect(s.maintenanceRealEstate);
  if (s.otherDeductions > 0) addDirect(s.otherDeductions);

  return { canton, bund };
}

function fortuneDeductions(ctx: TaxContext, s: TaxSubjectInput): number {
  const C = ctx.canton;
  const T = 'VERMOEGENSSTEUER' as const;
  let total = 0;
  const add = (id: string, multiplier = 1) => {
    total += applyFormat(deduction(C, T, id)) * multiplier;
  };
  const single = s.relationship !== 'm';
  if (s.children > 0) add('SozKind_VM', s.children);
  if (single) add('SozLedigMitOhneKinder_VM');
  else add('SozVerheiratet_VM');
  if (single && s.children === 0) add('SozLedigOhneKinder_VM');
  if (single && s.children > 0) add('SozAlleinerzieher_VM');
  return total;
}

export const churchIncomeFactor = (c: Confession, f: Factors) =>
  c === 'protestant' ? f.incomeProtestant : c === 'roman' ? f.incomeRoman : c === 'christ' ? f.incomeChrist : 0;
export const churchFortuneFactor = (c: Confession, f: Factors) =>
  c === 'protestant' ? f.fortuneProtestant : c === 'roman' ? f.fortuneRoman : c === 'christ' ? f.fortuneChrist : 0;

export interface TaxOptions {
  /** true = Einkommen ist bereits steuerbar (keine Abzüge), z. B. für Tests. */
  incomeIsTaxable?: boolean;
}

export function calculateIncomeAndWealthTax(
  ctx: TaxContext,
  s: TaxSubjectInput,
  opts: TaxOptions = {}
): TaxResult {
  const grossIncome = s.persons.reduce((sum, p) => sum + p.employmentNet + p.otherIncome, 0) + s.householdIncome;
  let dedIncome: Deductions = { canton: 0, bund: 0 };
  let dedFortune = 0;
  if (!opts.incomeIsTaxable) {
    dedIncome = incomeDeductions(ctx, s);
    dedFortune = fortuneDeductions(ctx, s);
  }
  const taxableIncomeCanton = Math.max(0, roundHalfEven(grossIncome - dedIncome.canton));
  const taxableIncomeBund = Math.max(0, roundHalfEven(grossIncome - dedIncome.bund));
  const taxableFortune = Math.max(0, roundHalfEven(s.fortune - dedFortune));

  const groups = getTarifGroups(s.relationship, s.children);

  // Direkte Bundessteuer
  let incomeBund = roundHalfEven(taxForTarif(ctx.bund, 'EINKOMMENSSTEUER', groups, taxableIncomeBund));
  incomeBund = Math.max(0, incomeBund - bundChildReduction(ctx.year) * s.children);

  // Kantons-, Gemeinde- und Kirchensteuer
  const baseIncome = taxForTarif(ctx.canton, 'EINKOMMENSSTEUER', groups, taxableIncomeCanton);
  const baseFortune = taxForTarif(ctx.canton, 'VERMOEGENSSTEUER', groups, taxableFortune);
  const f = ctx.factors;
  const n = s.persons.length || 1;
  const incomeCanton = roundHalfEven((baseIncome * f.incomeCanton) / 100);
  const incomeCity = roundHalfEven((baseIncome * f.incomeCity) / 100);
  const incomeChurch = roundHalfEven(
    s.persons.reduce((sum, p) => sum + (baseIncome * churchIncomeFactor(p.confession, f)) / n / 100, 0)
  );
  const fortuneCanton = roundHalfEven((baseFortune * f.fortuneCanton) / 100);
  const fortuneCity = roundHalfEven((baseFortune * f.fortuneCity) / 100);
  const fortuneChurch = roundHalfEven(
    s.persons.reduce((sum, p) => sum + (baseFortune * churchFortuneFactor(p.confession, f)) / n / 100, 0)
  );

  const pt = PERSONNEL_TAX[ctx.cantonId];
  const personnel = pt ? pt.amount * (pt.marriedBoth ? s.persons.length : 1) : 0;

  const total =
    incomeBund + incomeCanton + incomeCity + incomeChurch + fortuneCanton + fortuneCity + fortuneChurch + personnel;

  return {
    incomeBund,
    incomeCanton,
    incomeCity,
    incomeChurch,
    fortuneCanton,
    fortuneCity,
    fortuneChurch,
    personnel,
    total,
    taxableIncomeBund,
    taxableIncomeCanton,
    taxableFortune
  };
}

/** Summe der Einkommenssteuern (ohne Vermögens- und Personalsteuer). */
export const incomeTaxOnly = (r: TaxResult) => r.incomeBund + r.incomeCanton + r.incomeCity + r.incomeChurch;
