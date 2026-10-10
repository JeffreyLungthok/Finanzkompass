/**
 * Monte-Carlo-Simulation: viele mögliche Zukünfte mit zufälligen Börsenjahren,
 * Teuerung und Zinsen. Ergebnis sind Bandbreiten (Perzentile) und die
 * Wahrscheinlichkeit, dass das Geld bis zum Planungshorizont reicht.
 */
import type { Plan } from './plan';
import type { TaxContext } from './tax/types';
import { expectedMarketPath, generateMarketPath } from './market';
import { prepare, simulatePath, type PathSummary, type Prepared, type YearRecord } from './simulate';

export interface Bands {
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
}

export interface MonteCarloResult {
  years: number[];
  simulations: number;
  successRate: number;
  /** Erfolg, wenn die Immobilie als Reserve mitzählt */
  successRateWithProperty: number;
  netWorth: Bands;
  liquid: Bands;
  /** Anteil Pfade, die im Jahr noch nicht gescheitert sind */
  survival: number[];
  expected: { records: YearRecord[]; summary: PathSummary };
  retirement: {
    year: number;
    liquidP10: number;
    liquidP50: number;
    liquidP90: number;
  };
  end: { p10: number; p50: number; p90: number };
  medianFailAge: number | null;
  totalTaxesMedian: number;
}

const percentile = (sorted: Float64Array, q: number) => {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

function bands(matrix: Float64Array, paths: number, years: number): Bands {
  const out: Bands = { p10: [], p25: [], p50: [], p75: [], p90: [] };
  const col = new Float64Array(paths);
  for (let t = 0; t < years; t++) {
    for (let k = 0; k < paths; k++) col[k] = matrix[k * years + t];
    col.sort();
    out.p10.push(percentile(col, 0.1));
    out.p25.push(percentile(col, 0.25));
    out.p50.push(percentile(col, 0.5));
    out.p75.push(percentile(col, 0.75));
    out.p90.push(percentile(col, 0.9));
  }
  return out;
}

export const pathSeed = (base: number, k: number) => (base + k * 7919 + 1) >>> 0;

export function runMonteCarlo(plan: Plan, tax: TaxContext, simulations = plan.assumptions.simulations): MonteCarloResult {
  const prep = prepare(plan, tax);
  return runPrepared(prep, simulations);
}

export function runPrepared(prep: Prepared, simulations: number): MonteCarloResult {
  const { years, startYear, plan } = prep;
  const nw = new Float64Array(simulations * years);
  const lq = new Float64Array(simulations * years);
  const failYears: (number | null)[] = [];
  const liquidFail: (number | null)[] = [];
  const taxes = new Float64Array(simulations);
  const retireLiquid = new Float64Array(simulations);
  const endNw = new Float64Array(simulations);

  for (let k = 0; k < simulations; k++) {
    const market = generateMarketPath(plan.assumptions, years, pathSeed(plan.assumptions.seed, k));
    const out = simulatePath(prep, market, false);
    nw.set(out.netWorth, k * years);
    lq.set(out.liquid, k * years);
    failYears.push(out.summary.failedYear);
    liquidFail.push(out.summary.liquidFailedYear);
    taxes[k] = out.summary.totalTaxes;
    retireLiquid[k] = out.summary.liquidAtRetirement;
    endNw[k] = out.summary.endNetWorth;
  }

  const survival: number[] = [];
  for (let t = 0; t < years; t++) {
    const y = startYear + t;
    survival.push(failYears.filter((f) => f === null || f > y).length / simulations);
  }
  const successRate = failYears.filter((f) => f === null).length / simulations;
  // Mit Immobilie: gescheitert nur, wenn auch das Reinvermögen negativ wird
  let okWithProperty = 0;
  for (let k = 0; k < simulations; k++) {
    let ok = true;
    for (let t = 0; t < years; t++) {
      if (nw[k * years + t] < 0) {
        ok = false;
        break;
      }
    }
    if (ok) okWithProperty++;
  }

  const fails = failYears.filter((f): f is number => f !== null).sort((a, b) => a - b);
  const firstPerson = plan.persons[0];
  const medianFailAge = fails.length > simulations / 2 ? fails[Math.floor(simulations / 2)] - firstPerson.birthYear : null;

  const expectedOut = simulatePath(prep, expectedMarketPath(plan.assumptions, years), true);
  retireLiquid.sort();
  endNw.sort();
  taxes.sort();

  return {
    years: Array.from({ length: years }, (_, t) => startYear + t),
    simulations,
    successRate,
    successRateWithProperty: Math.max(successRate, okWithProperty / simulations),
    netWorth: bands(nw, simulations, years),
    liquid: bands(lq, simulations, years),
    survival,
    expected: { records: expectedOut.records!, summary: expectedOut.summary },
    retirement: {
      year: prep.retirementYear,
      liquidP10: percentile(retireLiquid, 0.1),
      liquidP50: percentile(retireLiquid, 0.5),
      liquidP90: percentile(retireLiquid, 0.9)
    },
    end: { p10: percentile(endNw, 0.1), p50: percentile(endNw, 0.5), p90: percentile(endNw, 0.9) },
    medianFailAge,
    totalTaxesMedian: percentile(taxes, 0.5)
  };
}

/** Erfolgsquote mit einer zusätzlichen jährlichen Ausgabe (für den Ausgaben-Spielraum). */
function successWithDelta(plan: Plan, tax: TaxContext, delta: number, sims: number, fromYear: number): number {
  const p: Plan = {
    ...plan,
    events: [...plan.events, { id: '__delta', type: 'expense_change', year: fromYear, yearly: delta, label: 'Spielraum' }]
  };
  const prep = prepare(p, tax);
  let ok = 0;
  for (let k = 0; k < sims; k++) {
    const market = generateMarketPath(p.assumptions, prep.years, pathSeed(p.assumptions.seed, k));
    if (simulatePath(prep, market, false).summary.failedYear === null) ok++;
  }
  return ok / sims;
}

/**
 * Wie viel könnte der Haushalt pro Jahr mehr (positiv) oder müsste er weniger (negativ)
 * ausgeben, damit die Erfolgsquote dem Zielwert entspricht?
 */
export function spendingCapacity(plan: Plan, tax: TaxContext, target = 0.85, sims = 250): number {
  const fromYear = plan.startYear;
  const baseExpenses = 60000;
  let lo = -baseExpenses;
  let hi = baseExpenses * 2;
  if (successWithDelta(plan, tax, hi, sims, fromYear) >= target) return hi;
  if (successWithDelta(plan, tax, lo, sims, fromYear) < target) return lo;
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    if (successWithDelta(plan, tax, mid, sims, fromYear) >= target) lo = mid;
    else hi = mid;
  }
  return Math.round(lo / 100) * 100;
}
