import { usePlan } from '../../lib/store';
import { NumberField, PercentField } from '../../components/fields';
import { PersonSwitch, setPerson } from './common';
import { socialDeductions } from '../../engine/simulate';
import { estimatePkEmployee, estimatePkSavings } from '../../engine/plan';
import { chf, num } from '../../lib/format';
import type { TaxContext } from '../../engine/tax/types';
import { href } from '../../lib/router';

export function StepIncome({ ctx: _ctx }: { ctx: TaxContext | null }) {
  const plan = usePlan();
  return (
    <div>
      <p className="section-intro muted">Die Werte findest du auf dem Lohnausweis. Alle Beträge pro Jahr.</p>
      <PersonSwitch plan={plan}>
        {(p) => {
          const age = plan.startYear - p.birthYear;
          const social = socialDeductions(p.grossSalary);
          const pk = p.hasPensionFund ? p.pkEmployeeContribution : 0;
          const computedNet = p.grossSalary - social - pk;
          return (
            <>
              <div className="form-section">
                <h3>Lohn</h3>
                <div className="grid-2" style={{ marginTop: 12 }}>
                  <NumberField
                    label="Bruttolohn pro Jahr"
                    value={p.grossSalary}
                    prefix="CHF"
                    min={0}
                    onChange={(v) => {
                      const savings = estimatePkSavings(v, age);
                      // PK-Schätzung mitziehen, solange sie nicht von Hand angepasst wurde
                      const wasEstimated = p.pkSavingsContribution === estimatePkSavings(p.grossSalary, age);
                      setPerson(p.id, wasEstimated ? { grossSalary: v, pkSavingsContribution: savings, pkEmployeeContribution: estimatePkEmployee(v, savings) } : { grossSalary: v });
                    }}
                    tip="Lohnausweis Ziffer 8: inklusive 13. Monatslohn, Boni und Zulagen. Für Nichterwerbstätige 0 eintragen."
                  />
                  <NumberField
                    label="Nettolohn pro Jahr (optional)"
                    value={p.netSalary ?? 0}
                    optional
                    prefix="CHF"
                    min={0}
                    placeholder={num(computedNet)}
                    onChange={(v) => setPerson(p.id, { netSalary: v || undefined })}
                    onClear={() => setPerson(p.id, { netSalary: undefined })}
                    hint={`Ohne Angabe gerechnet: ${chf(computedNet)}`}
                    tip="Lohnausweis Ziffer 11: Bruttolohn minus AHV/IV/EO, ALV, Unfallversicherung und ordentliche PK-Beiträge. Mit diesem Wert passt der Finanzkompass die Lohnabzüge an deine Situation an."
                  />
                  <NumberField label="Pensum" value={p.workload} suffix="%" min={0} max={100} onChange={(v) => setPerson(p.id, { workload: Math.round(v) })} hint="Der Bruttolohn oben gilt für dieses Pensum." />
                  <NumberField
                    label="Fahrkosten Arbeitsweg pro Jahr"
                    value={p.travelExpenses}
                    prefix="CHF"
                    min={0}
                    onChange={(v) => setPerson(p.id, { travelExpenses: v })}
                    tip="Abziehbar bis zum Maximum deines Kantons (Bund: CHF 3’300). Ein GA kostet rund CHF 4’000."
                  />
                </div>
                <div className="callout" style={{ marginTop: 16 }}>
                  <p>
                    <strong>Lohnabzüge geschätzt:</strong> AHV/IV/EO 5,3 %, ALV 1,1 %, Nichtberufsunfall rund 1 % ({chf(social)}) und
                    PK-Beitrag {chf(pk)} – den PK-Beitrag passt du im nächsten Schritt an.
                  </p>
                </div>
              </div>

              <div className="form-section">
                <h3>Entwicklung</h3>
                <p className="section-intro">
                  Alle Beträge sind in <a href={href('info/heutige-franken')}>heutigen Franken</a>. Die Lohnentwicklung bedeutet deshalb
                  Wachstum über der Teuerung – etwa durch Erfahrung oder Beförderungen.
                </p>
                <div className="grid-3">
                  <PercentField label="Reales Lohnwachstum pro Jahr" value={p.salaryGrowth} min={-0.05} max={0.08} onChange={(v) => setPerson(p.id, { salaryGrowth: v })} tip="In der Schweiz sind die Reallöhne langfristig um durchschnittlich etwa 0,5–1 % pro Jahr gestiegen, in jüngeren Jahren eher schneller, gegen Ende der Karriere kaum mehr." />
                  <NumberField label="Wachstum bis Alter" value={p.salaryPeakAge} min={25} max={70} suffix="Jahre" onChange={(v) => setPerson(p.id, { salaryPeakAge: Math.round(v) })} />
                  <NumberField
                    label="Geplantes Pensionsalter"
                    value={p.retirementAge}
                    min={50}
                    max={70}
                    suffix="Jahre"
                    onChange={(v) => setPerson(p.id, { retirementAge: Math.round(v) })}
                    hint={age >= p.retirementAge ? "Bereits pensioniert: Bruttolohn auf 0 setzen" : "Ab wann kein Erwerbseinkommen mehr fliesst"}
                  />
                </div>
              </div>
            </>
          );
        }}
      </PersonSwitch>
    </div>
  );
}
