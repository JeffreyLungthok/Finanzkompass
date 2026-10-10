/**
 * Erkenntnisse und Überraschungen: Was fällt am Plan auf, worauf sollte man achten?
 * Jede Erkenntnis ist allgemein formuliert – keine persönliche Anlage- oder Steuerberatung.
 */
import { PARAMS, ahvReferenceAge } from './params';
import type { Plan } from './plan';
import type { MonteCarloResult } from './montecarlo';
import type { CurrentTaxes } from './taxHelpers';
import { currentSpending } from './taxHelpers';
import type { TaxContext } from './tax/types';
import { expectedMarketPath } from './market';
import { prepare, simulatePath } from './simulate';

export type Severity = 'gut' | 'hinweis' | 'warnung';
export type InsightTopic = 'vorsorge' | 'steuern' | 'wohnen' | 'vermoegen' | 'familie' | 'ahv';

export interface Insight {
  id: string;
  severity: Severity;
  topic: InsightTopic;
  title: string;
  text: string;
  /** Betrag in CHF, z. B. mögliche Steuerersparnis */
  amount?: number;
  amountLabel?: string;
}

const chf = (v: number) => `CHF\u00a0${Math.round(v).toLocaleString('de-CH')}`;
const pct = (v: number) => `${Math.round(v * 100)}\u00a0%`;

export interface RetirementSnapshot {
  year: number;
  ages: number[];
  pensions: number;
  ahv: number;
  pk: number;
  spending: number;
  taxes: number;
  gapYearly: number;
  coverage: number;
  replacementRate: number;
  lastNetIncome: number;
}

/** Erstes Jahr, in dem alle Personen pensioniert sind. */
export function retirementSnapshot(plan: Plan, mc: MonteCarloResult): RetirementSnapshot | null {
  const recs = mc.expected.records;
  const idx = recs.findIndex((r) => r.retired.every(Boolean) && r.ages.every((a, i) => a >= plan.persons[i].ahvClaimAge));
  if (idx < 0) return null;
  // Ein Jahr nach der Pensionierung messen, damit Kapitalbezüge nicht verzerren
  const r = recs[Math.min(recs.length - 1, idx + 1)];
  const lastWork = [...recs.slice(0, idx)].reverse().find((x) => x.netSalary > 0);
  const pensions = r.ahv + r.pkPension;
  const spending = r.expenses + r.housing + r.children;
  const taxes = r.taxIncome + r.taxWealth;
  return {
    year: r.year,
    ages: r.ages,
    pensions,
    ahv: r.ahv,
    pk: r.pkPension,
    spending,
    taxes,
    gapYearly: spending + taxes - pensions,
    coverage: pensions / Math.max(1, spending + taxes),
    replacementRate: lastWork ? pensions / Math.max(1, lastWork.netSalary + lastWork.allowances) : 0,
    lastNetIncome: lastWork ? lastWork.netSalary : 0
  };
}

export function buildInsights(plan: Plan, tax: TaxContext, mc: MonteCarloResult, taxes: CurrentTaxes): Insight[] {
  const out: Insight[] = [];
  const a = plan.assumptions;
  const y0 = plan.startYear;
  const marginal = taxes.marginalRate;
  const snap = retirementSnapshot(plan, mc);
  const recs = mc.expected.records;

  // ---- Gesamtbild ----
  if (mc.successRate >= 0.9) {
    out.push({
      id: 'success',
      severity: 'gut',
      topic: 'vermoegen',
      title: 'Dein Plan ist robust',
      text: `In ${pct(mc.successRate)} der ${mc.simulations} simulierten Zukünfte reicht dein Geld bis Alter ${a.endAge}. Auch schlechte Börsenjahre bringen ihn nicht ins Wanken.`
    });
  } else if (mc.successRate >= 0.7) {
    out.push({
      id: 'success',
      severity: 'hinweis',
      topic: 'vermoegen',
      title: 'Auf Kurs, aber mit wenig Reserve',
      text: `In ${pct(mc.successRate)} der simulierten Zukünfte reicht das Geld bis ${a.endAge}. Bei einer Folge schwacher Börsenjahre wird es eng – kleine Anpassungen bei Sparrate, Ausgaben oder Pensionsalter wirken stark.`
    });
  } else {
    const failAge = mc.expected.summary.failedYear ? mc.expected.summary.failedYear - plan.persons[0].birthYear : null;
    out.push({
      id: 'success',
      severity: 'warnung',
      topic: 'vermoegen',
      title: 'Das Geld reicht in vielen Szenarien nicht',
      text: `Nur in ${pct(mc.successRate)} der simulierten Zukünfte reicht das Geld bis ${a.endAge}.${failAge ? ` Im mittleren Szenario sind die frei verfügbaren Mittel mit etwa ${failAge} aufgebraucht.` : ''}${mc.successRateWithProperty > mc.successRate + 0.1 ? ' Mit dem Wohneigentum als Reserve (Verkauf oder höhere Belehnung) sieht es besser aus.' : ''}`
    });
  }

  // ---- Fehlbeträge im Erwerbsleben / beim Hauskauf ----
  const house = plan.events.find((e) => e.type === 'house_purchase');
  const houseRec = house ? recs.find((r) => r.year === house.year) : undefined;
  if (house && houseRec && houseRec.shortfall > 1000) {
    out.push({
      id: 'house_equity',
      severity: 'warnung',
      topic: 'wohnen',
      title: `Eigenkapital für den Hauskauf ${house.year} fehlt`,
      text: `Im mittleren Szenario fehlen beim Kauf rund ${chf(houseRec.shortfall)} an frei verfügbaren Mitteln. Mehr sparen, den Kauf verschieben, einen tieferen Preis wählen oder einen Teil aus der Pensionskasse oder der Säule 3a vorbeziehen.`
    });
  }
  const workingShortfall = recs.find((r) => r.shortfall > 1000 && !r.retired.every(Boolean) && (!house || r.year !== house.year));
  if (workingShortfall) {
    out.push({
      id: 'budget',
      severity: 'warnung',
      topic: 'vermoegen',
      title: 'Das Budget geht schon vor der Pensionierung nicht auf',
      text: `Im mittleren Szenario reichen Einnahmen und Ersparnisse ${workingShortfall.year} nicht mehr für Ausgaben und Steuern. Prüfe die erfassten Ausgaben – häufig sind Beträge doppelt oder pro Jahr statt pro Monat erfasst.`
    });
  }

  // ---- Rentenlücke ----
  if (snap) {
    if (snap.gapYearly > 0) {
      out.push({
        id: 'gap',
        severity: snap.coverage < 0.6 ? 'warnung' : 'hinweis',
        topic: 'vorsorge',
        title: `Renten decken ${pct(snap.coverage)} der Ausgaben`,
        text: `Ab ${snap.year} decken AHV und Pensionskasse rund ${chf(snap.pensions / 12)} pro Monat. Ausgaben und Steuern liegen bei ${chf((snap.spending + snap.taxes) / 12)}. Die Lücke von ${chf(snap.gapYearly / 12)} pro Monat muss aus dem Vermögen kommen. Das entspricht einer Ersatzquote von ${pct(snap.replacementRate)} des letzten Nettolohns – Fachleute nennen oft 70–80 % als Richtwert.`,
        amount: snap.gapYearly / 12,
        amountLabel: 'Lücke pro Monat'
      });
    } else {
      out.push({
        id: 'gap',
        severity: 'gut',
        topic: 'vorsorge',
        title: 'Renten decken die Ausgaben',
        text: `Ab ${snap.year} decken AHV und Pensionskasse mit ${chf(snap.pensions / 12)} pro Monat deine geplanten Ausgaben inklusive Steuern. Das Vermögen bleibt Reserve.`
      });
    }
  }

  // ---- PK-Rente ohne Teuerungsausgleich ----
  const pkPensioners = plan.persons.filter((p) => p.hasPensionFund && p.pkCapitalShare < 1);
  if (pkPensioners.length && snap && snap.pk > 0) {
    const loss = 1 - 1 / Math.pow(1 + a.inflation, 20);
    out.push({
      id: 'pk_inflation',
      severity: 'hinweis',
      topic: 'vorsorge',
      title: 'Die PK-Rente verliert an Kaufkraft',
      text: `Pensionskassen passen ihre Renten meist nicht an die Teuerung an. Bei ${pct(a.inflation)} Teuerung ist die PK-Rente nach 20 Jahren real rund ${pct(loss)} weniger wert. Die Grafik zeigt das bereits: Die PK-Rente sinkt in heutigen Franken. Die AHV wird dagegen regelmässig angepasst.`
    });
  }

  // ---- Frühpensionierung ----
  for (const p of plan.persons) {
    const ref = ahvReferenceAge(p.birthYear, p.sex);
    if (p.retirementAge < ref) {
      const ne = recs.reduce((s, r) => s + r.ahvNonEmployed, 0);
      out.push({
        id: `early_${p.id}`,
        severity: 'hinweis',
        topic: 'ahv',
        title: `${p.name}: Frühpensionierung mit ${p.retirementAge}`,
        text: `Bis zum AHV-Referenzalter (${String(ref).replace('.', ',')}) bleiben AHV-Beiträge als Nichterwerbstätige geschuldet – berechnet auf dem Vermögen und 20-mal dem Renteneinkommen.${ne > 0 ? ` Im Plan sind das total rund ${chf(ne)}.` : ''} Die AHV-Rente gibt es frühestens mit 63 (Kürzung ${pct(PARAMS.ahv.earlyReductionPerYear)} pro Jahr). Viele Pensionskassen senken den Umwandlungssatz pro Jahr Vorbezug um rund 0,2 Prozentpunkte.${plan.relationship === 'm' && plan.persons.length === 2 ? ' Verheiratete sind von den Beiträgen befreit, solange der erwerbstätige Partner mindestens den doppelten Mindestbeitrag bezahlt.' : ''}`,
        amount: ne || undefined,
        amountLabel: ne ? 'AHV-Beiträge als Nichterwerbstätige' : undefined
      });
    }
  }

  // ---- Kapitalbezugssteuer und Staffelung ----
  const capTaxTotal = recs.reduce((s, r) => s + r.taxCapital, 0);
  if (capTaxTotal > 0) {
    // Vergleich: maximale Staffelung der 3a-Konten
    let saving = 0;
    const canStagger = plan.persons.some((p) => p.p3aAccounts < 5 && (p.p3aBalance > 20000 || p.p3aContribution > 3000));
    if (canStagger) {
      const alt: Plan = { ...plan, persons: plan.persons.map((p) => ({ ...p, p3aAccounts: 5 })) };
      const prep = prepare(alt, tax);
      const altOut = simulatePath(prep, expectedMarketPath(alt.assumptions, prep.years), true);
      const altTax = altOut.records!.reduce((s, r) => s + r.taxCapital, 0);
      saving = capTaxTotal - altTax;
    }
    out.push({
      id: 'capital_tax',
      severity: saving > 2000 ? 'hinweis' : 'gut',
      topic: 'steuern',
      title: `Kapitalbezugssteuer: rund ${chf(capTaxTotal)}`,
      text: `Bezüge aus Säule 3a und Pensionskasse werden separat und reduziert besteuert – aber progressiv, und alle Bezüge eines Jahres werden zusammengezählt (bei Ehepaaren beider Partner).${saving > 2000 ? ` Mit fünf 3a-Konten, die du ab 60 gestaffelt in verschiedenen Jahren beziehst, sparst du im Plan rund ${chf(saving)}.` : ' Dein Plan verteilt die Bezüge bereits sinnvoll.'} Pensionskassen-Kapital und 3a besser nicht im selben Jahr beziehen.`,
      amount: saving > 2000 ? saving : undefined,
      amountLabel: saving > 2000 ? 'mögliche Ersparnis' : undefined
    });
  }

  // ---- Säule 3a ausschöpfen ----
  for (const p of plan.persons) {
    const age = y0 - p.birthYear;
    if (age >= p.retirementAge || p.grossSalary <= 0) continue;
    const max = p.hasPensionFund ? PARAMS.pillar3a.maxWithPensionFund : Math.min(PARAMS.pillar3a.maxWithoutPensionFund, p.grossSalary * 0.2);
    const missing = max - p.p3aContribution;
    if (missing > 500) {
      out.push({
        id: `p3a_${p.id}`,
        severity: 'hinweis',
        topic: 'steuern',
        title: `${p.name}: Säule 3a nicht ausgeschöpft`,
        text: `Bis zum Maximum von ${chf(max)} fehlen ${chf(missing)} pro Jahr. Bei deinem Grenzsteuersatz von rund ${pct(marginal)} spart das jährlich etwa ${chf(missing * marginal)} Steuern. Seit 2026 lassen sich zudem Lücken ab dem Beitragsjahr 2025 nachzahlen.`,
        amount: missing * marginal,
        amountLabel: 'Steuerersparnis pro Jahr'
      });
    } else if (missing <= 500 && p.p3aContribution > 0 && !p.p3aInvested && 65 - age > 10) {
      out.push({
        id: `p3a_invest_${p.id}`,
        severity: 'hinweis',
        topic: 'vorsorge',
        title: `${p.name}: 3a liegt auf einem Konto`,
        text: `Bei ${65 - age} Jahren Anlagehorizont bringen 3a-Konten real oft weniger als null. 3a-Wertschriftenlösungen schwanken, haben aber langfristig deutlich höhere erwartete Renditen. Ob das passt, hängt von deiner Risikobereitschaft ab.`
      });
    }
  }

  // ---- PK-Einkauf ----
  for (const p of plan.persons) {
    const age = y0 - p.birthYear;
    if (!p.hasPensionFund || p.pkBuyInPotential < 5000 || age >= p.retirementAge) continue;
    const yearly = Math.min(p.pkBuyInPotential, 20000);
    const hasBuyIn = plan.events.some((e) => e.type === 'pk_buyin' && e.person === p.id);
    out.push({
      id: `buyin_${p.id}`,
      severity: 'hinweis',
      topic: 'steuern',
      title: `${p.name}: Einkaufspotenzial von ${chf(p.pkBuyInPotential)}`,
      text: `Ein Einkauf in die Pensionskasse ist voll vom Einkommen abziehbar. ${chf(yearly)} sparen bei deinem Grenzsteuersatz rund ${chf(yearly * marginal)} Steuern. Verteilt auf mehrere Jahre bricht man die Progression stärker.${p.pkCapitalShare > 0 ? ' Achtung: In den drei Jahren nach einem Einkauf ist kein Kapitalbezug möglich, sonst wird der Steuerabzug rückgängig gemacht.' : ''} Gegenargument: Das Geld ist bis zur Pensionierung gebunden und trägt das Risiko der Pensionskasse.${hasBuyIn ? '' : ' Du kannst Einkäufe als Lebensereignis einplanen.'}`,
      amount: yearly * marginal,
      amountLabel: `Steuerersparnis bei ${chf(yearly)}`
    });
  }

  // ---- Wohneigentum ----
  if (plan.property || plan.events.some((e) => e.type === 'house_purchase')) {
    const reform = a.reformYear;
    const before = recs.find((r) => r.year === reform - 1);
    const after = recs.find((r) => r.year === reform);
    if (before && after && before.propertyValue > 0) {
      const diff = before.taxIncome - after.taxIncome;
      out.push({
        id: 'emw',
        severity: 'hinweis',
        topic: 'wohnen',
        title: `Eigenmietwert fällt ${reform} weg`,
        text: `Mit dem Systemwechsel entfallen der Eigenmietwert, der Schuldzinsabzug und der Unterhaltsabzug für selbstbewohntes Wohneigentum. Ersterwerber können noch während zehn Jahren einen sinkenden Schuldzinsabzug geltend machen. In deinem Plan ${diff >= 0 ? `sinken die Einkommenssteuern dadurch um rund ${chf(diff)} pro Jahr` : `steigen die Einkommenssteuern dadurch um rund ${chf(-diff)} pro Jahr – die Schuldzinsen waren höher als der Eigenmietwert`}. Damit wird auch das Amortisieren steuerlich attraktiver.`
      });
    }
    // Tragbarkeit im Alter
    if (snap) {
      const r = recs.find((x) => x.year === snap.year);
      if (r && r.mortgage > 0) {
        const burden = r.mortgage * PARAMS.mortgage.calcRate + r.propertyValue * PARAMS.mortgage.calcMaintenance;
        const income = snap.pensions;
        const ratio = burden / Math.max(1, income);
        if (ratio > PARAMS.mortgage.maxAffordabilityRatio) {
          const maxMortgage = (income * PARAMS.mortgage.maxAffordabilityRatio - r.propertyValue * PARAMS.mortgage.calcMaintenance) / PARAMS.mortgage.calcRate;
          out.push({
            id: 'affordability',
            severity: 'warnung',
            topic: 'wohnen',
            title: 'Tragbarkeit im Ruhestand knapp',
            text: `Banken rechnen mit 5 % kalkulatorischem Zins plus 1 % Unterhalt. Mit den Renten ab ${snap.year} ergibt das eine Belastung von ${pct(ratio)} – üblich sind höchstens 33 %. Die Bank kann bei der Verlängerung eine Amortisation auf rund ${chf(Math.max(0, maxMortgage))} verlangen. Frühzeitig planen: indirekt über die Säule 3a amortisieren oder Kapital bereithalten.`
          });
        }
      }
    }
  }

  // ---- Liquidität ----
  const spending = currentSpending(plan);
  const reserve = (spending / 12) * 3;
  if (plan.portfolio.cash < reserve) {
    out.push({
      id: 'reserve',
      severity: 'hinweis',
      topic: 'vermoegen',
      title: 'Notgroschen eher knapp',
      text: `Auf dem Konto liegen ${chf(plan.portfolio.cash)}. Als Reserve für Unvorhergesehenes gelten drei bis sechs Monatsausgaben, bei dir also ${chf(reserve)} bis ${chf(reserve * 2)}.`
    });
  } else if (plan.portfolio.cash > reserve * 3 && plan.portfolio.cash > 60000) {
    const excess = plan.portfolio.cash - reserve * 2;
    const loss = excess * (a.inflation - a.cashYield);
    out.push({
      id: 'cash',
      severity: 'hinweis',
      topic: 'vermoegen',
      title: 'Viel Geld auf dem Konto',
      text: `Rund ${chf(excess)} liegen über einer grosszügigen Reserve. Bei ${pct(a.inflation)} Teuerung und ${String(a.cashYield * 100).replace('.', ',')} % Zins verliert dieser Betrag real etwa ${chf(loss)} pro Jahr an Kaufkraft. Ob du das Geld anlegst, hängt von deinen Plänen und deiner Risikobereitschaft ab.`,
      amount: loss,
      amountLabel: 'Kaufkraftverlust pro Jahr'
    });
  }

  // ---- AHV ----
  if (plan.persons.length === 2 && plan.relationship === 'm') {
    const sum = plan.persons.reduce((s, p) => s + p.ahvMonthly, 0);
    if (sum > PARAMS.ahv.coupleMaxMonthly) {
      out.push({
        id: 'plafonierung',
        severity: 'hinweis',
        topic: 'ahv',
        title: 'AHV-Plafonierung für Ehepaare',
        text: `Zusammen hättet ihr Anspruch auf ${chf(sum)} pro Monat. Für Ehepaare ist die Summe auf 150 % der Maximalrente begrenzt: ${chf(PARAMS.ahv.coupleMaxMonthly)} pro Monat (plus 13. Rente). Der Plan berücksichtigt das.`
      });
    }
  }
  if (plan.persons.some((p) => p.ahvMonthly === 2300)) {
    out.push({
      id: 'ahv_estimate',
      severity: 'hinweis',
      topic: 'ahv',
      title: 'AHV-Rente ist noch geschätzt',
      text: 'Die AHV-Rente beeinflusst den Plan stark. Bestelle bei deiner Ausgleichskasse eine Rentenvorausberechnung und trage den Betrag ein. Eine Anleitung findest du unter «Infos → AHV-Rente herausfinden».'
    });
  }
  for (const p of plan.persons) {
    if (p.sex === 'f' && p.birthYear >= 1961 && p.birthYear <= 1963) {
      out.push({
        id: `ref_${p.id}`,
        severity: 'hinweis',
        topic: 'ahv',
        title: `${p.name}: Übergangsgeneration AHV 21`,
        text: `Für Frauen mit Jahrgang ${p.birthYear} liegt das Referenzalter bei ${String(ahvReferenceAge(p.birthYear, 'f')).replace('.', ',')} Jahren. Bei einem Vorbezug gelten reduzierte Kürzungssätze, bei Erwerb über 64 hinaus ein Rentenzuschlag.`
      });
    }
  }

  // ---- Konkubinat ----
  if (plan.persons.length === 2 && plan.relationship === 'c') {
    out.push({
      id: 'concubinage',
      severity: 'warnung',
      topic: 'familie',
      title: 'Konkubinat: Absicherung prüfen',
      text: 'Unverheiratete Paare erhalten keine AHV-Witwen- oder Witwerrente. Bei der Pensionskasse und in der Säule 3a muss die Partnerin oder der Partner meist aktiv als begünstigt gemeldet werden. Je nach Kanton fallen auf Erbschaften zwischen Konkubinatspartnern Erbschaftssteuern an. Ohne Testament erbt der Partner gar nichts.'
    });
  }

  // ---- Grosser Spielraum ----
  if (mc.successRate > 0.95 && mc.end.p50 > 1_000_000) {
    out.push({
      id: 'surplus',
      severity: 'gut',
      topic: 'vermoegen',
      title: 'Du baust mehr Vermögen auf, als du brauchst',
      text: `Im mittleren Szenario bleiben mit ${a.endAge} rund ${chf(mc.end.p50)} übrig. Das eröffnet Optionen: früher Pensum reduzieren, mehr ausgeben, Schenkungen zu Lebzeiten oder bewusst eine Reserve für Pflegekosten halten.`
    });
  }

  // ---- Risiko vor der Pensionierung ----
  if (plan.portfolio.stockShare >= 0.8 && plan.persons.some((p) => p.retirementAge - (y0 - p.birthYear) <= 10)) {
    out.push({
      id: 'sequence',
      severity: 'hinweis',
      topic: 'vermoegen',
      title: 'Hoher Aktienanteil kurz vor der Pensionierung',
      text: 'Ein Börseneinbruch kurz vor oder nach der Pensionierung wirkt besonders stark, weil dann Vermögen verbraucht wird (Sequenzrisiko). Viele planen deshalb einige Jahresausgaben in sicheren Anlagen.'
    });
  }

  // ---- Ausgaben steigen im Ruhestand ----
  const rentItems = plan.expenses.filter((e) => e.retirementFactor > 1);
  if (rentItems.length === 0 && snap) {
    out.push({
      id: 'health_costs',
      severity: 'hinweis',
      topic: 'vorsorge',
      title: 'Gesundheitskosten im Alter',
      text: 'Krankenkassenprämien steigen seit Jahren stärker als die Teuerung, und im hohen Alter kommen oft Kosten für Unterstützung oder Pflege dazu. Ein Faktor über 1 für die Krankenkasse im Ruhestand macht den Plan realistischer.'
    });
  }

  // Steuer-Überblick heute
  out.push({
    id: 'tax_today',
    severity: 'gut',
    topic: 'steuern',
    title: `Steuern heute: rund ${chf(taxes.total)} pro Jahr`,
    text: `Das sind ${taxes.grossIncome > 0 ? `${pct(taxes.total / taxes.grossIncome)} des Bruttolohns` : `${pct(taxes.total / Math.max(1, taxes.pensionIncome))} der Renten`}. Jeder zusätzliche Franken Einkommen wird mit etwa ${pct(marginal)} besteuert (Grenzsteuersatz) – so viel spart auch jeder abziehbare Franken.`
  });

  return out;
}
