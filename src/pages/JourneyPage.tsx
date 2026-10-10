import { useMemo, useState } from 'react';
import { RotateCcw, Shuffle, Undo2 } from 'lucide-react';
import { useAppState, setJourney, replacePlan } from '../lib/store';
import { useTaxContext } from '../lib/useTax';
import { useSimulation } from '../lib/useSimulation';
import { href } from '../lib/router';
import { chf, chfShort, pct } from '../lib/format';
import { WealthProfile } from '../components/charts/WealthProfile';
import { applyDecisions, decide, newJourneySeed, nextStep, type Card, type JourneyState } from '../engine/journey';
import type { Plan } from '../engine/plan';
import type { TaxContext } from '../engine/tax/types';
import { niceDomain } from '../components/charts/util';

export function JourneyPage() {
  const { plan, journey, started } = useAppState();
  const { ctx, error } = useTaxContext(plan.location);

  if (!started || !plan.location) {
    return (
      <div className="panel" style={{ maxWidth: 680 }}>
        <h1 style={{ fontSize: '2.4rem', marginBottom: 12 }}>Erst der Plan, dann die Reise</h1>
        <p>Die Lebenssimulation startet bei deiner heutigen Situation. Erfasse zuerst Wohnort, Alter, Lohn und Vorsorge.</p>
        <a className="btn" href={href('plan/haushalt')}>
          Plan erfassen
        </a>
      </div>
    );
  }
  if (error) return <div className="panel">{error}</div>;
  if (!ctx) return <div className="panel"><div className="spinner-line" /></div>;
  if (!journey) return <JourneyIntro onStart={() => setJourney({ seed: newJourneySeed(), decisions: [] })} />;
  return <JourneyRun plan={plan} ctx={ctx} journey={journey} />;
}

function JourneyIntro({ onStart }: { onStart: () => void }) {
  return (
    <div className="journey" style={{ alignItems: 'center' }}>
      <div>
        <h1 style={{ marginBottom: 14 }}>Lebenssimulation</h1>
        <p className="lede" style={{ fontSize: '1.15rem', color: 'var(--ink-2)' }}>
          Du startest heute mit deinem Plan. Dann läuft die Zeit: Die Börse schwankt zufällig, das Leben stellt Fragen. An jeder
          Wegmarke entscheidest du – vom Hauskauf über den Einkauf in die Pensionskasse bis zur Frage Rente oder Kapital.
        </p>
        <p className="muted">
          Bei jedem Entscheid siehst du, welche Steuern betroffen sind: Handänderungs-, Kapitalleistungs-, Erbschafts- oder
          Grundstückgewinnsteuer. Am Schluss bekommst du einen Lebensauszug mit allen Entscheiden und ihrer Wirkung.
        </p>
        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn" onClick={onStart}>
            Simulation starten
          </button>
          <span className="muted small">Dauer etwa 10 bis 15 Minuten</span>
        </div>
      </div>
      <ol className="timeline" aria-label="Etappen">
        {[
          ['Start', 'Säule 3a und Anlagestrategie'],
          ['Erwerbsleben', 'Karriere, Familie, Eigenheim, Börsenkrisen'],
          ['Vor der Pension', 'PK-Einkauf, 3a staffeln, Pensum, Zeitpunkt'],
          ['Pensionierung', 'Rente oder Kapital, AHV-Bezug, Hypothek'],
          ['Ruhestand', 'Ausgaben, Schenkungen, Wohnen im Alter']
        ].map(([t, d], i) => (
          <li key={t}>
            <div className="tl-year">
              {i + 1}
              <small>Etappe</small>
            </div>
            <div className="tl-dot" />
            <div className="tl-body">
              <h4>{t}</h4>
              <p className="muted small" style={{ margin: 0 }}>
                {d}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function JourneyRun({ plan, ctx, journey }: { plan: Plan; ctx: TaxContext; journey: JourneyState }) {
  const step = useMemo(() => nextStep(plan, ctx, journey), [plan, ctx, journey]);
  const [busy, setBusy] = useState(false);
  const p1 = plan.persons[0];
  const years = step.records.map((r) => r.year);
  const liquid = step.records.map((r) => r.liquid);
  const domain = useMemo(() => niceDomain(Math.min(0, ...liquid), Math.max(...liquid) * 1.08 || 100000), [liquid]);

  if (!step.card) return <JourneySummary plan={plan} ctx={ctx} journey={journey} />;
  const card = step.card;
  const age = card.year - p1.birthYear;
  const start = plan.startYear;
  const end = years[years.length - 1];
  const progress = (card.year - start) / Math.max(1, end - start);
  const prevRec = step.records.find((r) => r.year === card.year - 1);
  const today = (() => {
    const pf = step.plan.portfolio;
    const prop = step.plan.property;
    const liquidNow = pf.cash + pf.securities;
    const total =
      liquidNow +
      step.plan.persons.reduce((s, p) => s + p.pkBalance + p.p3aBalance, 0) +
      (prop ? prop.value - prop.mortgages.reduce((s, m) => s + m.amount, 0) : 0) -
      pf.otherDebts;
    return { liquid: liquidNow, netWorth: total };
  })();
  const recNow = prevRec ?? today;

  const choose = (optionId: string) => {
    const opt = card.options.find((o) => o.id === optionId);
    if (!opt || busy) return;
    setBusy(true);
    // Rechnen im nächsten Frame, damit der Klick sofort sichtbar wird
    requestAnimationFrame(() => {
      setJourney(decide(plan, ctx, journey, card, opt));
      setBusy(false);
    });
  };

  return (
    <div className="journey">
      <div className="journey-stage">
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="chapter-label">{card.chapter}</span>
          <span className="spacer" />
          <button className="btn btn-quiet btn-small" disabled={!journey.decisions.length} onClick={() => setJourney({ ...journey, decisions: journey.decisions.slice(0, -1) })}>
            <Undo2 size={16} /> Zurück
          </button>
          <button
            className="btn btn-quiet btn-small"
            onClick={() => {
              if (confirm('Simulation neu beginnen? Deine Entscheide gehen verloren.')) setJourney({ seed: newJourneySeed(), decisions: [] });
            }}
          >
            <RotateCcw size={16} /> Neu
          </button>
        </div>
        <h1 style={{ fontSize: 'clamp(2rem, 4vw, 2.8rem)' }}>
          {card.year}: {plan.persons.length > 1 ? `${p1.name} ist ${age}` : `du bist ${age}`}
        </h1>
        <div className="journey-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Fortschritt im Leben">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} className={i / 24 < progress - 1 / 24 ? 'done' : i / 24 <= progress ? 'now' : undefined} />
          ))}
        </div>
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="row" style={{ marginBottom: 8, gap: 24 }}>
            <div>
              <div className="small muted">Frei verfügbar</div>
              <div className="num" style={{ fontSize: '1.8rem' }}>
                {chf(recNow.liquid)}
              </div>
            </div>
            <div>
              <div className="small muted">Gesamtvermögen</div>
              <div className="num" style={{ fontSize: '1.8rem' }}>
                {chf(recNow.netWorth)}
              </div>
            </div>
          </div>
          <WealthProfile
            title="Dein bisheriger Lebenspfad: frei verfügbares Vermögen"
            years={years}
            birthYear={p1.birthYear}
            path={liquid}
            pathUntil={Math.max(start, card.year - 1)}
            pathLabel="Frei verfügbar"
            retirementYear={Math.min(...step.plan.persons.map((p) => p.birthYear + p.retirementAge))}
            fixedDomain={domain}
            height={300}
            ageLabel={plan.persons.length > 1 ? `Alter von ${p1.name}` : 'Alter'}
          />
        </div>
        {journey.decisions.length > 0 && (
          <p className="small muted" style={{ marginTop: 10 }}>
            Bisher {journey.decisions.length} Entscheide. Zuletzt: {journey.decisions[journey.decisions.length - 1].optionLabel}.
          </p>
        )}
      </div>

      <JourneyCard card={card} busy={busy} onChoose={choose} />
    </div>
  );
}

function JourneyCard({ card, busy, onChoose }: { card: Card; busy: boolean; onChoose: (id: string) => void }) {
  return (
    <article className="card" aria-live="polite" aria-busy={busy}>
      <div className="card-head">
        <div className="card-year">
          <span className="num">{card.year}</span>
          <span className={`status ${card.kind === 'ereignis' ? 'status--hinweis' : 'status--gut'}`}>{card.kind === 'ereignis' ? 'Ereignis' : 'Entscheid'}</span>
        </div>
        <h2 style={{ fontSize: '1.8rem' }}>{card.title}</h2>
      </div>
      <div className="card-body">
        <p>{card.story}</p>
        {card.facts.length > 0 && (
          <div className="facts">
            {card.facts.map((f) => (
              <div className="fact" key={f.label}>
                <div className="label">{f.label}</div>
                <div className="value">{f.value}</div>
              </div>
            ))}
          </div>
        )}
        {card.taxNote && (
          <div className="tax-note">
            <strong>{card.taxNote.title}</strong>
            {card.taxNote.text}
          </div>
        )}
        <div className="options" role="group" aria-label="Deine Wahl">
          {card.options.map((o) => (
            <button key={o.id} className="option" disabled={busy} onClick={() => onChoose(o.id)}>
              <strong>
                {o.label} {o.current && <span className="current-tag">(bisher)</span>}
              </strong>
              <span>{o.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function JourneySummary({ plan, ctx, journey }: { plan: Plan; ctx: TaxContext; journey: JourneyState }) {
  const finalPlan = useMemo(() => applyDecisions(plan, journey.decisions), [plan, journey]);
  const step = useMemo(() => nextStep(plan, ctx, journey), [plan, ctx, journey]);
  const base = useSimulation(plan, { channel: 'journey-base' });
  const fin = useSimulation(finalPlan, { channel: 'journey-final' });
  const p1 = plan.persons[0];
  const recs = step.records;
  const retireYear = Math.min(...finalPlan.persons.map((p) => p.birthYear + p.retirementAge));
  const atRetire = recs.find((r) => r.year === retireYear);
  const last = recs[recs.length - 1];
  const totalTax = recs.reduce((s, r) => s + r.taxTotal, 0);
  const capTax = recs.reduce((s, r) => s + r.taxCapital, 0);
  const crashes = recs.filter((_, i) => step.market[i]?.stock < -0.15).map((r, i) => ({ year: r.year, i }));
  const failed = recs.find((r) => r.shortfall > 1000);

  return (
    <div>
      <div className="page-head">
        <h1>Dein Lebensauszug</h1>
        <p className="lede">
          {journey.decisions.length} Entscheide, ein zufälliger Börsenverlauf mit {crashes.length} {crashes.length === 1 ? 'grossen Einbruch' : 'grossen Einbrüchen'}.
          {failed ? ` Auf diesem Pfad war das frei verfügbare Geld ${failed.year} mit ${failed.year - p1.birthYear} aufgebraucht.` : ` Auf diesem Pfad hat das Geld bis ${plan.assumptions.endAge} gereicht.`}
        </p>
        <div className="row no-print">
          <button
            className="btn"
            onClick={() => {
              if (confirm('Die Entscheide in deinen Plan übernehmen? Der Plan wird damit geändert und die Simulation zurückgesetzt.')) {
                replacePlan(finalPlan, null);
              }
            }}
          >
            Entscheide in meinen Plan übernehmen
          </button>
          <button className="btn btn-secondary" onClick={() => setJourney({ seed: newJourneySeed(), decisions: [] })}>
            <Shuffle size={16} /> Neues Leben, neue Börse
          </button>
          <button className="btn btn-secondary" onClick={() => setJourney({ seed: journey.seed, decisions: [] })}>
            <RotateCcw size={16} /> Gleiche Börse, andere Entscheide
          </button>
        </div>
      </div>

      <section className="kpis" aria-label="Ergebnis">
        <div className="kpi">
          <div className="label">Frei verfügbar bei Pension</div>
          <div className="value">{atRetire ? chfShort(atRetire.liquid) : '–'}</div>
          <div className="sub">{retireYear}, auf deinem Pfad</div>
        </div>
        <div className="kpi">
          <div className="label">Vermögen mit {plan.assumptions.endAge}</div>
          <div className="value">{chfShort(last.netWorth)}</div>
          <div className="sub">gesamt, heutige Franken</div>
        </div>
        <div className="kpi">
          <div className="label">Steuern im ganzen Leben</div>
          <div className="value">{chfShort(totalTax)}</div>
          <div className="sub">davon Kapitalbezüge {chfShort(capTax)}</div>
        </div>
        <div className="kpi">
          <div className="label">Geld reicht bis {plan.assumptions.endAge}</div>
          <div className="value">{fin.result ? pct(fin.result.mc.successRate) : '…'}</div>
          <div className="sub">{base.result ? `ohne deine Entscheide ${pct(base.result.mc.successRate)}` : 'in 1000 Zukünften'}</div>
        </div>
      </section>

      <section className="panel" style={{ marginTop: 24 }}>
        <div className="panel-head">
          <div>
            <h2>Dein Pfad – einer von tausend</h2>
            <p>Die schwarze Linie ist dein Leben mit dieser Börse. Die Fläche zeigt, wie es mit denselben Entscheiden in anderen Zukünften hätte laufen können.</p>
          </div>
        </div>
        <WealthProfile
          title="Lebenspfad und Bandbreite, frei verfügbares Vermögen"
          years={recs.map((r) => r.year)}
          birthYear={p1.birthYear}
          bands={fin.result?.mc.liquid}
          path={recs.map((r) => r.liquid)}
          pathLabel="Dein Pfad"
          retirementYear={retireYear}
          milestones={journey.decisions.filter((d) => d.optionId !== 'keep' && d.optionId !== 'hold' && d.optionId !== 'stay' && d.optionId !== 'none' && d.optionId !== 'no' && d.optionId !== 'rent').map((d) => ({ year: d.year, label: `${d.title}: ${d.optionLabel}` }))}
          ageLabel={plan.persons.length > 1 ? `Alter von ${p1.name}` : 'Alter'}
        />
      </section>

      <section className="panel">
        <h2 style={{ marginBottom: 6 }}>Deine Entscheide</h2>
        <p className="muted" style={{ marginBottom: 20 }}>
          Die Wirkung ist auf deinem Pfad gemessen: Vermögen mit {plan.assumptions.endAge} und Steuern über das ganze Leben, verglichen mit der anderen Wahl «so lassen».
        </p>
        <ol className="timeline">
          {journey.decisions.map((d, i) => (
            <li key={`${d.cardId}-${i}`}>
              <div className="tl-year">
                {d.year}
                <small>Alter {d.year - p1.birthYear}</small>
              </div>
              <div className="tl-dot" />
              <div className="tl-body">
                <h4>{d.title}</h4>
                <p className="tl-choice">{d.optionLabel}</p>
                <p className="small muted" style={{ margin: '0 0 6px' }}>
                  {d.detail}
                </p>
                {d.effect && (Math.abs(d.effect.endNetWorth) > 500 || Math.abs(d.effect.taxes) > 500) && (
                  <div className="tl-effect">
                    <span>
                      Vermögen mit {plan.assumptions.endAge}: <strong>{signed(d.effect.endNetWorth)}</strong>
                    </span>
                    <span>
                      Steuern im Leben: <strong>{signed(d.effect.taxes)}</strong>
                    </span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {crashes.length > 0 && (
        <section className="panel">
          <h3 style={{ marginBottom: 8 }}>Was die Börse auf deinem Pfad gemacht hat</h3>
          <p className="muted" style={{ margin: 0 }}>
            Grosse Einbrüche: {crashes.map((c) => `${c.year} (${pct(step.market[recs.findIndex((r) => r.year === c.year)].stock)})`).join(', ')}. Ein neuer Durchgang würfelt einen anderen Verlauf –
            spannend ist, ob deine Entscheide auch dann tragen.
          </p>
        </section>
      )}
    </div>
  );
}

const signed = (v: number) => `${v >= 0 ? '+' : '−'}${chf(Math.abs(v))}`;
