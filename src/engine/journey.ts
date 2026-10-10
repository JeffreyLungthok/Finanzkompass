/**
 * Lebenssimulation: Der Nutzer durchlebt einen zufälligen Börsenverlauf Jahr für Jahr
 * und trifft an wichtigen Wegmarken Entscheide. Jeder Entscheid ist ein serialisierbarer
 * «Patch» auf den Plan, damit sich eine Reise teilen und nachspielen lässt.
 */
import { PARAMS, TRANSFER_TAX, ahvReferenceAge } from './params';
import type { LifeEvent, Plan, PersonId, PersonPlan, Portfolio } from './plan';
import { randomId } from './plan';
import { generateMarketPath, createRng, type MarketYear } from './market';
import { prepare, simulatePath, type YearRecord } from './simulate';
import type { TaxContext } from './tax/types';
import { calculateCapitalWithdrawalTax } from './tax/capitalTax';
import { currentTaxes } from './taxHelpers';
import { estimateGrundstueckgewinnsteuer, inheritanceInfo, transferTaxInfo } from './specialTaxes';

export interface PlanPatch {
  addEvents?: LifeEvent[];
  persons?: { id: PersonId; set: Partial<PersonPlan> }[];
  portfolio?: Partial<Portfolio>;
}

export interface CardOption {
  id: string;
  label: string;
  detail: string;
  patch: PlanPatch;
  /** Bisheriger Zustand – wird hervorgehoben */
  current?: boolean;
}

export interface Fact {
  label: string;
  value: string;
}

export type Chapter = 'Start' | 'Erwerbsleben' | 'Familie & Wohnen' | 'Vor der Pension' | 'Pensionierung' | 'Ruhestand';

export interface Card {
  id: string;
  year: number;
  chapter: Chapter;
  kind: 'entscheid' | 'ereignis';
  title: string;
  story: string;
  facts: Fact[];
  taxNote?: { title: string; text: string };
  options: CardOption[];
}

export interface Decision {
  cardId: string;
  optionId: string;
  year: number;
  title: string;
  optionLabel: string;
  detail: string;
  patch: PlanPatch;
  /** Wirkung auf diesem Lebenspfad */
  effect?: { endNetWorth: number; taxes: number };
}

export interface JourneyState {
  seed: number;
  decisions: Decision[];
}

const chf = (v: number) => `CHF\u00a0${Math.round(v).toLocaleString('de-CH')}`;
const pct = (v: number, d = 0) => `${(v * 100).toFixed(d).replace('.', ',').replace('-', '−')}\u00a0%`;
const round = (v: number, step: number) => Math.round(v / step) * step;

export function applyPatch(plan: Plan, patch: PlanPatch): Plan {
  let p = plan;
  if (patch.addEvents?.length) p = { ...p, events: [...p.events, ...patch.addEvents] };
  if (patch.persons?.length) {
    p = {
      ...p,
      persons: p.persons.map((x) => {
        const change = patch.persons!.filter((c) => c.id === x.id).reduce((acc, c) => ({ ...acc, ...c.set }), {});
        return { ...x, ...change };
      })
    };
  }
  if (patch.portfolio) p = { ...p, portfolio: { ...p.portfolio, ...patch.portfolio } };
  return p;
}

export function applyDecisions(plan: Plan, decisions: Decision[]): Plan {
  return decisions.reduce((p, d) => applyPatch(p, d.patch), plan);
}

interface Ctx {
  plan: Plan;
  tax: TaxContext;
  market: MarketYear[];
  records: YearRecord[];
  decided: Set<string>;
  fromYear: number;
  seed: number;
  marginal: number;
}

const rec = (c: Ctx, year: number) => c.records.find((r) => r.year === year) ?? c.records[c.records.length - 1];
const ageOf = (p: PersonPlan, year: number) => year - p.birthYear;
const capTax = (c: Ctx, amount: number) => {
  const married = c.plan.persons.length === 2 && c.plan.relationship === 'm';
  return calculateCapitalWithdrawalTax(c.tax, amount, married ? 'm' : c.plan.relationship === 'c' ? 'c' : 's', 0, married ? c.plan.persons.map((p) => p.confession) : [c.plan.persons[0].confession]).total;
};

function projectedGross(plan: Plan, p: PersonPlan, year: number): number {
  const sal = plan.events
    .filter((e): e is Extract<LifeEvent, { type: 'salary' }> => e.type === 'salary' && e.person === p.id && e.year <= year)
    .sort((a, b) => b.year - a.year)[0];
  const baseYear = sal ? sal.year : plan.startYear;
  const base = sal ? sal.grossSalary : p.grossSalary;
  const from = Math.min(baseYear - p.birthYear, p.salaryPeakAge);
  const to = Math.min(year - p.birthYear, p.salaryPeakAge);
  return base * Math.pow(1 + p.salaryGrowth, Math.max(0, to - from));
}

type Generator = (c: Ctx) => Card | Card[] | null;

// ---------- Kartenkatalog ----------

const start3a: Generator = (c) => {
  const id = 'start_3a';
  if (c.decided.has(id)) return null;
  const y = c.plan.startYear;
  const candidates = c.plan.persons.filter((p) => ageOf(p, y) < p.retirementAge && p.grossSalary > 0 && p.hasPensionFund);
  const missing = candidates.map((p) => ({ p, gap: PARAMS.pillar3a.maxWithPensionFund - p.p3aContribution })).filter((x) => x.gap > 500);
  if (!missing.length) return null;
  const totalGap = missing.reduce((s, x) => s + x.gap, 0);
  return {
    id,
    year: y,
    chapter: 'Start',
    kind: 'entscheid',
    title: 'Säule 3a: Wie viel zahlst du ein?',
    story: `Die gebundene Vorsorge ist der einfachste Steuerhebel für Angestellte. Im Moment zahlst du ${chf(totalGap)} pro Jahr weniger ein als erlaubt.`,
    facts: [
      { label: 'Maximum pro Person 2026', value: chf(PARAMS.pillar3a.maxWithPensionFund) },
      { label: 'Dein Grenzsteuersatz', value: pct(c.marginal) },
      { label: 'Steuerersparnis bei Maximum', value: `${chf(totalGap * c.marginal)} pro Jahr` }
    ],
    taxNote: {
      title: 'Steuerlich',
      text: 'Einzahlungen sind vom Einkommen abziehbar. Beim Bezug fällt die reduzierte Kapitalleistungssteuer an – gestaffelte Bezüge aus mehreren Konten senken sie.'
    },
    options: [
      { id: 'max', label: 'Maximum einzahlen', detail: `+${chf(totalGap)} Vorsorge pro Jahr, ${chf(totalGap * c.marginal)} weniger Steuern`, patch: { persons: missing.map((x) => ({ id: x.p.id, set: { p3aContribution: PARAMS.pillar3a.maxWithPensionFund } })) } },
      { id: 'half', label: 'Etwas mehr: CHF 3’600', detail: 'Ein Mittelweg für knappe Budgets', patch: { persons: missing.map((x) => ({ id: x.p.id, set: { p3aContribution: Math.max(x.p.p3aContribution, 3600) } })) } },
      { id: 'keep', label: 'So lassen', detail: 'Das Geld bleibt frei verfügbar', patch: {}, current: true }
    ]
  };
};

const startInvest: Generator = (c) => {
  const id = 'start_invest';
  if (c.decided.has(id)) return null;
  const pf = c.plan.portfolio;
  if (pf.securities + pf.cash < 20000) return null;
  const a = c.plan.assumptions;
  const opt = (share: number, label: string) => {
    const exp = share * a.stockReturn + (1 - share) * a.bondReturn;
    const bad = share * 0.35 + (1 - share) * 0.05;
    return {
      id: `s${Math.round(share * 100)}`,
      label,
      detail: `${Math.round(share * 100)} % Aktien, erwartet ${pct(exp, 1)} real pro Jahr, in einem schlechten Jahr bis −${pct(bad)}`,
      patch: { portfolio: { stockShare: share } },
      current: Math.abs(pf.stockShare - share) < 0.13
    };
  };
  return {
    id,
    year: c.plan.startYear,
    chapter: 'Start',
    kind: 'entscheid',
    title: 'Wie legst du dein freies Vermögen an?',
    story: `Du hast ${chf(pf.securities)} angelegt und ${chf(pf.cash)} auf dem Konto. Überschüsse fliessen im Plan in die Anlagen. Die Aufteilung bestimmt, wie stark dein Vermögen wächst – und schwankt.`,
    facts: [
      { label: 'Aktien (real, Ø)', value: pct(a.stockReturn, 1) },
      { label: 'Obligationen (real, Ø)', value: pct(a.bondReturn, 1) },
      { label: 'Teuerung (Annahme)', value: pct(a.inflation, 1) }
    ],
    taxNote: {
      title: 'Steuerlich',
      text: 'Kursgewinne sind für Privatanleger steuerfrei. Dividenden und Zinsen sind als Einkommen steuerbar, das Vermögen unterliegt der Vermögenssteuer.'
    },
    options: [opt(0.25, 'Vorsichtig'), opt(0.5, 'Ausgewogen'), opt(0.75, 'Wachstum'), opt(0.95, 'Fast nur Aktien')]
  };
};

function houseCard(c: Ctx): Card | null {
  const id = 'house';
  if (c.decided.has(id) || c.plan.property || c.plan.events.some((e) => e.type === 'house_purchase')) return null;
  const p1 = c.plan.persons[0];
  for (const r of c.records) {
    if (r.year <= Math.max(c.fromYear, c.plan.startYear)) continue;
    const age = ageOf(p1, r.year);
    if (age > 55 || r.year > Math.min(...c.plan.persons.map((p) => p.birthYear + p.retirementAge)) - 5) break;
    const gross = c.plan.persons.reduce((s, p) => s + (ageOf(p, r.year) < p.retirementAge ? projectedGross(c.plan, p, r.year) * (p.workload / 100 > 0 ? 1 : 0) : 0), 0);
    if (gross < 60000) continue;
    const price = Math.min(2_000_000, round(gross * 5.8, 25000));
    const t = transferTaxInfo(c.tax.cantonId, price);
    const prev = rec(c, r.year - 1);
    const liquid = prev.liquid;
    const reserve = (prev.expenses + prev.children) / 4;
    const pkTotal = prev.pk;
    const need = price * 0.2 + t.total;
    const hard = price * 0.1 + t.total;
    if (liquid - reserve < hard) continue;
    const fromSavings = Math.min(need, liquid - reserve);
    const gap = need - fromSavings;
    if (gap > pkTotal * 0.5) continue;
    const year = r.year;
    const mortgage = price - (need - t.total);
    const rate = c.plan.assumptions.mortgageRateFuture;
    const affordability = (mortgage * PARAMS.mortgage.calcRate + price * PARAMS.mortgage.calcMaintenance + Math.max(0, mortgage - price * 2 / 3) / 15) / gross;
    const wefTax = gap > 0 ? capTax(c, gap) : 0;
    const transfer = TRANSFER_TAX[c.tax.cantonId];
    const options: CardOption[] = [];
    const ev = (fromPk: number, eq: number): LifeEvent => ({ id: randomId(6), type: 'house_purchase', year, price, equityFromSavings: eq, fromPk, from3a: 0, rate, fixedYears: 10, amortizationYears: 15 });
    if (gap <= 1) {
      options.push({ id: 'buy', label: `Kaufen für ${chf(price)}`, detail: `20 % Eigenkapital aus Ersparnissen, Hypothek ${chf(mortgage)}`, patch: { addEvents: [ev(0, need - t.total)] } });
    } else {
      options.push({ id: 'buy_pk', label: `Kaufen für ${chf(price)} mit PK-Vorbezug`, detail: `${chf(fromSavings - t.total)} aus Ersparnissen, ${chf(gap)} aus der Pensionskasse (Steuer ca. ${chf(wefTax)})`, patch: { addEvents: [ev(gap, fromSavings - t.total)] } });
    }
    options.push({ id: 'rent', label: 'Weiter mieten', detail: 'Flexibel bleiben, Vermögen bleibt angelegt', patch: {}, current: true });
    return {
      id,
      year,
      chapter: 'Familie & Wohnen',
      kind: 'entscheid',
      title: 'Eigenheim kaufen?',
      story: `${year}: Ihr habt ${chf(liquid)} frei verfügbar. Eine Wohnung für ${chf(price)} läge in Reichweite. Die Bank rechnet mit 5 % kalkulatorischem Zins – die Tragbarkeit läge bei ${pct(affordability)} des Bruttoeinkommens (Grenze 33 %).`,
      facts: [
        { label: 'Eigenkapital (20 %)', value: chf(price * 0.2) },
        { label: 'Kaufnebenkosten', value: chf(t.total) },
        { label: 'Hypothek', value: chf(mortgage) },
        { label: `Zins heute (Annahme)`, value: pct(rate, 1) }
      ],
      taxNote: {
        title: 'Spezialsteuern beim Kauf',
        text: `Handänderungssteuer im Kanton: ${transfer?.note ?? pct(t.rate, 1)}${t.tax > 0 ? ` – hier rund ${chf(t.tax)}` : ''}. Ab ${c.plan.assumptions.reformYear} entfällt der Eigenmietwert, im Gegenzug auch der Schuldzinsabzug. Ersterwerber dürfen danach noch zehn Jahre lang einen sinkenden Schuldzinsabzug machen. Ein PK-Vorbezug wird sofort als Kapitalleistung besteuert und senkt die späteren Rentenleistungen.`
      },
      options
    };
  }
  return null;
}

const childCard: Generator = (c) => {
  const id = 'child';
  if (c.decided.has(id) || c.plan.persons.length < 2) return null;
  const y = Math.max(c.fromYear, c.plan.startYear + 1);
  const [a, b] = c.plan.persons;
  if (ageOf(a, y) > 41 || ageOf(b, y) > 45 || c.plan.children.length >= 3) return null;
  const younger = a.grossSalary <= b.grossSalary ? a : b;
  const childEv = (): LifeEvent => ({ id: randomId(6), type: 'child', year: y + 1, name: 'Kind', monthlyCost: 1100, childcareYearly: 14000 });
  return {
    id,
    year: y,
    chapter: 'Familie & Wohnen',
    kind: 'entscheid',
    title: 'Familienplanung',
    story: 'Möchtest du durchspielen, wie ein (weiteres) Kind eure Finanzen verändert? Kinder kosten in der Schweiz im Schnitt rund 1000 bis 1500 Franken pro Monat – dazu kommen Betreuungskosten oder ein tieferes Pensum.',
    facts: [
      { label: 'Kinderzulage (Minimum)', value: `${chf(PARAMS.familyAllowance.childMonthly)} pro Monat` },
      { label: 'Kinderabzug Bund', value: chf(6800) },
      { label: 'Reduktion Bundessteuer', value: `${chf(263)} pro Kind` }
    ],
    taxNote: { title: 'Steuerlich', text: 'Kinder bringen Abzüge bei Bund und Kanton, Kosten für Fremdbetreuung sind bis zu einem Maximum abziehbar. Alleinerziehende und Verheiratete mit Kindern profitieren vom Elterntarif beim Bund.' },
    options: [
      { id: 'yes', label: 'Ja, mit Kita', detail: 'Beide arbeiten weiter, Fremdbetreuung bis 12', patch: { addEvents: [childEv()] } },
      {
        id: 'yes_parttime',
        label: `Ja, ${younger.name} reduziert auf 60 %`,
        detail: 'Für sechs Jahre, mit weniger Betreuungskosten',
        patch: {
          addEvents: [
            { ...childEv(), childcareYearly: 6000 } as LifeEvent,
            { id: randomId(6), type: 'workload', year: y + 1, person: younger.id, workload: 60, untilYear: y + 6 }
          ]
        }
      },
      { id: 'no', label: 'Nicht simulieren', detail: 'Weiter ohne Änderung', patch: {}, current: true }
    ]
  };
};

const careerCard: Generator = (c) => {
  const id = 'career';
  if (c.decided.has(id)) return null;
  const p = c.plan.persons[0];
  const y = Math.max(c.fromYear, c.plan.startYear + 3);
  const age = ageOf(p, y);
  if (age < 28 || age > 50 || age >= p.retirementAge - 8 || p.grossSalary <= 0) return null;
  const gross = projectedGross(c.plan, p, y);
  return {
    id,
    year: y,
    chapter: 'Erwerbsleben',
    kind: 'entscheid',
    title: `${p.name}: Ein Karriereschritt?`,
    story: `${y}, ${p.name} ist ${age}. Eine berufsbegleitende Weiterbildung würde zwei Jahre lang Zeit und Geld kosten, danach winkt ein höherer Lohn. Alternativ gibt es ein Jobangebot mit mehr Lohn, aber längerem Arbeitsweg.`,
    facts: [
      { label: 'Lohn heute (brutto)', value: chf(gross) },
      { label: 'Weiterbildung', value: `CHF 20’000, 2 Jahre ${Math.round(p.workload * 0.8)} %` },
      { label: 'Danach', value: '+12 % Lohn' }
    ],
    taxNote: { title: 'Steuerlich', text: 'Berufsorientierte Aus- und Weiterbildungskosten sind bis zu einem jährlichen Maximum abziehbar – beim Bund rund CHF 13’000, in den Kantonen ähnlich. Ein höherer Lohn erhöht auch die PK-Beiträge – und damit die spätere Rente.' },
    options: [
      {
        id: 'study',
        label: 'Weiterbildung machen',
        detail: `Zwei Jahre ${Math.round(p.workload * 0.8)} % Pensum und CHF 20’000, danach +12 % Lohn`,
        patch: {
          addEvents: [
            { id: randomId(6), type: 'one_off_expense', year: y, amount: 20000, label: 'Weiterbildung' },
            { id: randomId(6), type: 'workload', year: y, person: p.id, workload: Math.round(p.workload * 0.8), untilYear: y + 1 },
            { id: randomId(6), type: 'salary', year: y + 2, person: p.id, grossSalary: round(gross * 1.12, 500) }
          ]
        }
      },
      {
        id: 'switch',
        label: 'Job wechseln',
        detail: '+8 % Lohn, CHF 3’000 mehr Pendelkosten pro Jahr',
        patch: {
          addEvents: [
            { id: randomId(6), type: 'salary', year: y, person: p.id, grossSalary: round(gross * 1.08, 500) },
            { id: randomId(6), type: 'expense_change', year: y, yearly: 3000, label: 'Längerer Arbeitsweg' }
          ]
        }
      },
      { id: 'stay', label: 'Bleiben', detail: 'Lohn wächst wie geplant', patch: {}, current: true }
    ]
  };
};

const crashCard: Generator = (c) => {
  const id = 'crash';
  if (c.decided.has(id)) return null;
  for (let t = 1; t < c.market.length - 5; t++) {
    const y = c.plan.startYear + t;
    if (y < c.fromYear) continue;
    if (c.market[t].stock > -0.18) continue;
    const before = rec(c, y - 1);
    if (before.securities < 20000) continue;
    const loss = before.securities * c.plan.portfolio.stockShare * -c.market[t].stock;
    const share = c.plan.events
      .filter((e): e is Extract<LifeEvent, { type: 'allocation' }> => e.type === 'allocation' && e.year <= y)
      .sort((a, b) => b.year - a.year)[0]?.stockShare ?? c.plan.portfolio.stockShare;
    const p1 = c.plan.persons[0];
    return {
      id,
      year: y + 1,
      chapter: ageOf(p1, y) >= p1.retirementAge ? 'Ruhestand' : 'Erwerbsleben',
      kind: 'ereignis',
      title: `Börsenjahr ${y}: Aktien ${pct(c.market[t].stock)}`,
      story: `Die Aktienmärkte brechen ein. Dein Depot verliert rund ${chf(loss)}. Die Schlagzeilen sind düster, viele verkaufen. Was tust du?`,
      facts: [
        { label: 'Aktienanteil', value: pct(share) },
        { label: 'Depot vor dem Einbruch', value: chf(before.securities) },
        { label: 'Alter', value: `${ageOf(p1, y)}` }
      ],
      taxNote: { title: 'Gut zu wissen', text: 'Verluste auf Aktien lassen sich in der Schweiz nicht von den Steuern abziehen – Gewinne sind dafür steuerfrei. Wer verkauft, macht den Verlust endgültig.' },
      options: [
        { id: 'hold', label: 'Ruhe bewahren', detail: 'Strategie beibehalten und abwarten', patch: {}, current: true },
        {
          id: 'sell',
          label: 'Verkaufen und abwarten',
          detail: 'Drei Jahre lang nur 10 % Aktien, dann zurück zur Strategie',
          patch: { addEvents: [{ id: randomId(6), type: 'allocation', year: y + 1, stockShare: 0.1 }, { id: randomId(6), type: 'allocation', year: y + 4, stockShare: share }] }
        },
        {
          id: 'buy',
          label: 'Nachkaufen',
          detail: `Fünf Jahre lang ${pct(Math.min(1, share + 0.2))} Aktien, dann zurück`,
          patch: { addEvents: [{ id: randomId(6), type: 'allocation', year: y + 1, stockShare: Math.min(1, share + 0.2) }, { id: randomId(6), type: 'allocation', year: y + 6, stockShare: share }] }
        }
      ]
    };
  }
  return null;
};

const buyInCard: Generator = (c) => {
  const cards: Card[] = [];
  for (const p of c.plan.persons) {
    const id = `buyin_${p.id}`;
    if (c.decided.has(id) || !p.hasPensionFund || p.grossSalary <= 0) continue;
    const y = Math.max(c.fromYear, p.birthYear + 50, c.plan.startYear + 1);
    if (ageOf(p, y) >= p.retirementAge - 3 || ageOf(p, y) > 58) continue;
    const potential = p.pkBuyInPotential > 0 ? p.pkBuyInPotential : 60000;
    const assumed = p.pkBuyInPotential <= 0;
    const r = rec(c, y - 1);
    const liquid = r.liquid;
    if (liquid < 30000) continue;
    const ev = (amount: number, years: number): LifeEvent => ({ id: randomId(6), type: 'pk_buyin', year: y, person: p.id, amount, years });
    const opts: CardOption[] = [];
    const a1 = Math.min(20000, round(potential / 3, 1000));
    const a2 = Math.min(10000, round(potential / 5, 1000));
    opts.push({ id: 'three', label: `3 × ${chf(a1)}`, detail: `Steuerersparnis ca. ${chf(a1 * c.marginal * 3)}`, patch: { addEvents: [ev(a1, 3)], persons: assumed ? [{ id: p.id, set: { pkBuyInPotential: potential } }] : [] } });
    opts.push({ id: 'five', label: `5 × ${chf(a2)}`, detail: `Steuerersparnis ca. ${chf(a2 * c.marginal * 5)}`, patch: { addEvents: [ev(a2, 5)], persons: assumed ? [{ id: p.id, set: { pkBuyInPotential: potential } }] : [] } });
    opts.push({ id: 'none', label: 'Kein Einkauf', detail: 'Geld bleibt frei verfügbar', patch: {}, current: true });
    cards.push({
      id,
      year: y,
      chapter: 'Vor der Pension',
      kind: 'entscheid',
      title: `${p.name}: Einkauf in die Pensionskasse?`,
      story: `${p.name} ist ${ageOf(p, y)}. ${assumed ? 'Angenommen, der PK-Ausweis zeigt ein Einkaufspotenzial von ' + chf(potential) + ' (prüfe deinen eigenen Ausweis).' : `Laut PK-Ausweis sind Einkäufe bis ${chf(potential)} möglich.`} Einkäufe sind voll vom Einkommen abziehbar – bei einem Grenzsteuersatz von ${pct(c.marginal)} ein starker Hebel.`,
      facts: [
        { label: 'Frei verfügbar', value: chf(liquid) },
        { label: 'Grenzsteuersatz', value: pct(c.marginal) },
        { label: 'Verzinsung PK (Annahme)', value: pct(p.pkInterest, 2) }
      ],
      taxNote: { title: 'Steuerlich', text: 'In den drei Jahren nach einem Einkauf ist kein Kapitalbezug möglich – sonst rechnet das Steueramt den Abzug zurück. Verteilen über mehrere Jahre bricht die Progression stärker. Beim Bezug wird das Kapital reduziert besteuert.' },
      options: opts
    });
  }
  return cards;
};

const partTimeCard: Generator = (c) => {
  const cards: Card[] = [];
  for (const p of c.plan.persons) {
    const id = `parttime_${p.id}`;
    if (c.decided.has(id) || p.grossSalary <= 0 || p.retirementAge < 61) continue;
    const y = Math.max(c.fromYear, p.birthYear + 58, c.plan.startYear + 1);
    if (ageOf(p, y) >= p.retirementAge) continue;
    const ev = (w: number): LifeEvent => ({ id: randomId(6), type: 'workload', year: y, person: p.id, workload: w });
    const t1 = Math.max(20, Math.round((p.workload * 0.8) / 10) * 10);
    const t2 = Math.max(20, Math.round((p.workload * 0.6) / 10) * 10);
    const reduce: CardOption[] = [];
    if (t1 < p.workload) reduce.push({ id: 'w80', label: `Auf ${t1} %`, detail: 'Ein Fünftel weniger arbeiten', patch: { addEvents: [ev(t1)] } });
    if (t2 < t1) reduce.push({ id: 'w60', label: `Auf ${t2} %`, detail: 'Deutlich mehr Freizeit', patch: { addEvents: [ev(t2)] } });
    if (!reduce.length) continue;
    cards.push({
      id,
      year: y,
      chapter: 'Vor der Pension',
      kind: 'entscheid',
      title: `${p.name}: Schrittweise kürzertreten?`,
      story: `${p.name} ist ${ageOf(p, y)}. Viele reduzieren in den letzten Berufsjahren das Pensum. Das kostet Lohn und Vorsorgekapital – schenkt aber Zeit.`,
      facts: [
        { label: 'Pensum heute', value: `${p.workload} %` },
        { label: 'Geplante Pensionierung', value: `mit ${p.retirementAge}` }
      ],
      taxNote: { title: 'Gut zu wissen', text: 'Weniger Lohn heisst tiefere Progression. Einige Pensionskassen erlauben, den versicherten Lohn bei einer Reduktion ab 58 weiterzuversichern – das schützt die Rente.' },
      options: [
        ...reduce,
        { id: 'keep', label: 'Pensum behalten', detail: 'Bis zur Pensionierung voll arbeiten', patch: {}, current: true }
      ]
    });
  }
  return cards;
};

const inheritanceCard: Generator = (c) => {
  const id = 'inheritance';
  if (c.decided.has(id) || c.plan.events.some((e) => e.type === 'inheritance')) return null;
  const rng = createRng(c.seed ^ 0x9e3779b9);
  if (rng.uniform() > 0.55) return null;
  const p1 = c.plan.persons[0];
  const age = 52 + Math.floor(rng.uniform() * 10);
  const y = p1.birthYear + age;
  if (y < c.fromYear || y <= c.plan.startYear) return null;
  const amount = round(120000 + rng.uniform() * 300000, 10000);
  const r = rec(c, y - 1);
  const ev: LifeEvent = { id: randomId(6), type: 'inheritance', year: y, amount, from: 'eltern' };
  const opts: CardOption[] = [{ id: 'invest', label: 'Anlegen', detail: 'Gemäss deiner Anlagestrategie', patch: { addEvents: [ev] }, current: true }];
  if (r.mortgage > 50000) {
    const am = Math.min(amount, round(r.mortgage * 0.5, 10000));
    opts.push({ id: 'amortize', label: `Hypothek um ${chf(am)} senken`, detail: 'Weniger Zins und Abhängigkeit von der Bank', patch: { addEvents: [ev, { id: randomId(6), type: 'amortize', year: y, amount: am }] } });
  }
  if (c.plan.children.length || c.plan.events.some((e) => e.type === 'child')) {
    opts.push({ id: 'gift', label: 'Einen Teil den Kindern geben', detail: `${chf(round(amount * 0.3, 5000))} als Erbvorbezug`, patch: { addEvents: [ev, { id: randomId(6), type: 'gift', year: y, amount: round(amount * 0.3, 5000), label: 'Schenkung an Kinder' }] } });
  }
  opts.push({ id: 'dream', label: 'Einen Traum erfüllen', detail: 'CHF 40’000 für eine grosse Reise, Rest anlegen', patch: { addEvents: [ev, { id: randomId(6), type: 'one_off_expense', year: y, amount: 40000, label: 'Grosse Reise' }] } });
  return {
    id,
    year: y,
    chapter: 'Erwerbsleben',
    kind: 'ereignis',
    title: 'Eine Erbschaft',
    story: `${y}: Deine Eltern hinterlassen dir ${chf(amount)}. Was machst du damit?`,
    facts: [
      { label: 'Erbschaft', value: chf(amount) },
      { label: 'Frei verfügbar vorher', value: chf(r.liquid) }
    ],
    taxNote: { title: 'Erbschaftssteuer', text: inheritanceInfo(c.tax.cantonId, 'eltern') },
    options: opts
  };
};

const retireTimingCard: Generator = (c) => {
  const cards: Card[] = [];
  for (const p of c.plan.persons) {
    const id = `retire_${p.id}`;
    if (c.decided.has(id) || p.grossSalary <= 0) continue;
    const y = Math.max(c.fromYear, p.birthYear + Math.max(55, p.retirementAge - 6), c.plan.startYear + 1);
    const age = ageOf(p, y);
    if (age >= p.retirementAge || age >= 64) continue;
    const ref = ahvReferenceAge(p.birthYear, p.sex);
    const ages = [60, 62, 63, 64, 65, 66, 67].filter((a) => a > age);
    const r = rec(c, y - 1);
    const options: CardOption[] = ages.slice(0, 5).map((a) => {
      const early = Math.max(0, ref - a);
      const parts: string[] = [];
      if (a < ref) parts.push(`${early.toFixed(0)} ${Math.round(early) === 1 ? 'Jahr' : 'Jahre'} AHV-Beiträge als Nichterwerbstätige${a < 63 ? ', AHV frühestens mit 63' : ''}`);
      if (a < 65) parts.push(`Umwandlungssatz ca. −${((65 - a) * 0.2).toFixed(1).replace('.', ',')} Prozentpunkte`);
      if (a > 65) parts.push('höhere PK-Leistung, AHV-Aufschub möglich');
      if (a === 65) parts.push('ordentliches Rentenalter');
      return {
        id: `a${a}`,
        label: `Mit ${a}`,
        detail: parts.join('; '),
        patch: { persons: [{ id: p.id, set: { retirementAge: a, ahvClaimAge: Math.min(70, Math.max(a, Math.min(p.ahvClaimAge, 65))) } }] },
        current: a === p.retirementAge
      };
    });
    if (!options.some((o) => o.current)) {
      options.push({ id: 'keep', label: `Wie geplant mit ${p.retirementAge}`, detail: 'Keine Änderung', patch: {}, current: true });
    }
    cards.push({
      id,
      year: y,
      chapter: 'Vor der Pension',
      kind: 'entscheid',
      title: `${p.name}: Wann in Pension?`,
      story: `${p.name} ist ${age}, das frei verfügbare Vermögen liegt bei ${chf(r.liquid)}, in der Pensionskasse liegen ${chf(r.pkByPerson[c.plan.persons.indexOf(p)] ?? 0)}. Jedes Jahr früher heisst: ein Jahr weniger Lohn und Sparen, ein Jahr mehr Entnahme.`,
      facts: [
        { label: 'AHV-Referenzalter', value: String(ref).replace('.', ',') },
        { label: 'Frühester PK-Bezug', value: 'meist 58' },
        { label: 'AHV-Kürzung pro Vorbezugsjahr', value: pct(PARAMS.ahv.earlyReductionPerYear, 1) }
      ],
      taxNote: { title: 'Gut zu wissen', text: 'Wer vor dem Referenzalter aufhört, bleibt AHV-beitragspflichtig (als Nichterwerbstätige, berechnet auf dem Vermögen). Verheiratete sind befreit, solange der Partner genug Beiträge zahlt.' },
      options
    });
  }
  return cards;
};

const p3aStaggerCard: Generator = (c) => {
  const cards: Card[] = [];
  for (const [i, p] of c.plan.persons.entries()) {
    const id = `p3a_${p.id}`;
    if (c.decided.has(id)) continue;
    const y = Math.max(c.fromYear, p.birthYear + 56, c.plan.startYear + 1);
    if (ageOf(p, y) >= Math.min(p.retirementAge, 60)) continue;
    const r = rec(c, y - 1);
    const balance = r.p3aByPerson[i] ?? 0;
    if (balance < 30000) continue;
    const yearsLeft = Math.max(0, 60 - ageOf(p, y));
    const projected = balance * Math.pow(1.02, yearsLeft) + p.p3aContribution * yearsLeft;
    const taxFor = (k: number) => k * capTax(c, projected / k);
    const opts: CardOption[] = [1, 3, 5].map((k) => ({
      id: `k${k}`,
      label: k === 1 ? 'Alles auf einmal' : `${k} Konten gestaffelt`,
      detail: `Kapitalsteuer ca. ${chf(taxFor(k))}${k > 1 ? `, Bezüge von ${Math.max(60, Math.min(p.retirementAge, 70) - k + 1)} bis ${Math.min(Math.max(60, p.retirementAge), 70)}` : ''}`,
      patch: { persons: [{ id: p.id, set: { p3aAccounts: k } }] },
      current: Math.round(p.p3aAccounts) === k
    }));
    cards.push({
      id,
      year: y,
      chapter: 'Vor der Pension',
      kind: 'entscheid',
      title: `${p.name}: Säule 3a gestaffelt beziehen?`,
      story: `In der Säule 3a liegen ${chf(balance)}, bis 60 voraussichtlich rund ${chf(projected)}. Ein 3a-Konto lässt sich nur als Ganzes beziehen – wer mehrere Konten hat, kann sie über mehrere Jahre verteilen.`,
      facts: [
        { label: 'Frühester Bezug', value: 'ab 60 (5 Jahre vor Referenzalter)' },
        { label: 'Spätester Bezug', value: 'bei Pensionierung, mit Erwerb bis 70' }
      ],
      taxNote: { title: 'Kapitalleistungssteuer', text: 'Die Steuer ist progressiv. Bezüge aus 3a und Pensionskasse im gleichen Jahr werden zusammengerechnet – bei Ehepaaren auch die des Partners. Staffeln lohnt sich deshalb doppelt.' },
      options: opts
    });
  }
  return cards;
};

const pkCapitalCard: Generator = (c) => {
  const cards: Card[] = [];
  for (const [i, p] of c.plan.persons.entries()) {
    const id = `pkcap_${p.id}`;
    if (c.decided.has(id) || !p.hasPensionFund) continue;
    const y = Math.max(c.fromYear, p.birthYear + p.retirementAge - 3, c.plan.startYear + 1);
    if (ageOf(p, y) >= p.retirementAge) continue;
    const r = rec(c, p.birthYear + p.retirementAge - 1);
    const balance = r.pkByPerson[i] ?? 0;
    if (balance < 50000) continue;
    const conv = Math.max(0.03, p.pkConversionRate + (p.retirementAge - 65) * PARAMS.bvg.conversionReductionPerYear);
    const opt = (share: number, label: string): CardOption => {
      const capital = balance * share;
      const pension = (balance - capital) * conv;
      const taxCap = capital > 0 ? capTax(c, capital) : 0;
      const parts = [];
      if (pension > 0) parts.push(`Rente ${chf(pension / 12)}/Monat`);
      if (capital > 0) parts.push(`Kapital ${chf(capital)} (Steuer ca. ${chf(taxCap)})`);
      return { id: `c${Math.round(share * 100)}`, label, detail: parts.join(', '), patch: { persons: [{ id: p.id, set: { pkCapitalShare: share } }] }, current: Math.abs(p.pkCapitalShare - share) < 0.13 };
    };
    const pensionFull = balance * conv;
    const breakEven = pensionFull > 0 ? p.retirementAge + (balance - capTax(c, balance)) / pensionFull : 0;
    cards.push({
      id,
      year: y,
      chapter: 'Pensionierung',
      kind: 'entscheid',
      title: `${p.name}: Rente oder Kapital?`,
      story: `Bei der Pensionierung liegen voraussichtlich ${chf(balance)} in der Pensionskasse. Die Rente ist lebenslang garantiert, aber nicht teuerungsgeschützt. Das Kapital bleibt flexibel und vererbbar, du trägst aber das Anlage- und Langlebigkeitsrisiko. Viele Kassen verlangen die Anmeldung des Kapitalbezugs ein bis drei Jahre im Voraus.`,
      facts: [
        { label: 'Umwandlungssatz', value: pct(conv, 2) },
        { label: 'Rente bei 100 %', value: `${chf(pensionFull)} pro Jahr` },
        { label: 'Kapital (netto) aufgebraucht mit', value: breakEven ? `ca. ${Math.round(breakEven)} Jahren` : '–' }
      ],
      taxNote: { title: 'Steuerlich', text: 'Die Rente ist jedes Jahr voll als Einkommen steuerbar. Das Kapital wird einmalig reduziert besteuert, danach unterliegen der Ertrag der Einkommens- und der Bestand der Vermögenssteuer.' },
      options: [opt(0, '100 % Rente'), opt(0.5, 'Halb-halb'), opt(1, '100 % Kapital')]
    });
  }
  return cards;
};

const ahvTimingCard: Generator = (c) => {
  const cards: Card[] = [];
  for (const p of c.plan.persons) {
    const id = `ahv_${p.id}`;
    if (c.decided.has(id)) continue;
    const ref = ahvReferenceAge(p.birthYear, p.sex);
    const y = Math.max(c.fromYear, p.birthYear + Math.min(62, p.retirementAge - 1), c.plan.startYear + 1);
    if (ageOf(p, y) >= 63) continue;
    const opt = (age: number, label: string): CardOption => {
      const diff = age - ref;
      const f = diff < 0 ? 1 + diff * PARAMS.ahv.earlyReductionPerYear : 1 + (PARAMS.ahv.deferralSupplement[Math.min(5, Math.round(diff))] ?? 0);
      return { id: `a${age}`, label, detail: `${chf(p.ahvMonthly * f)} pro Monat${Math.abs(f - 1) < 1e-6 ? ', volle Rente' : ` (${diff < 0 ? '−' : '+'}${pct(Math.abs(f - 1), 1)})`}`, patch: { persons: [{ id: p.id, set: { ahvClaimAge: age } }] }, current: p.ahvClaimAge === age };
    };
    const opts = [opt(63, 'Vorbezug mit 63'), opt(64, 'Vorbezug mit 64'), opt(Math.round(ref), `Ordentlich mit ${Math.round(ref)}`), opt(67, 'Aufschub bis 67'), opt(70, 'Aufschub bis 70')];
    if (!opts.some((o) => o.current)) opts.push({ id: 'keep', label: `Wie geplant mit ${p.ahvClaimAge}`, detail: 'Keine Änderung', patch: {}, current: true });
    cards.push({
      id,
      year: y,
      chapter: 'Pensionierung',
      kind: 'entscheid',
      title: `${p.name}: Wann die AHV beziehen?`,
      story: `Die AHV lässt sich zwischen 63 und 70 beziehen. Ein Vorbezug kürzt die Rente lebenslang, ein Aufschub erhöht sie. Ohne Vorbezug wird ab ${Math.round(ref)} die volle Rente laut Rentenvorausberechnung ausbezahlt: ${chf(p.ahvMonthly)} pro Monat, plus 13. Rente.`,
      facts: [
        { label: 'Kürzung pro Jahr Vorbezug', value: pct(PARAMS.ahv.earlyReductionPerYear, 1) },
        { label: 'Zuschlag nach 2 Jahren Aufschub', value: pct(PARAMS.ahv.deferralSupplement[2], 1) }
      ],
      taxNote: { title: 'Gut zu wissen', text: 'Ein Vorbezug lohnt sich rechnerisch, wenn man vor etwa 80 stirbt. Er kann aber helfen, bei einer Frühpensionierung das Vermögen zu schonen.' },
      options: opts
    });
  }
  return cards;
};

const mortgageRetireCard: Generator = (c) => {
  const id = 'mortgage_retire';
  if (c.decided.has(id)) return null;
  const y = Math.max(c.fromYear, Math.min(...c.plan.persons.map((p) => p.birthYear + p.retirementAge)) - 1);
  const r = rec(c, y - 1);
  if (!r || r.mortgage < 100000 || r.propertyValue <= 0) return null;
  const target = r.propertyValue * 0.5;
  const amount = round(Math.max(0, r.mortgage - target), 10000);
  if (amount < 20000 || r.liquid < amount + 50000) return null;
  return {
    id,
    year: y,
    chapter: 'Pensionierung',
    kind: 'entscheid',
    title: 'Hypothek vor der Pension reduzieren?',
    story: `Die Hypothek beträgt ${chf(r.mortgage)}. Mit der Pensionierung sinkt das Einkommen – die Bank prüft die Tragbarkeit neu. Frei verfügbar sind ${chf(r.liquid)}.`,
    facts: [
      { label: 'Belehnung', value: pct(r.mortgage / r.propertyValue) },
      { label: 'Zins (Annahme)', value: pct(c.plan.assumptions.mortgageRateFuture, 1) }
    ],
    taxNote: { title: 'Steuerlich', text: `Nach dem Systemwechsel (${c.plan.assumptions.reformYear}) sind Schuldzinsen für das Eigenheim nicht mehr abziehbar – Amortisieren wird steuerlich attraktiver als früher.` },
    options: [
      { id: 'amortize', label: `${chf(amount)} amortisieren`, detail: 'Belehnung auf 50 % senken', patch: { addEvents: [{ id: randomId(6), type: 'amortize', year: y, amount }] } },
      { id: 'keep', label: 'So lassen', detail: 'Liquidität behalten', patch: {}, current: true }
    ]
  };
};

const retireSpendingCard: Generator = (c) => {
  const id = 'retire_spending';
  if (c.decided.has(id)) return null;
  const retireYear = Math.max(...c.plan.persons.map((p) => p.birthYear + p.retirementAge));
  const y = Math.max(c.fromYear, retireYear + 2);
  const r = rec(c, y - 1);
  if (!r) return null;
  const p1 = c.plan.persons[0];
  const until = p1.birthYear + 80;
  return {
    id,
    year: y,
    chapter: 'Ruhestand',
    kind: 'entscheid',
    title: 'Die ersten Jahre im Ruhestand',
    story: `${y}: Ihr seid pensioniert. Frei verfügbar sind ${chf(r.liquid)}. Die «aktiven» Jahre bis etwa 80 sind oft die ausgabenfreudigsten. Wie wollt ihr sie gestalten?`,
    facts: [
      { label: 'Renten pro Monat', value: chf((r.ahv + r.pkPension) / 12) },
      { label: 'Ausgaben pro Monat', value: chf((r.expenses + r.housing) / 12) }
    ],
    options: [
      { id: 'more', label: 'Mehr geniessen', detail: `+CHF 1’000 pro Monat bis ${until}`, patch: { addEvents: [{ id: randomId(6), type: 'expense_change', year: y, yearly: 12000, label: 'Mehr Reisen und Hobbys', untilYear: until }] } },
      { id: 'keep', label: 'Wie geplant', detail: 'Keine Änderung', patch: {}, current: true },
      { id: 'less', label: 'Sparsamer leben', detail: '−10 % Ausgaben', patch: { addEvents: [{ id: randomId(6), type: 'expense_change', year: y, yearly: -round((r.expenses + r.housing) * 0.1, 500), label: 'Bescheidener leben' }] } }
    ]
  };
};

const houseSellCard: Generator = (c) => {
  const id = 'house_sell';
  if (c.decided.has(id)) return null;
  const p1 = c.plan.persons[0];
  const y = Math.max(c.fromYear, p1.birthYear + 78);
  const r = rec(c, y - 1);
  if (!r || r.propertyValue <= 0 || y > c.plan.startYear + c.market.length - 3) return null;
  const purchase = c.plan.property?.purchasePrice ?? (c.plan.events.find((e) => e.type === 'house_purchase') as Extract<LifeEvent, { type: 'house_purchase' }> | undefined)?.price ?? r.propertyValue;
  const purchaseYear = c.plan.property?.purchaseYear ?? c.plan.events.find((e) => e.type === 'house_purchase')?.year ?? c.plan.startYear;
  const price = round(r.propertyValue, 10000);
  const ggst = estimateGrundstueckgewinnsteuer(price - purchase, y - purchaseYear);
  return {
    id,
    year: y,
    chapter: 'Ruhestand',
    kind: 'entscheid',
    title: 'Im Eigenheim bleiben?',
    story: `${p1.name} ist ${ageOf(p1, y)}. Das Haus ist rund ${chf(price)} wert. Ein Umzug in eine kleinere, hindernisfreie Mietwohnung würde Kapital freisetzen.`,
    facts: [
      { label: 'Hypothek', value: chf(r.mortgage) },
      { label: 'Grundstückgewinnsteuer (grob)', value: chf(ggst) }
    ],
    taxNote: { title: 'Grundstückgewinnsteuer', text: 'Der Gewinn aus dem Verkauf wird kantonal besteuert, mit Ermässigungen bei langer Besitzdauer. Die Schätzung folgt dem Zürcher Tarif und dient nur der Orientierung.' },
    options: [
      { id: 'sell', label: 'Verkaufen und mieten', detail: `Miete CHF 2’400 pro Monat, Erlös nach Steuern ca. ${chf(price * 0.98 - r.mortgage - ggst)}`, patch: { addEvents: [{ id: randomId(6), type: 'house_sale', year: y, price, newRentMonthly: 2400 }] } },
      { id: 'stay', label: 'Bleiben', detail: 'Vertraute Umgebung behalten', patch: {}, current: true }
    ]
  };
};

const giftCard: Generator = (c) => {
  const id = 'gift';
  if (c.decided.has(id)) return null;
  const kids = c.plan.children.length + c.plan.events.filter((e) => e.type === 'child').length;
  if (!kids) return null;
  const p1 = c.plan.persons[0];
  const y = Math.max(c.fromYear, p1.birthYear + 72);
  const r = rec(c, y - 1);
  if (!r || r.liquid < 700000 || y > c.plan.startYear + c.market.length - 3) return null;
  const amount = 100000 * kids;
  return {
    id,
    year: y,
    chapter: 'Ruhestand',
    kind: 'entscheid',
    title: 'Mit warmen Händen geben?',
    story: `Frei verfügbar sind ${chf(r.liquid)} – mehr, als ihr voraussichtlich braucht. Eine Schenkung zu Lebzeiten hilft den Kindern oft dann, wenn sie es brauchen.`,
    facts: [{ label: 'Schenkung', value: `${chf(100000)} pro Kind` }],
    taxNote: { title: 'Schenkungssteuer', text: `${inheritanceInfo(c.tax.cantonId, 'eltern').split('. ')[0].replace('Erbschaften', 'Schenkungen')}. Massgebend ist der Wohnkanton der schenkenden Person. Schenkungen werden beim Erbgang ausgeglichen, wenn nichts anderes vereinbart ist.` },
    options: [
      { id: 'give', label: `${chf(amount)} schenken`, detail: 'Als Erbvorbezug, ausgleichungspflichtig', patch: { addEvents: [{ id: randomId(6), type: 'gift', year: y, amount, label: 'Schenkung an Kinder' }] } },
      { id: 'keep', label: 'Behalten', detail: 'Reserve für Pflege und Unvorhergesehenes', patch: {}, current: true }
    ]
  };
};

const GENERATORS: Generator[] = [
  start3a,
  startInvest,
  childCard,
  careerCard,
  houseCard,
  crashCard,
  inheritanceCard,
  buyInCard,
  p3aStaggerCard,
  partTimeCard,
  retireTimingCard,
  pkCapitalCard,
  ahvTimingCard,
  mortgageRetireCard,
  retireSpendingCard,
  giftCard,
  houseSellCard
];

export interface JourneyStep {
  plan: Plan;
  market: MarketYear[];
  records: YearRecord[];
  card: Card | null;
}

export function journeyMarket(plan: Plan, seed: number): MarketYear[] {
  const years = Math.max(...plan.persons.map((p) => p.birthYear + plan.assumptions.endAge)) - plan.startYear + 1;
  return generateMarketPath(plan.assumptions, years, seed);
}

export function simulateJourney(plan: Plan, tax: TaxContext, market: MarketYear[]) {
  const prep = prepare(plan, tax);
  return simulatePath(prep, market, true);
}

export function nextStep(basePlan: Plan, tax: TaxContext, state: JourneyState): JourneyStep {
  const plan = applyDecisions(basePlan, state.decisions);
  const market = journeyMarket(plan, state.seed);
  const out = simulateJourney(plan, tax, market);
  const records = out.records!;
  const fromYear = state.decisions.length ? state.decisions[state.decisions.length - 1].year : plan.startYear;
  const marginal = currentTaxes(plan, tax).marginalRate;
  const ctx: Ctx = { plan, tax, market, records, decided: new Set(state.decisions.map((d) => d.cardId)), fromYear, seed: state.seed, marginal };
  let best: Card | null = null;
  for (const g of GENERATORS) {
    const res = g(ctx);
    const list = Array.isArray(res) ? res : res ? [res] : [];
    for (const card of list) {
      if (card.year < fromYear) continue;
      if (!best || card.year < best.year) best = card;
    }
  }
  return { plan, market, records, card: best };
}

/** Entscheid treffen und Wirkung auf dem Lebenspfad messen. */
export function decide(basePlan: Plan, tax: TaxContext, state: JourneyState, card: Card, option: CardOption): JourneyState {
  const before = applyDecisions(basePlan, state.decisions);
  const after = applyPatch(before, option.patch);
  const market = journeyMarket(before, state.seed);
  const a = simulateJourney(before, tax, market).summary;
  const b = simulateJourney(after, tax, market).summary;
  const decision: Decision = {
    cardId: card.id,
    optionId: option.id,
    year: card.year,
    title: card.title,
    optionLabel: option.label,
    detail: option.detail,
    patch: option.patch,
    effect: { endNetWorth: b.endNetWorth - a.endNetWorth, taxes: b.totalTaxes - a.totalTaxes }
  };
  return { ...state, decisions: [...state.decisions, decision] };
}

export function newJourneySeed(): number {
  const arr = new Uint32Array(1);
  globalThis.crypto.getRandomValues(arr);
  return arr[0];
}
