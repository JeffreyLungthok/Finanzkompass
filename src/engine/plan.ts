/**
 * Das Datenmodell eines Finanzplans. Alle Beträge in heutigen Franken (Kaufkraft 2026),
 * ausser wo ausdrücklich «nominal» steht.
 */
import type { Confession, TaxRelationship } from './tax/types';
import { PARAMS } from './params';

export type Sex = 'f' | 'm';
export type PersonId = 'p1' | 'p2';

export interface PersonPlan {
  id: PersonId;
  name: string;
  birthYear: number;
  sex: Sex;
  confession: Confession;
  // Erwerb
  grossSalary: number;
  /** Optional: Nettolohn gemäss Lohnausweis (Ziffer 11). Kalibriert die Lohnabzüge. */
  netSalary?: number;
  workload: number;
  /** Reale Lohnentwicklung pro Jahr (zusätzlich zur Teuerung). */
  salaryGrowth: number;
  /** Ab diesem Alter wächst der Lohn real nicht mehr. */
  salaryPeakAge: number;
  travelExpenses: number;
  retirementAge: number;
  // AHV
  ahvMonthly: number;
  ahvClaimAge: number;
  // Pensionskasse
  hasPensionFund: boolean;
  pkBalance: number;
  /** Sparbeiträge pro Jahr (Arbeitgeber + Arbeitnehmer) gemäss PK-Ausweis. */
  pkSavingsContribution: number;
  /** Eigener PK-Lohnabzug pro Jahr (Spar- und Risikobeitrag). */
  pkEmployeeContribution: number;
  /** Verzinsung des Altersguthabens, nominal. */
  pkInterest: number;
  pkConversionRate: number;
  pkProjectedAt65?: number;
  pkBuyInPotential: number;
  /** Anteil, der als Kapital bezogen wird (0–1). */
  pkCapitalShare: number;
  /** Bereits laufende PK-Rente pro Jahr (nominal fix), für Pensionierte. */
  pkPensionCurrent?: number;
  // Säule 3a
  p3aBalance: number;
  p3aContribution: number;
  p3aInvested: boolean;
  p3aStockShare: number;
  p3aAccounts: number;
}

export interface Child {
  id: string;
  name: string;
  birthYear: number;
  /** Lebenshaltungskosten pro Monat. */
  monthlyCost: number;
  /** Fremdbetreuung pro Jahr bis 12. */
  childcareYearly: number;
  /** Bis zu welchem Alter das Kind finanziell abhängig ist. */
  dependentUntilAge: number;
}

export type ExpenseCategory =
  | 'wohnen'
  | 'krankenkasse'
  | 'versicherungen'
  | 'mobilitaet'
  | 'lebenshaltung'
  | 'freizeit'
  | 'ferien'
  | 'kinder'
  | 'sonstiges';

export interface Expense {
  id: string;
  label: string;
  amount: number;
  period: 'monthly' | 'yearly';
  category: ExpenseCategory;
  /** Faktor im Ruhestand: 0 = fällt weg, 1 = gleich, 1.2 = steigt */
  retirementFactor: number;
  /** Miete fällt weg, sobald Wohneigentum besteht. */
  isRent?: boolean;
  fromYear?: number;
  toYear?: number;
}

export interface Mortgage {
  id: string;
  amount: number;
  /** Zins nominal */
  rate: number;
  /** Zinsbindung bis (Jahr), danach Marktzins */
  fixedUntil: number;
  /** Amortisation pro Jahr */
  amortization: number;
  /** Indirekte Amortisation über die Säule 3a */
  indirect: boolean;
}

export interface Property {
  value: number;
  purchaseYear: number;
  purchasePrice: number;
  /** Steuerwert in Prozent des Marktwerts */
  taxValueShare: number;
  /** Eigenmietwert pro Jahr */
  eigenmietwert: number;
  /** Unterhalt und Nebenkosten pro Jahr in Prozent des Werts */
  maintenanceRate: number;
  buildingAge: number;
  mortgages: Mortgage[];
  /** Kauf nach dem Systemwechsel als Ersterwerber */
  firstBuyer?: boolean;
}

export interface Portfolio {
  cash: number;
  securities: number;
  stockShare: number;
  /** Notgroschen in Monatsausgaben */
  emergencyMonths: number;
  otherDebts: number;
}

export interface Assumptions {
  inflation: number;
  inflationVol: number;
  stockReturn: number;
  stockVol: number;
  bondReturn: number;
  bondVol: number;
  dividendYield: number;
  bondYield: number;
  cashYield: number;
  propertyGrowth: number;
  propertyVol: number;
  mortgageRateFuture: number;
  /** Reale Anpassung der AHV-Renten pro Jahr (Mischindex abzüglich Teuerung) */
  ahvRealIndexation: number;
  endAge: number;
  simulations: number;
  reformYear: number;
  seed: number;
}

export type LifeEvent =
  | { id: string; type: 'house_purchase'; year: number; price: number; equityFromSavings: number; fromPk: number; from3a: number; rate: number; fixedYears: number; amortizationYears: number }
  | { id: string; type: 'house_sale'; year: number; price: number; newRentMonthly: number }
  | { id: string; type: 'child'; year: number; name: string; monthlyCost: number; childcareYearly: number }
  | { id: string; type: 'workload'; year: number; person: PersonId; workload: number; untilYear?: number }
  | { id: string; type: 'salary'; year: number; person: PersonId; grossSalary: number }
  | { id: string; type: 'inheritance'; year: number; amount: number; from: 'eltern' | 'andere' }
  | { id: string; type: 'pk_buyin'; year: number; person: PersonId; amount: number; years: number }
  | { id: string; type: 'one_off_expense'; year: number; amount: number; label: string }
  | { id: string; type: 'one_off_income'; year: number; amount: number; label: string }
  | { id: string; type: 'expense_change'; year: number; yearly: number; label: string; untilYear?: number }
  | { id: string; type: 'allocation'; year: number; stockShare: number }
  | { id: string; type: 'amortize'; year: number; amount: number }
  | { id: string; type: 'gift'; year: number; amount: number; label: string };

export type LifeEventType = LifeEvent['type'];

export interface Location {
  bfsId: number;
  cantonId: number;
  name: string;
  canton: string;
}

export interface Plan {
  v: 1;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  startYear: number;
  relationship: TaxRelationship;
  location: Location | null;
  persons: PersonPlan[];
  children: Child[];
  expenses: Expense[];
  portfolio: Portfolio;
  property: Property | null;
  events: LifeEvent[];
  assumptions: Assumptions;
}

// ---------- Hilfsfunktionen ----------

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
export function randomId(length = 10): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

/** Typische Sparbeiträge (Arbeitgeber + Arbeitnehmer) einer Pensionskasse, leicht über BVG-Minimum. */
export function estimatePkSavings(grossSalary: number, age: number): number {
  const b = PARAMS.bvg;
  if (grossSalary < b.entryThreshold) return 0;
  const insured = Math.max(b.minCoordinatedSalary, grossSalary - b.coordinationDeduction);
  const band = b.savingsCredits.find((s) => age >= s.from && age <= s.to);
  const rate = band ? band.rate : age < 25 ? 0 : 0.18;
  return Math.round((insured * rate * 1.15) / 100) * 100;
}

/** Eigener PK-Lohnabzug: halbe Sparbeiträge plus Risikobeitrag (ca. 1 % des Lohns). */
export const estimatePkEmployee = (grossSalary: number, savings: number) =>
  Math.round((savings * 0.5 + grossSalary * 0.01) / 100) * 100;

export function defaultPerson(id: PersonId, startYear: number, overrides: Partial<PersonPlan> = {}): PersonPlan {
  const birthYear = overrides.birthYear ?? startYear - 40;
  const gross = overrides.grossSalary ?? 95000;
  const age = startYear - birthYear;
  const savings = estimatePkSavings(gross, age);
  return {
    id,
    name: id === 'p1' ? 'Person 1' : 'Person 2',
    birthYear,
    sex: id === 'p1' ? 'f' : 'm',
    confession: 'none',
    grossSalary: gross,
    workload: 100,
    salaryGrowth: 0.01,
    salaryPeakAge: 55,
    travelExpenses: 1500,
    retirementAge: 65,
    ahvMonthly: 2300,
    ahvClaimAge: 65,
    hasPensionFund: true,
    pkBalance: Math.round(Math.max(0, (age - 25) * savings * 1.1) / 1000) * 1000,
    pkSavingsContribution: savings,
    pkEmployeeContribution: estimatePkEmployee(gross, savings),
    pkInterest: 0.0175,
    pkConversionRate: 0.054,
    pkBuyInPotential: 0,
    pkCapitalShare: 0,
    p3aBalance: Math.max(0, Math.min(age - 25, 20)) * 5000,
    p3aContribution: PARAMS.pillar3a.maxWithPensionFund,
    p3aInvested: true,
    p3aStockShare: 0.6,
    p3aAccounts: 3,
    ...overrides
  };
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  inflation: 0.01,
  inflationVol: 0.01,
  stockReturn: 0.04,
  stockVol: 0.16,
  bondReturn: 0.005,
  bondVol: 0.045,
  dividendYield: 0.025,
  bondYield: 0.012,
  cashYield: 0.004,
  propertyGrowth: 0.006,
  propertyVol: 0.05,
  mortgageRateFuture: 0.025,
  ahvRealIndexation: 0,
  endAge: 95,
  simulations: 1000,
  reformYear: PARAMS.wohneigentum.reformYear,
  seed: 20260101
};

/** Startwerte für das Budget – der Nutzer passt sie an. Paare: etwas höhere Werte. */
export function defaultExpenses(couple = false): Expense[] {
  const k = couple ? 1.55 : 1;
  const r = (v: number) => Math.round((v * k) / 50) * 50;
  return [
    { id: randomId(6), label: 'Miete inkl. Nebenkosten', amount: r(1900), period: 'monthly', category: 'wohnen', retirementFactor: 1, isRent: true },
    { id: randomId(6), label: 'Krankenkasse', amount: r(480), period: 'monthly', category: 'krankenkasse', retirementFactor: 1.1 },
    { id: randomId(6), label: 'Lebensmittel & Haushalt', amount: r(750), period: 'monthly', category: 'lebenshaltung', retirementFactor: 1 },
    { id: randomId(6), label: 'Mobilität (ÖV, Auto)', amount: r(350), period: 'monthly', category: 'mobilitaet', retirementFactor: 0.7 },
    { id: randomId(6), label: 'Versicherungen, Telefon, Abos', amount: r(250), period: 'monthly', category: 'versicherungen', retirementFactor: 1 },
    { id: randomId(6), label: 'Freizeit, Kleider, Restaurant', amount: r(650), period: 'monthly', category: 'freizeit', retirementFactor: 1 },
    { id: randomId(6), label: 'Ferien', amount: r(4500), period: 'yearly', category: 'ferien', retirementFactor: 1.2 }
  ];
}

export function createDefaultPlan(startYear: number = PARAMS.year): Plan {
  const now = new Date().toISOString();
  return {
    v: 1,
    id: randomId(11),
    name: 'Mein Finanzplan',
    createdAt: now,
    updatedAt: now,
    startYear,
    relationship: 's',
    location: null,
    persons: [defaultPerson('p1', startYear)],
    children: [],
    expenses: defaultExpenses(),
    portfolio: { cash: 40000, securities: 60000, stockShare: 0.6, emergencyMonths: 4, otherDebts: 0 },
    property: null,
    events: [],
    assumptions: { ...DEFAULT_ASSUMPTIONS }
  };
}

export const yearlyAmount = (e: Expense) => (e.period === 'monthly' ? e.amount * 12 : e.amount);

export const personAge = (p: PersonPlan, year: number) => year - p.birthYear;

export function householdLabel(plan: Plan): string {
  if (plan.persons.length === 1) return plan.children.length ? 'Alleinerziehend' : 'Alleinstehend';
  return plan.relationship === 'm' ? 'Verheiratet' : 'Konkubinat';
}
