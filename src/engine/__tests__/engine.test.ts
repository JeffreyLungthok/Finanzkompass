import { describe, expect, test } from 'vitest';
import { ctxFor } from './helpers';
import { calculateIncomeAndWealthTax } from '../tax/incomeTax';
import { calculateCapitalWithdrawalTax } from '../tax/capitalTax';
import type { TaxSubjectInput } from '../tax/types';
import { createDefaultPlan, defaultPerson, type Plan } from '../plan';
import { runMonteCarlo } from '../montecarlo';
import { prepare, simulatePath } from '../simulate';
import { expectedMarketPath } from '../market';
import { decide, nextStep, type JourneyState } from '../journey';
import { decodeShare, encodeShare } from '../../lib/planIO';

const ZH = 261; // Stadt Zürich
const subject = (rel: 's' | 'm', income: number): TaxSubjectInput => {
  const p = { confession: 'none' as const, employmentNet: income, otherIncome: 0, pillar3a: 0, pkBuyIn: 0, hasPensionFund: true };
  return {
    relationship: rel,
    children: 0,
    persons: rel === 'm' ? [p, { ...p, employmentNet: 0 }] : [p],
    householdIncome: 0,
    investmentIncome: 0,
    debtInterest: 0,
    maintenanceRealEstate: 0,
    childcareCosts: 0,
    otherDeductions: 0,
    fortune: 0,
    securities: 0
  };
};

function couplePlan(): Plan {
  const plan = createDefaultPlan(2026);
  plan.relationship = 'm';
  plan.location = { bfsId: ZH, cantonId: 26, name: 'Zürich', canton: 'ZH' };
  plan.persons = [
    defaultPerson('p1', 2026, { birthYear: 1985, grossSalary: 120000, name: 'A', ahvMonthly: 2520 }),
    defaultPerson('p2', 2026, { birthYear: 1984, grossSalary: 90000, name: 'B', ahvMonthly: 2520 })
  ];
  return plan;
}

describe('Bundessteuer 2026 (Tarif ESTV)', () => {
  test('ledig, steuerbar 100’000', () => {
    const r = calculateIncomeAndWealthTax(ctxFor(ZH), subject('s', 100000), { incomeIsTaxable: true });
    expect(r.incomeBund).toBe(2684);
  });
  test('verheiratet, steuerbar 100’000', () => {
    const r = calculateIncomeAndWealthTax(ctxFor(ZH), subject('m', 100000), { incomeIsTaxable: true });
    expect(r.incomeBund).toBe(1816);
  });
  test('Kapitalleistung Bund: ein Fünftel des Tarifs', () => {
    expect(calculateCapitalWithdrawalTax(ctxFor(ZH), 100000, 's', 0, ['none']).bund).toBe(537);
  });
  test('Kanton und Gemeinde werden mit Steuerfüssen gerechnet', () => {
    const r = calculateIncomeAndWealthTax(ctxFor(ZH), subject('s', 100000), { incomeIsTaxable: true });
    expect(r.incomeCity / r.incomeCanton).toBeCloseTo(ctxFor(ZH).factors.incomeCity / ctxFor(ZH).factors.incomeCanton, 2);
  });
});

describe('Simulation', () => {
  test('ist reproduzierbar und liefert endliche Werte', () => {
    const plan = couplePlan();
    const a = runMonteCarlo(plan, ctxFor(ZH), 200);
    const b = runMonteCarlo(plan, ctxFor(ZH), 200);
    expect(a.successRate).toBe(b.successRate);
    expect(a.successRate).toBeGreaterThanOrEqual(0);
    expect(a.successRate).toBeLessThanOrEqual(1);
    expect(a.expected.records.every((r) => Number.isFinite(r.netWorth) && Number.isFinite(r.taxTotal))).toBe(true);
  });

  test('AHV-Plafonierung für Ehepaare inkl. 13. Rente', () => {
    const plan = couplePlan();
    const prep = prepare(plan, ctxFor(ZH));
    const out = simulatePath(prep, expectedMarketPath(plan.assumptions, prep.years), true);
    const both = out.records!.find((r) => r.ahvByPerson.every((x) => x > 0))!;
    expect(both.ahv).toBeCloseTo(3780 * 13, 0);
  });

  test('gestaffelte 3a-Bezüge senken die Kapitalbezugssteuer', () => {
    const run = (accounts: number) => {
      const plan = couplePlan();
      plan.persons = plan.persons.map((p) => ({ ...p, p3aAccounts: accounts, pkCapitalShare: 0 }));
      const prep = prepare(plan, ctxFor(ZH));
      return simulatePath(prep, expectedMarketPath(plan.assumptions, prep.years), true).records!.reduce((s, r) => s + r.taxCapital, 0);
    };
    expect(run(5)).toBeLessThan(run(1));
  });

  test('Frühpensionierung kostet AHV-Beiträge als Nichterwerbstätige', () => {
    const plan = createDefaultPlan(2026);
    plan.location = { bfsId: ZH, cantonId: 26, name: 'Zürich', canton: 'ZH' };
    plan.persons = [defaultPerson('p1', 2026, { birthYear: 1970, retirementAge: 60 })];
    const prep = prepare(plan, ctxFor(ZH));
    const recs = simulatePath(prep, expectedMarketPath(plan.assumptions, prep.years), true).records!;
    const ne = recs.filter((r) => r.ahvNonEmployed > 0).map((r) => r.ages[0]);
    expect(ne[0]).toBe(60);
    expect(ne[ne.length - 1]).toBe(64);
  });

  test('Eigenmietwert entfällt ab dem Systemwechsel', () => {
    const plan = couplePlan();
    plan.property = { value: 1000000, purchaseYear: 2015, purchasePrice: 800000, taxValueShare: 0.7, eigenmietwert: 25000, maintenanceRate: 0.01, buildingAge: 20, mortgages: [{ id: 'm', amount: 300000, rate: 0.015, fixedUntil: 2035, amortization: 0, indirect: false }] };
    const prep = prepare(plan, ctxFor(ZH));
    const recs = simulatePath(prep, expectedMarketPath(plan.assumptions, prep.years), true).records!;
    const before = recs.find((r) => r.year === 2028)!;
    const after = recs.find((r) => r.year === 2029)!;
    // EMW 25’000 > Zins 4’500 + Unterhalt 5’000: Steuern sinken
    expect(after.taxIncome).toBeLessThan(before.taxIncome);
  });
});

describe('Lebenssimulation', () => {
  test('läuft bis zum Lebensauszug', () => {
    const plan = couplePlan();
    const tax = ctxFor(ZH);
    let state: JourneyState = { seed: 42, decisions: [] };
    for (let i = 0; i < 40; i++) {
      const step = nextStep(plan, tax, state);
      if (!step.card) break;
      state = decide(plan, tax, state, step.card, step.card.options[0]);
    }
    expect(nextStep(plan, tax, state).card).toBeNull();
    expect(state.decisions.length).toBeGreaterThan(6);
    // Jahre der Entscheide steigen monoton
    const years = state.decisions.map((d) => d.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });
});

describe('Teilen', () => {
  test('Plan überlebt den Link', () => {
    const plan = couplePlan();
    const decoded = decodeShare(encodeShare(plan, { seed: 1, decisions: [] }));
    expect(decoded?.plan.persons[1].grossSalary).toBe(90000);
    expect(decoded?.journey?.seed).toBe(1);
  });
});
