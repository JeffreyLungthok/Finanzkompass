import { useMemo } from 'react';
import { href, navigate } from '../lib/router';
import { usePlan } from '../lib/store';
import { useTaxContext } from '../lib/useTax';
import { currentSpending, currentTaxes } from '../engine/taxHelpers';
import { chf, pct } from '../lib/format';
import { StepHousehold } from './plan/StepHousehold';
import { StepIncome } from './plan/StepIncome';
import { StepPension } from './plan/StepPension';
import { StepAssets } from './plan/StepAssets';
import { StepExpenses } from './plan/StepExpenses';
import { StepEvents } from './plan/StepEvents';
import { StepAssumptions } from './plan/StepAssumptions';
import type { Plan } from '../engine/plan';
import type { TaxContext } from '../engine/tax/types';
import { PARAMS } from '../engine/params';

export const STEPS = [
  { id: 'haushalt', label: 'Haushalt & Wohnort' },
  { id: 'einkommen', label: 'Einkommen' },
  { id: 'vorsorge', label: 'AHV, PK & 3a' },
  { id: 'vermoegen', label: 'Vermögen & Wohnen' },
  { id: 'ausgaben', label: 'Ausgaben' },
  { id: 'ereignisse', label: 'Lebensereignisse' },
  { id: 'annahmen', label: 'Annahmen' }
] as const;

export function PlanEditor({ step }: { step: string }) {
  const plan = usePlan();
  const { ctx } = useTaxContext(plan.location);
  const index = Math.max(0, STEPS.findIndex((s) => s.id === step));
  const current = STEPS[index];

  return (
    <div className="editor">
      <nav aria-label="Schritte">
        <ol className="route">
          {STEPS.map((s, i) => (
            <li key={s.id} className={i < index ? 'done' : undefined}>
              <a href={href(`plan/${s.id}`)} aria-current={i === index ? 'step' : undefined}>
                <span className="dot" aria-hidden="true" />
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <section className="panel" aria-labelledby="step-title">
        <h2 id="step-title" style={{ marginBottom: 6 }}>
          {current.label}
        </h2>
        {current.id === 'haushalt' && <StepHousehold ctx={ctx} />}
        {current.id === 'einkommen' && <StepIncome ctx={ctx} />}
        {current.id === 'vorsorge' && <StepPension ctx={ctx} />}
        {current.id === 'vermoegen' && <StepAssets />}
        {current.id === 'ausgaben' && <StepExpenses ctx={ctx} />}
        {current.id === 'ereignisse' && <StepEvents ctx={ctx} />}
        {current.id === 'annahmen' && <StepAssumptions />}

        <div className="step-nav">
          {index > 0 ? (
            <a className="btn btn-secondary" href={href(`plan/${STEPS[index - 1].id}`)}>
              Zurück
            </a>
          ) : (
            <span />
          )}
          {index < STEPS.length - 1 ? (
            <a className="btn" href={href(`plan/${STEPS[index + 1].id}`)}>
              Weiter zu {STEPS[index + 1].label}
            </a>
          ) : (
            <button className="btn" onClick={() => navigate('check')} disabled={!plan.location}>
              Ist-Check rechnen
            </button>
          )}
        </div>
      </section>

      <LiveSummary plan={plan} ctx={ctx} />
    </div>
  );
}

function LiveSummary({ plan, ctx }: { plan: Plan; ctx: TaxContext | null }) {
  const data = useMemo(() => {
    if (!ctx) return null;
    try {
      const t = currentTaxes(plan, ctx);
      const spending = currentSpending(plan);
      const p3a = plan.persons.reduce((s, p) => {
        const working = plan.startYear - p.birthYear < p.retirementAge && p.grossSalary > 0;
        const max = p.hasPensionFund ? PARAMS.pillar3a.maxWithPensionFund : PARAMS.pillar3a.maxWithoutPensionFund;
        return s + (working ? Math.min(max, p.p3aContribution) : 0);
      }, 0);
      const kids = plan.children.filter((c) => plan.startYear - c.birthYear >= 0 && plan.startYear - c.birthYear < 25).length;
      const allowances = kids * PARAMS.familyAllowance.childMonthly * 12;
      const free = t.netIncome + allowances - t.total - spending - p3a;
      return { t, spending, p3a, free, allowances };
    } catch {
      return null;
    }
  }, [plan, ctx]);

  return (
    <aside className="live" aria-label="Zusammenfassung">
      <div className="live-card panel">
        <h3>Dein Jahr {plan.startYear}</h3>
        {!plan.location && <p className="small" style={{ opacity: 0.8 }}>Wähle deinen Wohnort, damit die Steuern berechnet werden können.</p>}
        {data && (
          <>
            <div className="live-row">
              <span>Bruttolohn</span>
              <span className="num">{chf(data.t.grossIncome)}</span>
            </div>
            <div className="live-row">
              <span>Nettolohn</span>
              <span className="num">{chf(data.t.netIncome)}</span>
            </div>
            <div className="live-row">
              <span>Steuern</span>
              <span className="num">{chf(data.t.total)}</span>
            </div>
            <div className="live-row">
              <span>Ausgaben</span>
              <span className="num">{chf(data.spending)}</span>
            </div>
            <div className="live-row">
              <span>Säule 3a</span>
              <span className="num">{chf(data.p3a)}</span>
            </div>
            <div className="live-row">
              <span>Bleibt zum Sparen</span>
              <span className={`num ${data.free < 0 ? 'neg' : ''}`}>{chf(data.free)}</span>
            </div>
            <div className="live-row">
              <span>Grenzsteuersatz</span>
              <span className="num">{pct(data.t.marginalRate)}</span>
            </div>
          </>
        )}
        <a className="btn" href={href('check')} aria-disabled={!plan.location}>
          Zum Ist-Check
        </a>
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        Alles wird laufend in deinem Browser gespeichert. Beträge in heutigen Franken.
      </p>
    </aside>
  );
}
