import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleAlert, Download, Printer } from 'lucide-react';
import { useAppState, updatePlan } from '../lib/store';
import { useSimulation } from '../lib/useSimulation';
import { href } from '../lib/router';
import { chf, chfShort, pct } from '../lib/format';
import { Signpost } from '../components/Signpost';
import { WealthProfile, type Milestone } from '../components/charts/WealthProfile';
import { IncomeChart } from '../components/charts/IncomeChart';
import { RangeField, Segmented } from '../components/fields';
import { EVENT_LABELS } from './plan/StepEvents';
import type { Plan } from '../engine/plan';
import type { Insight, InsightTopic, Severity } from '../engine/insights';
import type { YearRecord } from '../engine/simulate';

interface WhatIf {
  retireDelta: number;
  expenseFactor: number;
  stockShare: number | null;
}

function applyWhatIf(plan: Plan, w: WhatIf): Plan {
  if (w.retireDelta === 0 && w.expenseFactor === 1 && w.stockShare === null) return plan;
  return {
    ...plan,
    persons: plan.persons.map((p) => {
      const r = Math.max(58, Math.min(70, p.retirementAge + w.retireDelta));
      return { ...p, retirementAge: r, ahvClaimAge: Math.max(63, Math.min(70, p.ahvClaimAge + (r > 65 ? r - Math.max(65, p.retirementAge) : 0))) };
    }),
    expenses: plan.expenses.map((e) => ({ ...e, amount: Math.round(e.amount * w.expenseFactor) })),
    portfolio: { ...plan.portfolio, stockShare: w.stockShare ?? plan.portfolio.stockShare }
  };
}

const SEVERITY_LABEL: Record<Severity, string> = { gut: 'Gut', hinweis: 'Beachten', warnung: 'Handeln' };
const TOPIC_LABEL: Record<InsightTopic, string> = { vorsorge: 'Vorsorge', steuern: 'Steuern', wohnen: 'Wohnen', vermoegen: 'Vermögen', familie: 'Familie', ahv: 'AHV' };

function SeverityIcon({ s }: { s: Severity }) {
  if (s === 'gut') return <CheckCircle2 size={15} aria-hidden="true" />;
  if (s === 'hinweis') return <CircleAlert size={15} aria-hidden="true" />;
  return <AlertTriangle size={15} aria-hidden="true" />;
}

export function CheckPage() {
  const { plan, started } = useAppState();
  const [w, setW] = useState<WhatIf>({ retireDelta: 0, expenseFactor: 1, stockShare: null });
  const [view, setView] = useState<'total' | 'liquid'>('liquid');
  const derived = useMemo(() => applyWhatIf(plan, w), [plan, w]);
  const { result, capacity, loading, error } = useSimulation(plan.location ? derived : null, { withCapacity: true });
  const whatIfActive = w.retireDelta !== 0 || w.expenseFactor !== 1 || w.stockShare !== null;

  if (!started || !plan.location) {
    return (
      <div className="empty-state ae-surface ae-surface--paper">
        <h1 className="display">Zuerst ein paar Angaben</h1>
        <p>Für den Ist-Check braucht der Finanzkompass mindestens deinen Wohnort, dein Alter und deinen Lohn.</p>
        <a className="btn" href={href('plan/haushalt')}>
          Plan erfassen
        </a>
      </div>
    );
  }
  if (error && !result) {
    return (
      <div className="panel">
        <h2>Die Berechnung hat nicht geklappt</h2>
        <p>{error}</p>
        <a className="btn btn-secondary" href={href('plan/haushalt')}>
          Angaben prüfen
        </a>
      </div>
    );
  }
  if (!result) {
    return (
      <div className="panel" aria-busy="true">
        <h2 style={{ marginBottom: 12 }}>Tausend Zukünfte werden gerechnet …</h2>
        <div className="spinner-line" />
        <p className="muted" style={{ marginTop: 12 }}>
          Für jedes Jahr bis Alter {plan.assumptions.endAge}: Lohn, Renten, Steuern deiner Gemeinde, Börsen und Teuerung.
        </p>
      </div>
    );
  }

  const { mc, insights, taxes, snapshot } = result;
  const p1 = derived.persons[0];
  const recs = mc.expected.records;
  const retireYear = Math.min(...derived.persons.map((p) => p.birthYear + p.retirementAge));
  const retireIdx = mc.years.indexOf(retireYear);
  const band = view === 'liquid' ? mc.liquid : mc.netWorth;
  const atRetire = retireIdx >= 0 ? band.p50[retireIdx] : 0;
  const success = mc.successRate;
  const verdict =
    success >= 0.9 ? 'Du bist gut unterwegs.' : success >= 0.7 ? 'Du bist auf Kurs – mit wenig Reserve.' : 'Dein Plan braucht Anpassungen.';
  const meterColor = success >= 0.9 ? 'var(--good)' : success >= 0.7 ? 'var(--note)' : 'var(--warn)';
  const survival85 = mc.survival[mc.years.indexOf(p1.birthYear + 85)] ?? mc.survival[mc.survival.length - 1];
  const ageNow = derived.startYear - p1.birthYear;
  const alreadyRetired = retireYear <= derived.startYear;
  const in10 = Math.min(mc.years.length - 1, 10);

  const milestones: Milestone[] = [
    ...derived.events.map((e) => ({ year: e.year, label: EVENT_LABELS[e.type] })),
    ...derived.persons
      .filter((p) => p.birthYear + p.retirementAge !== retireYear)
      .map((p) => ({ year: p.birthYear + p.retirementAge, label: `Pensionierung ${p.name}` }))
  ];
  const ageLabel = derived.persons.length > 1 ? `Alter von ${p1.name}` : 'Alter';

  return (
    <div className={loading ? 'loading' : undefined}>
      <section className="verdict ae-surface ae-surface--paper">
        <div>
          <h1 className="display">{verdict}</h1>
          <p className="lede">
            In {Math.round(success * mc.simulations).toLocaleString('de-CH')} von {mc.simulations.toLocaleString('de-CH')} simulierten Zukünften reicht
            dein Geld bis Alter {derived.assumptions.endAge}.{' '}
            {alreadyRetired
              ? `Im mittleren Szenario sind mit ${ageNow + in10} noch rund ${chf(mc.liquid.p50[in10])} frei verfügbar.`
              : `Im mittleren Szenario ${view === 'liquid' ? 'sind' : 'beträgt dein Gesamtvermögen'} bei der Pensionierung ${view === 'liquid' ? `rund ${chf(mc.retirement.liquidP50)} frei verfügbar` : `rund ${chf(atRetire)}`}.`}
          </p>
          <div className="meter" role="img" aria-label={`Erfolgswahrscheinlichkeit ${pct(success)}`}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="small" style={{ fontWeight: 700 }}>
                Wahrscheinlichkeit, dass das Geld reicht
              </span>
              <span className="num" style={{ fontSize: '1.6rem' }}>
                {pct(success)}
              </span>
            </div>
            <div className="meter-track">
              <div className="meter-fill" style={{ width: `${success * 100}%`, background: meterColor }} />
            </div>
            <div className="meter-scale">
              <span>0 %</span>
              <span>70 %</span>
              <span>90 %</span>
              <span>100 %</span>
            </div>
          </div>
          {whatIfActive && (
            <p className="small" style={{ marginTop: 12, color: 'var(--note)', fontWeight: 600 }}>
              Gezeigt wird das «Was wäre wenn» von unten – dein gespeicherter Plan ist unverändert.
            </p>
          )}
        </div>
        <Signpost
          label="Wegweiser zu deinem Plan"
          here={{ label: derived.location?.name ?? '', value: `Alter ${derived.startYear - p1.birthYear}` }}
          signs={[
            alreadyRetired
              ? { label: `Alter ${ageNow + in10}`, time: `${in10} Jahre`, sub: `frei verfügbar ca. ${chfShort(mc.liquid.p50[in10])}` }
              : { label: `Pension ${retireYear}`, time: `${retireYear - derived.startYear} Jahre`, sub: `frei verfügbar ca. ${chfShort(mc.retirement.liquidP50)}` },
            { label: `Alter 85`, time: pct(survival85), sub: 'Geld reicht' },
            { label: `Alter ${derived.assumptions.endAge}`, time: pct(success), sub: 'Geld reicht' }
          ]}
        />
      </section>

      <section className="kpis" aria-label="Kennzahlen">
        <div className="kpi">
          <div className="label">Renten ab {snapshot ? snapshot.year : retireYear}</div>
          <div className="value">{snapshot ? chf(snapshot.pensions / 12) : '–'}</div>
          <div className="sub">pro Monat, AHV und PK</div>
        </div>
        <div className="kpi">
          <div className="label">{snapshot && snapshot.gapYearly > 0 ? 'Lücke im Ruhestand' : 'Überschuss im Ruhestand'}</div>
          <div className="value">{snapshot ? chf(Math.abs(snapshot.gapYearly) / 12) : '–'}</div>
          <div className="sub">pro Monat, {snapshot && snapshot.gapYearly > 0 ? 'aus dem Vermögen' : 'Renten über Ausgaben'}</div>
        </div>
        <div className="kpi">
          <div className="label">Steuern heute</div>
          <div className="value">{chf(taxes.total)}</div>
          <div className="sub">Grenzsteuersatz {pct(taxes.marginalRate)}</div>
        </div>
        <div className="kpi">
          <div className="label">Spielraum bei 85 % Sicherheit</div>
          <div className="value">{capacity === null ? '…' : `${capacity >= 0 ? '+' : '−'}${chf(Math.abs(capacity) / 12)}`}</div>
          <div className="sub">{capacity === null ? 'wird berechnet' : capacity >= 0 ? 'pro Monat mehr ausgeben möglich' : 'pro Monat weniger ausgeben nötig'}</div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <div className="panel-head">
          <div>
            <h2>Höhenprofil deines Vermögens</h2>
            <p>Wie sich dein Vermögen in heutigen Franken entwickeln kann – von schlechten bis zu guten Börsenjahren.</p>
          </div>
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'liquid', label: 'Frei verfügbar' },
              { value: 'total', label: 'Gesamtvermögen' }
            ]}
          />
        </div>
        <WealthProfile
          title={`Vermögen ${view === 'liquid' ? 'frei verfügbar' : 'gesamt'} nach Alter, Bandbreite aus ${mc.simulations} Simulationen`}
          years={mc.years}
          birthYear={p1.birthYear}
          bands={band}
          milestones={milestones}
          retirementYear={alreadyRetired ? undefined : retireYear}
          ageLabel={ageLabel}
        />
        <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
          {view === 'liquid'
            ? 'Frei verfügbar: Konten und Wertschriften, ohne Pensionskasse, Säule 3a und Immobilie. Fällt die Linie unter null, reicht das Geld nicht mehr.'
            : 'Gesamtvermögen: inklusive Pensionskasse, Säule 3a und Immobilie abzüglich Hypothek. Bei der Pensionierung sinkt es, wenn das PK-Guthaben in eine Rente umgewandelt wird.'}
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Was wäre wenn?</h2>
            <p>Schieb an den Reglern und sieh sofort, wie sich die Chancen verändern.</p>
          </div>
          {whatIfActive && (
            <div className="row">
              <button className="btn btn-quiet btn-small" onClick={() => setW({ retireDelta: 0, expenseFactor: 1, stockShare: null })}>
                Zurücksetzen
              </button>
              <button
                className="btn btn-small"
                onClick={() => {
                  updatePlan(() => derived);
                  setW({ retireDelta: 0, expenseFactor: 1, stockShare: null });
                }}
              >
                In den Plan übernehmen
              </button>
            </div>
          )}
        </div>
        <div className="whatif">
          <RangeField
            label="Pensionierung"
            value={w.retireDelta}
            min={-5}
            max={3}
            onChange={(v) => setW({ ...w, retireDelta: v })}
            format={(v) => (v === 0 ? 'wie geplant' : `${v > 0 ? '+' : ''}${v} J.`)}
            hint={`${derived.persons.map((p) => `${p.name}: mit ${p.retirementAge}`).join(', ')}`}
          />
          <RangeField label="Ausgaben" value={Math.round(w.expenseFactor * 100)} min={70} max={130} step={5} onChange={(v) => setW({ ...w, expenseFactor: v / 100 })} format={(v) => `${v} %`} hint="aller erfassten Ausgaben" />
          <RangeField
            label="Aktienanteil"
            value={Math.round((w.stockShare ?? plan.portfolio.stockShare) * 100)}
            min={0}
            max={100}
            step={5}
            onChange={(v) => setW({ ...w, stockShare: v / 100 })}
            format={(v) => `${v} %`}
            hint="des freien Vermögens"
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Woher das Geld kommt</h2>
            <p>Einkommen und Ausgaben pro Jahr im mittleren Szenario. Wo die Ausgaben über den Einnahmen liegen, wird Vermögen verbraucht.</p>
          </div>
        </div>
        <IncomeChart records={recs} birthYear={p1.birthYear} ageLabel={ageLabel} />
      </section>

      <section style={{ marginTop: 32 }}>
        <h2 style={{ marginBottom: 6 }}>Was dir auffallen sollte</h2>
        <p className="muted" style={{ marginBottom: 18 }}>
          Hinweise aus deinem Plan. Sie sind allgemein formuliert und ersetzen keine persönliche Beratung.
        </p>
        <div className="insights">
          {sortInsights(insights).map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 28 }}>
        <div className="panel-head">
          <div>
            <h2>Steuern {derived.startYear}</h2>
            <p>
              {derived.location?.name}, {derived.relationship === 'm' ? 'verheiratet' : derived.relationship === 'c' ? 'Konkubinat (zwei Steuererklärungen)' : 'alleinstehend'}. Berechnet mit den Tarifen der ESTV.
            </p>
          </div>
        </div>
        <TaxTable result={taxes.result} result2={taxes.result2} />
      </section>

      <section className="panel">
        <details className="disclosure">
          <summary>
            <h3 style={{ display: 'inline' }}>Jahr für Jahr</h3>
            <span className="muted small" style={{ fontWeight: 400 }}>
              mittleres Szenario, heutige Franken
            </span>
          </summary>
          <div style={{ marginTop: 16 }}>
            <div className="row no-print" style={{ marginBottom: 12 }}>
              <button className="btn btn-secondary btn-small" onClick={() => downloadCsv(recs, derived)}>
                <Download size={16} /> Als CSV herunterladen
              </button>
              <button className="btn btn-secondary btn-small" onClick={() => window.print()}>
                <Printer size={16} /> Drucken
              </button>
            </div>
            <YearTable records={recs} plan={derived} />
          </div>
        </details>
      </section>
    </div>
  );
}

function sortInsights(list: Insight[]): Insight[] {
  const order: Record<Severity, number> = { warnung: 0, hinweis: 1, gut: 2 };
  return [...list].sort((a, b) => order[a.severity] - order[b.severity]);
}

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <article className="insight">
      <div className="insight-top">
        <span className={`status status--${insight.severity}`}>
          <SeverityIcon s={insight.severity} />
          {SEVERITY_LABEL[insight.severity]}
        </span>
        <span className="insight-topic">{TOPIC_LABEL[insight.topic]}</span>
      </div>
      <h4>{insight.title}</h4>
      <p>{insight.text}</p>
      {insight.amount !== undefined && insight.amount > 0 && (
        <div className="insight-amount">
          <span className="num">{chf(insight.amount)}</span>
          <span>{insight.amountLabel}</span>
        </div>
      )}
    </article>
  );
}

function TaxTable({ result, result2 }: { result: import('../engine/tax/types').TaxResult; result2?: import('../engine/tax/types').TaxResult }) {
  const rows = [result, result2].filter(Boolean) as import('../engine/tax/types').TaxResult[];
  const sum = (k: keyof import('../engine/tax/types').TaxResult) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const items: [string, number][] = [
    ['Direkte Bundessteuer', sum('incomeBund')],
    ['Kantonssteuer Einkommen', sum('incomeCanton')],
    ['Gemeindesteuer Einkommen', sum('incomeCity')],
    ['Kirchensteuer', sum('incomeChurch') + sum('fortuneChurch')],
    ['Vermögenssteuer Kanton und Gemeinde', sum('fortuneCanton') + sum('fortuneCity')],
    ['Personal- oder Kopfsteuer', sum('personnel')]
  ];
  return (
    <div className="grid-2">
      <table className="data wrap" style={{ fontSize: '0.95rem' }}>
        <tbody>
          {items
            .filter(([, v]) => v > 0)
            .map(([label, v]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{chf(v)}</td>
              </tr>
            ))}
          <tr>
            <td style={{ fontWeight: 700 }}>Total</td>
            <td style={{ fontWeight: 700 }}>{chf(sum('total'))}</td>
          </tr>
        </tbody>
      </table>
      <div className="small muted">
        <p>
          Steuerbares Einkommen Bund {chf(sum('taxableIncomeBund'))}, Kanton {chf(sum('taxableIncomeCanton'))}. Steuerbares Vermögen{' '}
          {chf(sum('taxableFortune'))}.
        </p>
        <p>
          Berücksichtigt sind die üblichen Pauschalabzüge (Berufskosten, Versicherungsprämien, Verpflegung), Fahrkosten, Säule 3a,
          Kinder- und Betreuungsabzüge, Schuldzinsen und Eigenmietwert. Individuelle Abzüge wie Weiterbildung, Spenden oder
          Krankheitskosten fehlen – die tatsächliche Rechnung kann tiefer sein.
        </p>
      </div>
    </div>
  );
}

function YearTable({ records, plan }: { records: YearRecord[]; plan: Plan }) {
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th scope="col">Jahr (Alter)</th>
            <th scope="col">Nettolohn</th>
            <th scope="col">AHV</th>
            <th scope="col">PK-Rente</th>
            <th scope="col">Ausgaben</th>
            <th scope="col">Steuern</th>
            <th scope="col">Sparen</th>
            <th scope="col">Frei verfügbar</th>
            <th scope="col">PK</th>
            <th scope="col">Säule 3a</th>
            <th scope="col">Immobilie netto</th>
            <th scope="col">Gesamt</th>
            <th scope="col" style={{ textAlign: 'left' }}>
              Ereignisse
            </th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.year} className={r.retired.every(Boolean) ? 'retired' : undefined}>
              <td>
                {r.year} ({r.ages.join('/')})
              </td>
              <td>{fmt(r.netSalary + r.allowances)}</td>
              <td>{fmt(r.ahv)}</td>
              <td>{fmt(r.pkPension)}</td>
              <td>{fmt(r.expenses + r.housing + r.children)}</td>
              <td>{fmt(r.taxTotal)}</td>
              <td className={r.savings < 0 ? 'neg' : undefined}>{fmt(r.savings)}</td>
              <td className={r.liquid < 0 ? 'neg' : undefined}>{fmt(r.liquid)}</td>
              <td>{fmt(r.pk)}</td>
              <td>{fmt(r.p3a)}</td>
              <td>{fmt(r.propertyValue - r.mortgage)}</td>
              <td>{fmt(r.netWorth)}</td>
              <td className="ev">{r.events.join('; ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="visually-hidden">Personen: {plan.persons.map((p) => p.name).join(' und ')}</p>
    </div>
  );
}

const fmt = (v: number) => (Math.abs(v) < 0.5 ? '–' : Math.round(v).toLocaleString('de-CH'));

function downloadCsv(records: YearRecord[], plan: Plan) {
  const head = ['Jahr', 'Alter', 'Bruttolohn', 'Nettolohn', 'Kinderzulagen', 'AHV', 'PK-Rente', 'Kapitalbezuege', 'Ausgaben', 'Wohnkosten', 'Kinderkosten', 'Einkommenssteuer', 'Vermoegenssteuer', 'Kapitalbezugssteuer', 'Saeule3a-Einzahlung', 'PK-Einkauf', 'AHV-Nichterwerbstaetige', 'Sparen', 'Konto', 'Wertschriften', 'Saeule3a', 'PK', 'Immobilienwert', 'Hypothek', 'Gesamtvermoegen', 'Ereignisse'];
  const lines = records.map((r) =>
    [r.year, r.ages.join('/'), r.grossSalary, r.netSalary, r.allowances, r.ahv, r.pkPension, r.capitalWithdrawals, r.expenses, r.housing, r.children, r.taxIncome, r.taxWealth, r.taxCapital, r.p3aContributions, r.pkBuyIns, r.ahvNonEmployed, r.savings, r.cash, r.securities, r.p3a, r.pk, r.propertyValue, r.mortgage, r.netWorth]
      .map((v) => (typeof v === 'number' ? Math.round(v) : `"${v}"`))
      .concat([`"${r.events.join('; ').replace(/"/g, "'")}"`])
      .join(';')
  );
  const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finanzplan-${plan.id}-jahre.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

