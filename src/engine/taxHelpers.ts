/**
 * Steuern im aktuellen Jahr (Aufschlüsselung) und Grenzsteuersatz –
 * für die Anzeige und um Steuerersparnisse von 3a und PK-Einkauf zu schätzen.
 */
import { PARAMS, ahvReferenceAge } from './params';
import type { Plan } from './plan';
import { yearlyAmount } from './plan';
import { socialDeductions } from './simulate';
import { calculateIncomeAndWealthTax } from './tax/incomeTax';
import { calculateCapitalWithdrawalTax } from './tax/capitalTax';
import type { TaxContext, TaxPersonInput, TaxResult, TaxSubjectInput } from './tax/types';

export interface CurrentTaxes {
  result: TaxResult;
  /** Bei Konkubinat: zweite Steuererklärung */
  result2?: TaxResult;
  total: number;
  marginalRate: number;
  netIncome: number;
  grossIncome: number;
  /** Laufende Renten (für Pensionierte) */
  pensionIncome: number;
}

function personInputs(plan: Plan, extra: number[] = []): { persons: TaxPersonInput[]; gross: number; net: number; pensionsTotal: number } {
  const calib = plan.persons.map((p) => {
    if (!p.netSalary || p.grossSalary <= 0) return 1;
    const computed = socialDeductions(p.grossSalary) + (p.hasPensionFund ? p.pkEmployeeContribution : 0);
    return computed > 0 ? Math.max(0.3, Math.min(3, (p.grossSalary - p.netSalary) / computed)) : 1;
  });
  let gross = 0;
  let net = 0;
  let pensionsTotal = 0;
  const persons = plan.persons.map((p, i) => {
    const age = plan.startYear - p.birthYear;
    const working = age < p.retirementAge && p.workload > 0;
    const g = working ? p.grossSalary : 0;
    const n = working
      ? Math.max(0, g - (socialDeductions(g) + (p.hasPensionFund ? p.pkEmployeeContribution : 0)) * calib[i])
      : 0;
    gross += g;
    net += n;
    const max = p.hasPensionFund ? PARAMS.pillar3a.maxWithPensionFund : Math.min(PARAMS.pillar3a.maxWithoutPensionFund, n * 0.2);
    // Laufende Renten (AHV inkl. 13. Rente, PK-Rente) für bereits Pensionierte
    let pensions = 0;
    if (age >= p.ahvClaimAge) {
      const ref = ahvReferenceAge(p.birthYear, p.sex);
      const diff = p.ahvClaimAge - ref;
      const f = diff < 0 ? 1 + diff * PARAMS.ahv.earlyReductionPerYear : 1 + (PARAMS.ahv.deferralSupplement[Math.min(5, Math.round(diff))] ?? 0);
      pensions += p.ahvMonthly * 13 * f;
    }
    if (age >= p.retirementAge && p.hasPensionFund) pensions += p.pkPensionCurrent ?? 0;
    pensionsTotal += pensions;
    return {
      confession: p.confession,
      employmentNet: n,
      otherIncome: pensions + (extra[i] ?? 0),
      pillar3a: working ? Math.min(p.p3aContribution, max) : 0,
      pkBuyIn: 0,
      hasPensionFund: p.hasPensionFund,
      travelExpenses: working ? p.travelExpenses : 0,
      workload: p.workload
    };
  });
  return { persons, gross, net, pensionsTotal };
}

function subjects(plan: Plan, persons: TaxPersonInput[]): TaxSubjectInput[] {
  const pf = plan.portfolio;
  const a = plan.assumptions;
  const invest = pf.securities * (pf.stockShare * a.dividendYield + (1 - pf.stockShare) * a.bondYield) + pf.cash * a.cashYield;
  const prop = plan.property;
  const mortgage = prop ? prop.mortgages.reduce((s, m) => s + m.amount, 0) : 0;
  const interest = prop ? prop.mortgages.reduce((s, m) => s + m.amount * m.rate, 0) : 0;
  const emw = prop && plan.startYear < a.reformYear ? prop.eigenmietwert : 0;
  const fortune = Math.max(0, pf.cash + pf.securities + (prop ? prop.value * prop.taxValueShare : 0) - mortgage - pf.otherDebts);
  const kids = plan.children.filter((c) => plan.startYear - c.birthYear >= 0 && plan.startYear - c.birthYear < c.dependentUntilAge);
  const childcare = kids.reduce((s, c) => s + (plan.startYear - c.birthYear < 12 ? c.childcareYearly : 0), 0);
  const base = (share: number, children: number) => ({
    children,
    householdIncome: (invest + emw) * share,
    investmentIncome: invest * share,
    debtInterest: emw > 0 ? interest * share : 0,
    maintenanceRealEstate: emw * 0.2 * share,
    childcareCosts: children > 0 ? childcare : 0,
    otherDeductions: 0,
    fortune: fortune * share,
    securities: pf.securities * share
  });
  if (plan.persons.length === 2 && plan.relationship === 'c') {
    return [
      { relationship: 'c', persons: [persons[0]], ...base(0.5, kids.length) },
      { relationship: 'c', persons: [persons[1]], ...base(0.5, 0) }
    ];
  }
  const married = plan.persons.length === 2 && plan.relationship === 'm';
  return [{ relationship: married ? 'm' : 's', persons: married ? persons : [persons[0]], ...base(1, kids.length) }];
}

export function currentTaxes(plan: Plan, tax: TaxContext): CurrentTaxes {
  const { persons, gross, net, pensionsTotal } = personInputs(plan);
  const subs = subjects(plan, persons);
  const results = subs.map((s) => calculateIncomeAndWealthTax(tax, s));
  const total = results.reduce((s, r) => s + r.total, 0);
  // Grenzsteuersatz: zusätzliche 1000 Franken Einkommen bei der Person mit dem höheren Lohn
  const idx = plan.persons.length === 2 && plan.persons[1].grossSalary > plan.persons[0].grossSalary ? 1 : 0;
  const extra = [0, 0];
  extra[idx] = 1000;
  const bumped = personInputs(plan, extra);
  const subs2 = subjects(plan, bumped.persons);
  const total2 = subs2.map((s) => calculateIncomeAndWealthTax(tax, s)).reduce((s, r) => s + r.total, 0);
  return {
    result: results[0],
    result2: results[1],
    total,
    marginalRate: Math.max(0, (total2 - total) / 1000),
    netIncome: net,
    grossIncome: gross,
    pensionIncome: pensionsTotal
  };
}

/** Kapitalbezugssteuer für einen Betrag im Wohnort (heutiger Tarif). */
export function capitalTax(plan: Plan, tax: TaxContext, amount: number): number {
  const married = plan.persons.length === 2 && plan.relationship === 'm';
  const rel = married ? 'm' : plan.relationship === 'c' ? 'c' : 's';
  return calculateCapitalWithdrawalTax(tax, amount, rel, 0, married ? plan.persons.map((p) => p.confession) : [plan.persons[0].confession]).total;
}

/** Ausgaben pro Jahr ohne Steuern (heute). */
export function currentSpending(plan: Plan): number {
  let s = 0;
  for (const e of plan.expenses) {
    if (e.fromYear && plan.startYear < e.fromYear) continue;
    if (e.toYear && plan.startYear > e.toYear) continue;
    if (e.isRent && plan.property) continue;
    s += yearlyAmount(e);
  }
  for (const c of plan.children) {
    const age = plan.startYear - c.birthYear;
    if (age >= 0 && age < c.dependentUntilAge) s += c.monthlyCost * 12 + (age < 12 ? c.childcareYearly : 0);
  }
  if (plan.property) {
    s += plan.property.mortgages.reduce((x, m) => x + m.amount * m.rate + (m.indirect ? 0 : m.amortization), 0);
    s += plan.property.value * plan.property.maintenanceRate;
  }
  return s;
}

