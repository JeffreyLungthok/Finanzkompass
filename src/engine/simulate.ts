/**
 * Jahresweise Simulation eines Haushalts – von heute bis zum Planungshorizont.
 * Gerechnet wird in heutigen Franken (real). Nominale Grössen (Hypothekarschuld,
 * PK-Rente ohne Teuerungsausgleich, PK-Verzinsung) werden über den Teuerungsindex umgerechnet.
 */
import { PARAMS, TRANSFER_TAX, ahvReferenceAge } from './params';
import type { LifeEvent, Plan, PersonPlan } from './plan';
import { yearlyAmount } from './plan';
import type { MarketYear } from './market';
import { calculateIncomeAndWealthTax, incomeTaxOnly } from './tax/incomeTax';
import { calculateCapitalWithdrawalTax } from './tax/capitalTax';
import type { TaxContext, TaxPersonInput, TaxSubjectInput } from './tax/types';
import { estimateGrundstueckgewinnsteuer } from './specialTaxes';

export interface YearRecord {
  year: number;
  ages: number[];
  retired: boolean[];
  grossSalary: number;
  netSalary: number;
  ahv: number;
  pkPension: number;
  allowances: number;
  otherIncome: number;
  capitalWithdrawals: number;
  expenses: number;
  housing: number;
  children: number;
  taxIncome: number;
  taxWealth: number;
  taxCapital: number;
  taxTotal: number;
  p3aContributions: number;
  pkBuyIns: number;
  ahvNonEmployed: number;
  oneOff: number;
  savings: number;
  cash: number;
  securities: number;
  p3a: number;
  pk: number;
  pkByPerson: number[];
  p3aByPerson: number[];
  pkPensionByPerson: number[];
  ahvByPerson: number[];
  propertyValue: number;
  mortgage: number;
  netWorth: number;
  liquid: number;
  shortfall: number;
  inflationIndex: number;
  events: string[];
}

export interface PathSummary {
  failedYear: number | null;
  /** Jahr, ab dem nur noch die Immobilie Reserven hätte */
  liquidFailedYear: number | null;
  retirementYear: number;
  liquidAtRetirement: number;
  netWorthAtRetirement: number;
  endNetWorth: number;
  endLiquid: number;
  totalTaxes: number;
  capitalTaxes: number;
  minLiquid: number;
}

export interface SimulationOutput {
  records: YearRecord[] | null;
  summary: PathSummary;
  /** Für Monte-Carlo: Vermögen pro Jahr */
  netWorth: Float64Array;
  liquid: Float64Array;
}

/** Vorbereitete, unveränderliche Daten für viele Simulationsläufe. */
export interface Prepared {
  plan: Plan;
  tax: TaxContext;
  years: number;
  startYear: number;
  eventsByYear: Map<number, LifeEvent[]>;
  baseCalibration: number[];
  savings0: number[];
  initialWorkload: number[];
  refAge: number[];
  retirementYear: number;
}

const bvgBandRate = (age: number) => {
  const band = PARAMS.bvg.savingsCredits.find((s) => age >= s.from && age <= s.to);
  if (band) return band.rate;
  return age < 25 ? 0.07 : 0.18;
};

export function socialDeductions(gross: number) {
  return (
    gross * PARAMS.ahv.employeeRate +
    Math.min(gross, PARAMS.alv.maxSalary) * PARAMS.alv.rate +
    Math.min(gross, PARAMS.nbu.maxSalary) * PARAMS.nbu.rate
  );
}

export function prepare(plan: Plan, tax: TaxContext): Prepared {
  const startYear = plan.startYear;
  const lastYear = Math.max(...plan.persons.map((p) => p.birthYear + plan.assumptions.endAge));
  const years = Math.max(1, lastYear - startYear + 1);
  const eventsByYear = new Map<number, LifeEvent[]>();
  for (const e of plan.events) {
    const list = eventsByYear.get(e.year) ?? [];
    list.push(e);
    eventsByYear.set(e.year, list);
  }
  // Kalibrierung der Lohnabzüge, falls der Nettolohn bekannt ist
  const baseCalibration = plan.persons.map((p) => {
    if (!p.netSalary || p.grossSalary <= 0) return 1;
    const computed = socialDeductions(p.grossSalary) + (p.hasPensionFund ? p.pkEmployeeContribution : 0);
    const actual = p.grossSalary - p.netSalary;
    if (computed <= 0) return 1;
    return Math.max(0.3, Math.min(3, actual / computed));
  });
  const retirementYear = Math.min(...plan.persons.map((p) => p.birthYear + p.retirementAge));
  return {
    plan,
    tax,
    years,
    startYear,
    eventsByYear,
    baseCalibration,
    savings0: plan.persons.map((p) => p.pkSavingsContribution),
    initialWorkload: plan.persons.map((p) => Math.max(1, p.workload)),
    refAge: plan.persons.map((p) => ahvReferenceAge(p.birthYear, p.sex)),
    retirementYear
  };
}

interface PersonState {
  pk: number;
  p3a: number;
  p3aAccountsLeft: number;
  grossOverride: number | null;
  grossOverrideAge: number;
  workload: number;
  workloadUntil: number | null;
  workloadRestore: number;
  pkPensionNominal: number;
  pkRetired: boolean;
  buyIns: { from: number; to: number; amount: number }[];
  buyInRemaining: number;
  lastBuyInYear: number;
  pledged3a: number;
}

interface MortgageState {
  amount: number; // nominal
  rate: number;
  fixedUntil: number;
  amortization: number; // nominal pro Jahr
  indirect: boolean;
}

function ahvFactor(claimAge: number, refAge: number): number {
  const diff = claimAge - refAge;
  if (diff < 0) return Math.max(0, 1 + diff * PARAMS.ahv.earlyReductionPerYear);
  const table = PARAMS.ahv.deferralSupplement;
  const lo = Math.min(table.length - 1, Math.floor(diff));
  const hi = Math.min(table.length - 1, lo + 1);
  const frac = Math.min(1, diff - lo);
  return 1 + table[lo] + (table[hi] - table[lo]) * frac;
}

function ahvNonEmployedContribution(base: number): number {
  const ne = PARAMS.ahv.nonEmployed;
  if (base < ne.threshold) return ne.min;
  const steps = Math.floor((base - ne.threshold) / ne.stepWealth) + 1;
  return Math.min(ne.max, ne.min + steps * ne.stepContribution);
}

/**
 * Simuliert einen Pfad. Mit `record=true` werden alle Jahreswerte festgehalten.
 */
export function simulatePath(prep: Prepared, market: MarketYear[], record: boolean): SimulationOutput {
  const { plan, tax, years, startYear } = prep;
  const a = plan.assumptions;
  const persons = plan.persons;
  const n = persons.length;
  const married = plan.relationship === 'm' && n === 2;
  const concubinage = plan.relationship === 'c' && n === 2;

  // ---- Zustand ----
  const ps: PersonState[] = persons.map((p) => ({
    pk: p.hasPensionFund ? p.pkBalance : 0,
    p3a: p.p3aBalance,
    p3aAccountsLeft: Math.max(1, Math.round(p.p3aAccounts)),
    grossOverride: null,
    grossOverrideAge: 0,
    workload: p.workload,
    workloadUntil: null,
    workloadRestore: p.workload,
    pkPensionNominal: startYear - p.birthYear >= p.retirementAge ? p.pkPensionCurrent ?? 0 : 0,
    pkRetired: startYear - p.birthYear >= p.retirementAge && (p.pkPensionCurrent ?? 0) > 0,
    buyIns: [],
    buyInRemaining: p.pkBuyInPotential,
    lastBuyInYear: -100,
    pledged3a: 0
  }));
  let cash = plan.portfolio.cash;
  let securities = plan.portfolio.securities;
  let stockShare = plan.portfolio.stockShare;
  let otherDebts = plan.portfolio.otherDebts;
  let cpi = 1;
  let unfunded = 0;
  const children = plan.children.map((c) => ({ ...c }));
  const extraExpenses: { from: number; to: number; yearly: number }[] = [];
  let rentSuspended = false;
  let extraRent = 0;

  let property = plan.property
    ? {
        ...plan.property,
        purchaseYearActual: plan.property.purchaseYear,
        firstBuyerFrom: plan.property.firstBuyer ? plan.property.purchaseYear : null as number | null
      }
    : null;
  let mortgages: MortgageState[] = plan.property
    ? plan.property.mortgages.map((m) => ({ amount: m.amount, rate: m.rate, fixedUntil: m.fixedUntil, amortization: m.amortization, indirect: m.indirect }))
    : [];
  if (property) rentSuspended = true;

  const records: YearRecord[] | null = record ? [] : null;
  const netWorthArr = new Float64Array(years);
  const liquidArr = new Float64Array(years);
  let failedYear: number | null = null;
  let liquidFailedYear: number | null = null;
  let totalTaxes = 0;
  let capitalTaxes = 0;
  let minLiquid = Infinity;
  let liquidAtRetirement = 0;
  let netWorthAtRetirement = 0;

  const mortgageReal = () => mortgages.reduce((s, m) => s + m.amount, 0) / cpi;

  for (let t = 0; t < years; t++) {
    const y = startYear + t;
    const m = market[t];
    const evLabels: string[] = record ? [] : (null as unknown as string[]);
    let oneOff = 0; // positive = Ausgabe, negative = Einnahme
    let otherIncomeYear = 0;
    let capitalWithdrawalByPerson = new Array(n).fill(0);
    let capitalTaxYear = 0;
    let housePurchaseCash = 0;

    // ---------- Ereignisse ----------
    for (const e of prep.eventsByYear.get(y) ?? []) {
      switch (e.type) {
        case 'house_purchase': {
          if (property) break;
          const fromPk = Math.min(e.fromPk, ps.reduce((s, x) => s + x.pk, 0));
          const from3a = Math.min(e.from3a, ps.reduce((s, x) => s + x.p3a, 0));
          // Vorbezüge anteilig von den Personen
          const takeFrom = (key: 'pk' | 'p3a', amount: number) => {
            const total = ps.reduce((s, x) => s + x[key], 0);
            if (total <= 0) return;
            ps.forEach((x, i) => {
              const part = (x[key] / total) * amount;
              x[key] -= part;
              capitalWithdrawalByPerson[i] += part;
            });
          };
          takeFrom('pk', fromPk);
          takeFrom('p3a', from3a);
          const transfer = TRANSFER_TAX[tax.cantonId] ?? { rate: 0.01 };
          const taxableBase = Math.max(0, e.price - (transfer.exemptPrimary ?? 0));
          const costs = taxableBase * transfer.rate + e.price * 0.004;
          const equity = e.equityFromSavings + fromPk + from3a;
          const mortgageTotal = Math.max(0, e.price - equity);
          housePurchaseCash = e.equityFromSavings + costs;
          const first = Math.min(mortgageTotal, e.price * PARAMS.mortgage.firstMortgageLtv);
          const second = mortgageTotal - first;
          mortgages = [];
          if (first > 0) mortgages.push({ amount: first * cpi, rate: e.rate, fixedUntil: y + e.fixedYears, amortization: 0, indirect: false });
          if (second > 0)
            mortgages.push({
              amount: second * cpi,
              rate: e.rate,
              fixedUntil: y + e.fixedYears,
              amortization: (second * cpi) / Math.max(1, e.amortizationYears),
              indirect: false
            });
          property = {
            value: e.price,
            purchaseYear: y,
            purchasePrice: e.price,
            taxValueShare: 0.7,
            eigenmietwert: e.price * 0.025,
            maintenanceRate: 0.01,
            buildingAge: 10,
            mortgages: [],
            purchaseYearActual: y,
            firstBuyerFrom: y >= a.reformYear ? y : null
          };
          rentSuspended = true;
          extraRent = 0;
          if (record) evLabels.push(`Hauskauf für ${fmt(e.price)} (Kaufnebenkosten ca. ${fmt(costs)})`);
          break;
        }
        case 'house_sale': {
          if (!property) break;
          const gain = Math.max(0, e.price - property.purchasePrice);
          const ggst = estimateGrundstueckgewinnsteuer(gain, y - property.purchaseYearActual);
          const proceeds = e.price * 0.98 - mortgageReal() - ggst;
          oneOff -= proceeds;
          mortgages = [];
          property = null;
          rentSuspended = false;
          extraRent = e.newRentMonthly * 12;
          if (record) evLabels.push(`Hausverkauf für ${fmt(e.price)} (Grundstückgewinnsteuer ca. ${fmt(ggst)})`);
          break;
        }
        case 'child':
          children.push({ id: e.id, name: e.name, birthYear: y, monthlyCost: e.monthlyCost, childcareYearly: e.childcareYearly, dependentUntilAge: 25 });
          if (record) evLabels.push(`Geburt ${e.name || 'Kind'}`);
          break;
        case 'workload': {
          const i = persons.findIndex((p) => p.id === e.person);
          if (i >= 0) {
            ps[i].workloadRestore = ps[i].workload;
            ps[i].workload = e.workload;
            ps[i].workloadUntil = e.untilYear ?? null;
            if (record) evLabels.push(`${persons[i].name}: Pensum ${e.workload} %`);
          }
          break;
        }
        case 'salary': {
          const i = persons.findIndex((p) => p.id === e.person);
          if (i >= 0) {
            ps[i].grossOverride = e.grossSalary;
            ps[i].grossOverrideAge = y - persons[i].birthYear;
            if (record) evLabels.push(`${persons[i].name}: neuer Lohn ${fmt(e.grossSalary)}`);
          }
          break;
        }
        case 'inheritance':
          oneOff -= e.amount;
          if (record) evLabels.push(`Erbschaft ${fmt(e.amount)}`);
          break;
        case 'pk_buyin': {
          const i = persons.findIndex((p) => p.id === e.person);
          if (i >= 0) ps[i].buyIns.push({ from: y, to: y + Math.max(1, e.years) - 1, amount: e.amount });
          break;
        }
        case 'one_off_expense':
          oneOff += e.amount;
          if (record) evLabels.push(`${e.label}: ${fmt(e.amount)}`);
          break;
        case 'gift':
          oneOff += e.amount;
          if (record) evLabels.push(`${e.label}: ${fmt(e.amount)}`);
          break;
        case 'one_off_income':
          oneOff -= e.amount;
          if (record) evLabels.push(`${e.label}: +${fmt(e.amount)}`);
          break;
        case 'expense_change':
          extraExpenses.push({ from: y, to: e.untilYear ?? 9999, yearly: e.yearly });
          if (record) evLabels.push(`${e.label}`);
          break;
        case 'allocation':
          stockShare = e.stockShare;
          if (record) evLabels.push(`Anlagestrategie: ${Math.round(e.stockShare * 100)} % Aktien`);
          break;
        case 'amortize': {
          let rest = e.amount * cpi;
          for (const mo of mortgages) {
            const pay = Math.min(rest, mo.amount);
            mo.amount -= pay;
            rest -= pay;
          }
          const paid = e.amount - rest / cpi;
          oneOff += paid;
          mortgages = mortgages.filter((mo) => mo.amount > 1);
          if (record) evLabels.push(`Amortisation ${fmt(paid)}`);
          break;
        }
      }
    }

    // ---------- Personen: Erwerb, Vorsorge ----------
    const ages = persons.map((p) => y - p.birthYear);
    const employed = persons.map(() => false);
    const retiredFlags = persons.map((p, i) => ages[i] >= p.retirementAge);
    let grossTotal = 0;
    let netTotal = 0;
    let p3aContrib = 0;
    let buyInTotal = 0;
    const taxPersons: TaxPersonInput[] = [];
    const ahvIncome = new Array(n).fill(0);
    const pkIncome = new Array(n).fill(0);
    const ahvContribPaid = new Array(n).fill(0);
    const savingsCredit = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      const p = persons[i];
      const s = ps[i];
      const age = ages[i];
      if (s.workloadUntil !== null && y > s.workloadUntil) {
        s.workload = s.workloadRestore;
        s.workloadUntil = null;
      }
      let gross = 0;
      let net = 0;
      let pkEmployee = 0;
      if (age < p.retirementAge) {
        const startAge = startYear - p.birthYear;
        const baseGross = s.grossOverride ?? p.grossSalary;
        const fromAge = s.grossOverride !== null ? s.grossOverrideAge : startAge;
        const growthYears = Math.max(0, Math.min(age, p.salaryPeakAge) - Math.min(fromAge, p.salaryPeakAge));
        const workloadFactor = s.workload / prep.initialWorkload[i];
        gross = baseGross * Math.pow(1 + p.salaryGrowth, growthYears) * workloadFactor;
        if (p.hasPensionFund && gross >= PARAMS.bvg.entryThreshold) {
          const ratio = (gross / Math.max(1, p.grossSalary)) * (bvgBandRate(age) / bvgBandRate(startAge));
          savingsCredit[i] = prep.savings0[i] * ratio;
          pkEmployee = p.pkEmployeeContribution * ratio;
        }
        const deductions = (socialDeductions(gross) + pkEmployee) * prep.baseCalibration[i];
        net = Math.max(0, gross - deductions);
        ahvContribPaid[i] = gross * PARAMS.ahv.employeeRate * 2;
      }
      employed[i] = gross > 0;
      grossTotal += gross;
      netTotal += net;

      // Säule 3a: Einzahlungen (nur mit AHV-pflichtigem Erwerbseinkommen) und gestaffelter Bezug
      const accounts = Math.max(1, Math.round(p.p3aAccounts));
      const p3aLastAge = Math.max(PARAMS.pillar3a.earliestWithdrawalAge, Math.min(p.retirementAge, 70));
      const p3aFirstAge = Math.max(PARAMS.pillar3a.earliestWithdrawalAge, p3aLastAge - (accounts - 1));
      let p3aIn = 0;
      if (gross > 0 && s.p3aAccountsLeft > 0 && age < p3aLastAge) {
        const max = p.hasPensionFund
          ? PARAMS.pillar3a.maxWithPensionFund
          : Math.min(PARAMS.pillar3a.maxWithoutPensionFund, net * 0.2);
        p3aIn = Math.min(p.p3aContribution, max);
      }
      p3aContrib += p3aIn;
      s.p3a += p3aIn;
      if (s.p3aAccountsLeft > 0 && age >= p3aFirstAge) {
        const share = age >= p3aLastAge ? 1 : 1 / s.p3aAccountsLeft;
        const amount = s.p3a * share;
        s.p3a -= amount;
        s.p3aAccountsLeft = age >= p3aLastAge ? 0 : s.p3aAccountsLeft - 1;
        if (amount > 0) {
          capitalWithdrawalByPerson[i] += amount;
          if (record && amount > 500) evLabels.push(`${p.name}: Bezug Säule 3a ${fmt(amount)}`);
        }
        // indirekte Amortisation: verpfändetes 3a-Kapital tilgt die Hypothek
        if (s.pledged3a > 0 && mortgages.length && amount > 0) {
          let rest = Math.min(amount, s.pledged3a) * cpi;
          for (const mo of mortgages) {
            const pay = Math.min(rest, mo.amount);
            mo.amount -= pay;
            rest -= pay;
          }
          oneOff += Math.min(amount, s.pledged3a) - rest / cpi;
          s.pledged3a = 0;
          mortgages = mortgages.filter((mo) => mo.amount > 1);
        }
      }

      // PK-Einkäufe
      let buyIn = 0;
      if (gross > 0 && p.hasPensionFund && !s.pkRetired) {
        for (const b of s.buyIns) if (y >= b.from && y <= b.to) buyIn += b.amount;
        buyIn = Math.min(buyIn, Math.max(0, s.buyInRemaining));
        s.buyInRemaining -= buyIn;
        if (buyIn > 0) s.lastBuyInYear = y;
      }
      buyInTotal += buyIn;

      // PK: Sparbeiträge und Einkäufe
      s.pk += savingsCredit[i] + buyIn;

      // Pensionierung: Umwandlung in Rente / Kapitalbezug
      const pkRetireAge = Math.max(PARAMS.bvg.earliestRetirementAge, Math.min(70, p.retirementAge));
      if (!s.pkRetired && p.hasPensionFund && age >= pkRetireAge) {
        s.pkRetired = true;
        const capital = s.pk * p.pkCapitalShare;
        const conv = Math.max(0.03, p.pkConversionRate + (age - 65) * PARAMS.bvg.conversionReductionPerYear);
        const pension = (s.pk - capital) * conv;
        s.pkPensionNominal = pension * cpi;
        capitalWithdrawalByPerson[i] += capital;
        s.pk = 0;
        if (record) {
          if (capital > 0) evLabels.push(`${p.name}: Kapitalbezug PK ${fmt(capital)}`);
          if (pension > 0) evLabels.push(`${p.name}: PK-Rente ${fmt(pension)}/Jahr (nominal fix)`);
          if (y - s.lastBuyInYear < PARAMS.bvg.buyInLockYears && capital > 0)
            evLabels.push(`Achtung: Kapitalbezug innert 3 Jahren nach PK-Einkauf`);
        }
      }
      if (s.pkRetired) pkIncome[i] = s.pkPensionNominal / cpi;

      // AHV-Rente
      if (age >= p.ahvClaimAge) {
        const factor = ahvFactor(p.ahvClaimAge, prep.refAge[i]);
        const thirteenth = y >= PARAMS.ahv.thirteenthFromYear ? 13 : 12;
        ahvIncome[i] = p.ahvMonthly * thirteenth * factor * Math.pow(1 + a.ahvRealIndexation, t);
      }

      taxPersons.push({
        confession: p.confession,
        employmentNet: net,
        otherIncome: 0,
        pillar3a: p3aIn,
        pkBuyIn: buyIn,
        hasPensionFund: p.hasPensionFund,
        travelExpenses: gross > 0 ? p.travelExpenses : 0,
        workload: s.workload
      });
    }

    // AHV-Plafonierung für Ehepaare
    if (married && ahvIncome[0] > 0 && ahvIncome[1] > 0) {
      const cap = PARAMS.ahv.coupleMaxMonthly * (y >= PARAMS.ahv.thirteenthFromYear ? 13 : 12) * Math.pow(1 + a.ahvRealIndexation, t);
      const sum = ahvIncome[0] + ahvIncome[1];
      if (sum > cap) {
        ahvIncome[0] *= cap / sum;
        ahvIncome[1] *= cap / sum;
      }
    }

    // Kinder: Kosten, Betreuung, Zulagen
    let childCost = 0;
    let childcare = 0;
    let allowances = 0;
    let dependentChildren = 0;
    const anyEmployed = employed.some(Boolean);
    for (const c of children) {
      const age = y - c.birthYear;
      if (age < 0 || age >= c.dependentUntilAge) continue;
      dependentChildren++;
      childCost += c.monthlyCost * 12;
      if (age < 12) childcare += c.childcareYearly;
      if (anyEmployed) {
        const fa = PARAMS.familyAllowance;
        if (age < fa.childUntilAge) allowances += fa.childMonthly * 12;
        else if (age < fa.educationUntilAge) allowances += fa.educationMonthly * 12;
      }
    }

    // ---------- Ausgaben ----------
    const retiredShare = retiredFlags.filter(Boolean).length / n;
    let expenses = 0;
    for (const e of plan.expenses) {
      if (e.fromYear && y < e.fromYear) continue;
      if (e.toYear && y > e.toYear) continue;
      if (e.isRent && rentSuspended) continue;
      const f = 1 + (e.retirementFactor - 1) * retiredShare;
      expenses += yearlyAmount(e) * f;
    }
    expenses += extraRent;
    for (const x of extraExpenses) if (y >= x.from && y <= x.to) expenses += x.yearly;

    // Wohneigentum
    let interestReal = 0;
    let amortReal = 0;
    let maintenance = 0;
    let indirectAmort = 0;
    if (property) {
      for (const mo of mortgages) {
        if (y > mo.fixedUntil) mo.rate = m.mortgageRate;
        interestReal += (mo.amount * mo.rate) / cpi;
        const pay = Math.min(mo.amortization, mo.amount);
        if (mo.indirect) {
          indirectAmort += pay / cpi;
        } else {
          amortReal += pay / cpi;
          mo.amount -= pay;
        }
      }
      mortgages = mortgages.filter((mo) => mo.amount > 1);
      maintenance = property.value * property.maintenanceRate;
      if (indirectAmort > 0) {
        // indirekte Amortisation fliesst in die Säule 3a der ersten Person
        ps[0].p3a += indirectAmort;
        ps[0].pledged3a += indirectAmort;
      }
    }
    const housing = interestReal + amortReal + maintenance + indirectAmort;

    // ---------- Steuern ----------
    const liquidStart = cash + securities;
    const investmentIncome =
      securities * (stockShare * a.dividendYield + (1 - stockShare) * a.bondYield) + Math.max(0, cash) * a.cashYield;
    const beforeReform = y < a.reformYear;
    let emw = 0;
    let debtInterestDeductible = 0;
    let maintenanceDeduction = 0;
    if (property) {
      if (beforeReform) {
        emw = property.eigenmietwert;
        debtInterestDeductible = interestReal;
        const id = property.buildingAge + (y - startYear) > 10 ? 'ImmoUnterhaltUeber10Jahre_EK' : 'ImmoUnterhaltUnter11Jahre_EK';
        const pct = tax.canton.deductions.EINKOMMENSSTEUER?.find((d) => d.id === id)?.percent ?? 20;
        maintenanceDeduction = (emw * pct) / 100;
      } else if (property.firstBuyerFrom !== null) {
        const k = y - property.firstBuyerFrom;
        if (k < PARAMS.wohneigentum.firstBuyerYears) {
          const max = married ? PARAMS.wohneigentum.firstBuyerDeductionMarried : PARAMS.wohneigentum.firstBuyerDeductionSingle;
          debtInterestDeductible = Math.min(interestReal, max * (1 - 0.1 * k));
        }
      }
    }
    const taxFortune = Math.max(
      0,
      cash + securities + (property ? property.value * property.taxValueShare : 0) - mortgageReal() - otherDebts
    );

    // Einkommen den Personen zuordnen
    for (let i = 0; i < n; i++) taxPersons[i].otherIncome = ahvIncome[i] + pkIncome[i];
    taxPersons[0].otherIncome += allowances;

    let taxIncome = 0;
    let taxWealth = 0;
    const subjectBase = (share: number, kids: number): Omit<TaxSubjectInput, 'relationship' | 'persons'> => ({
      children: kids,
      householdIncome: (investmentIncome + emw) * share,
      investmentIncome: investmentIncome * share,
      debtInterest: debtInterestDeductible * share,
      maintenanceRealEstate: maintenanceDeduction * share,
      childcareCosts: kids > 0 ? childcare : 0,
      otherDeductions: 0,
      fortune: taxFortune * share,
      securities: securities * share
    });
    if (concubinage) {
      for (let i = 0; i < 2; i++) {
        const r = calculateIncomeAndWealthTax(tax, { relationship: 'c', persons: [taxPersons[i]], ...subjectBase(0.5, i === 0 ? dependentChildren : 0) });
        taxIncome += incomeTaxOnly(r) + r.personnel;
        taxWealth += r.fortuneCanton + r.fortuneCity + r.fortuneChurch;
      }
    } else {
      const r = calculateIncomeAndWealthTax(tax, {
        relationship: married ? 'm' : 's',
        persons: married ? taxPersons : [taxPersons[0]],
        ...subjectBase(1, dependentChildren)
      });
      taxIncome += incomeTaxOnly(r) + r.personnel;
      taxWealth += r.fortuneCanton + r.fortuneCity + r.fortuneChurch;
    }

    // Kapitalleistungssteuer: alle Bezüge eines Jahres zusammen (Ehepaar gemeinsam)
    const confessions = persons.map((p) => p.confession);
    if (married || n === 1) {
      const total = capitalWithdrawalByPerson.reduce((s, x) => s + x, 0);
      if (total > 0) capitalTaxYear = calculateCapitalWithdrawalTax(tax, total, married ? 'm' : 's', dependentChildren, married ? confessions : [confessions[0]]).total;
    } else {
      for (let i = 0; i < n; i++) {
        if (capitalWithdrawalByPerson[i] > 0)
          capitalTaxYear += calculateCapitalWithdrawalTax(tax, capitalWithdrawalByPerson[i], 'c', i === 0 ? dependentChildren : 0, [confessions[i]]).total;
      }
    }
    // Vorbezüge für Wohneigentum fliessen direkt ins Haus, nicht in die liquiden Mittel
    const capitalWithdrawalsTotal = capitalWithdrawalByPerson.reduce((s, x) => s + x, 0);
    const wefWithdrawal = housePurchaseCash > 0 ? (prep.eventsByYear.get(y) ?? []).reduce((s, e) => (e.type === 'house_purchase' ? s + e.fromPk + e.from3a : s), 0) : 0;
    const capitalToLiquid = Math.max(0, capitalWithdrawalsTotal - wefWithdrawal);

    // AHV-Beiträge als Nichterwerbstätige (bis zum Referenzalter)
    let ahvNE = 0;
    for (let i = 0; i < n; i++) {
      const age = ages[i];
      if (employed[i] || age >= prep.refAge[i] || age < 20) continue;
      if (married) {
        const spouse = 1 - i;
        if (employed[spouse] && ahvContribPaid[spouse] / 2 >= 2 * PARAMS.ahv.nonEmployed.min) continue;
      }
      const wealthShare = married || concubinage ? taxFortune / 2 : taxFortune;
      const base = wealthShare + PARAMS.ahv.nonEmployed.pensionMultiplier * (pkIncome[i] + ahvIncome[i]);
      ahvNE += ahvNonEmployedContribution(base);
    }

    const taxTotal = taxIncome + taxWealth + capitalTaxYear;
    totalTaxes += taxTotal;
    capitalTaxes += capitalTaxYear;

    // ---------- Geldfluss ----------
    const pensionIncome = ahvIncome.reduce((s, x) => s + x, 0) + pkIncome.reduce((s, x) => s + x, 0);
    otherIncomeYear = allowances;
    const inflow = netTotal + pensionIncome + allowances + capitalToLiquid + Math.max(0, -oneOff);
    const outflow =
      expenses + childCost + childcare + housing + taxTotal + p3aContrib + buyInTotal + ahvNE + Math.max(0, oneOff) + housePurchaseCash;
    const surplus = inflow - outflow;

    const reserveTarget = (plan.portfolio.emergencyMonths * (expenses + childCost + housing)) / 12;
    let shortfall = 0;
    if (surplus >= 0) {
      if (unfunded > 0) {
        const pay = Math.min(unfunded, surplus);
        unfunded -= pay;
        const rest = surplus - pay;
        const toCash = Math.min(rest, Math.max(0, reserveTarget - cash));
        cash += toCash;
        securities += rest - toCash;
      } else {
        const toCash = Math.min(surplus, Math.max(0, reserveTarget - cash));
        cash += toCash;
        securities += surplus - toCash;
      }
    } else {
      let deficit = -surplus;
      const fromCash = Math.min(Math.max(0, cash), deficit);
      cash -= fromCash;
      deficit -= fromCash;
      const fromSec = Math.min(Math.max(0, securities), deficit);
      securities -= fromSec;
      deficit -= fromSec;
      if (deficit > 0) {
        shortfall = deficit;
        unfunded += deficit;
      }
    }
    // Notgroschen aus Wertschriften auffüllen
    if (cash < reserveTarget && securities > 0) {
      const move = Math.min(securities, reserveTarget - cash);
      cash += move;
      securities -= move;
    }

    // ---------- Renditen (real) ----------
    const portReturn = stockShare * m.stock + (1 - stockShare) * m.bond;
    securities *= 1 + portReturn;
    cash *= 1 + m.cash;
    for (let i = 0; i < n; i++) {
      const p = persons[i];
      const s = ps[i];
      const r3a = p.p3aInvested ? p.p3aStockShare * m.stock + (1 - p.p3aStockShare) * m.bond : (1 + 0.006) / (1 + m.inflation) - 1;
      s.p3a *= 1 + r3a;
      if (!s.pkRetired) s.pk *= (1 + p.pkInterest) / (1 + m.inflation);
    }
    if (property) property.value *= 1 + m.property;
    if (unfunded > 0) unfunded *= 1 + Math.max(0.02, m.mortgageRate) - m.inflation; // Schuldzins
    otherDebts = Math.max(0, otherDebts);
    cpi *= 1 + m.inflation;

    // ---------- Festhalten ----------
    const p3aTotal = ps.reduce((s, x) => s + x.p3a, 0);
    const pkTotal = ps.reduce((s, x) => s + x.pk, 0);
    const mort = mortgageReal();
    const liquid = cash + securities - unfunded;
    const netWorth = liquid + p3aTotal + pkTotal + (property ? property.value : 0) - mort - otherDebts;
    netWorthArr[t] = netWorth;
    liquidArr[t] = liquid;
    if (shortfall > 1000 && failedYear === null) failedYear = y;
    if (liquid < 0 && liquidFailedYear === null) liquidFailedYear = y;
    if (y >= prep.retirementYear) minLiquid = Math.min(minLiquid, liquid);
    if (y === prep.retirementYear) {
      liquidAtRetirement = liquidStart;
      netWorthAtRetirement = netWorth;
    }

    if (records) {
      records.push({
        year: y,
        ages,
        retired: retiredFlags,
        grossSalary: grossTotal,
        netSalary: netTotal,
        ahv: ahvIncome.reduce((s, x) => s + x, 0),
        pkPension: pkIncome.reduce((s, x) => s + x, 0),
        allowances,
        otherIncome: otherIncomeYear,
        capitalWithdrawals: capitalWithdrawalsTotal,
        expenses,
        housing,
        children: childCost + childcare,
        taxIncome,
        taxWealth,
        taxCapital: capitalTaxYear,
        taxTotal,
        p3aContributions: p3aContrib,
        pkBuyIns: buyInTotal,
        ahvNonEmployed: ahvNE,
        oneOff: oneOff + housePurchaseCash,
        savings: surplus,
        cash,
        securities,
        p3a: p3aTotal,
        pk: pkTotal,
        pkByPerson: ps.map((x) => x.pk),
        p3aByPerson: ps.map((x) => x.p3a),
        pkPensionByPerson: [...pkIncome],
        ahvByPerson: [...ahvIncome],
        propertyValue: property ? property.value : 0,
        mortgage: mort,
        netWorth,
        liquid,
        shortfall,
        inflationIndex: cpi,
        events: evLabels
      });
    }
  }

  return {
    records,
    netWorth: netWorthArr,
    liquid: liquidArr,
    summary: {
      failedYear,
      liquidFailedYear,
      retirementYear: prep.retirementYear,
      liquidAtRetirement,
      netWorthAtRetirement,
      endNetWorth: netWorthArr[years - 1],
      endLiquid: liquidArr[years - 1],
      totalTaxes,
      capitalTaxes,
      minLiquid: Number.isFinite(minLiquid) ? minLiquid : 0
    }
  };
}

function fmt(v: number): string {
  return `CHF\u00a0${Math.round(v).toLocaleString('de-CH')}`;
}

export type { PersonPlan };
