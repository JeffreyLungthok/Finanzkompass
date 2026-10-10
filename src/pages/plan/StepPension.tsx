import { useMemo } from 'react';
import { usePlan } from '../../lib/store';
import { Check, NumberField, PercentField, RangeField, Segmented } from '../../components/fields';
import { PersonSwitch, setPerson } from './common';
import { PARAMS, ahvReferenceAge } from '../../engine/params';
import { estimatePkEmployee, estimatePkSavings, type Plan, type PersonPlan } from '../../engine/plan';
import { chf, pct } from '../../lib/format';
import { href } from '../../lib/router';
import { prepare, simulatePath } from '../../engine/simulate';
import { expectedMarketPath } from '../../engine/market';
import type { TaxContext } from '../../engine/tax/types';

function usePkProjection(plan: Plan, ctx: TaxContext | null) {
  return useMemo(() => {
    if (!ctx) return null;
    try {
      const prep = prepare(plan, ctx);
      const out = simulatePath(prep, expectedMarketPath(plan.assumptions, prep.years), true);
      return plan.persons.map((p, i) => {
        const rYear = p.birthYear + Math.max(58, Math.min(70, p.retirementAge));
        const before = out.records!.find((r) => r.year === rYear - 1);
        const at = out.records!.find((r) => r.year === rYear + 1);
        return { balance: before?.pkByPerson[i] ?? 0, pension: at?.pkPensionByPerson[i] ?? 0, p3a: before?.p3aByPerson[i] ?? 0 };
      });
    } catch {
      return null;
    }
  }, [plan, ctx]);
}

export function StepPension({ ctx }: { ctx: TaxContext | null }) {
  const plan = usePlan();
  const projection = usePkProjection(plan, ctx);
  return (
    <div>
      <p className="section-intro muted">
        Drei Säulen: AHV (staatlich), Pensionskasse (beruflich) und Säule 3a (privat). Die genauesten Zahlen stehen auf der
        AHV-Rentenvorausberechnung und dem jährlichen PK-Ausweis.
      </p>
      <PersonSwitch plan={plan}>{(p) => <PersonPension plan={plan} p={p} proj={projection?.[plan.persons.indexOf(p)] ?? null} />}</PersonSwitch>
    </div>
  );
}

function PersonPension({ plan, p, proj }: { plan: Plan; p: PersonPlan; proj: { balance: number; pension: number; p3a: number } | null }) {
  const age = plan.startYear - p.birthYear;
  const ref = ahvReferenceAge(p.birthYear, p.sex);
  const max3a = p.hasPensionFund ? PARAMS.pillar3a.maxWithPensionFund : Math.min(PARAMS.pillar3a.maxWithoutPensionFund, p.grossSalary * 0.2);
  return (
    <>
      <div className="form-section">
        <h3>AHV</h3>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <NumberField
            label="AHV-Rente pro Monat"
            value={p.ahvMonthly}
            prefix="CHF"
            min={0}
            max={PARAMS.ahv.maxPensionMonthly}
            onChange={(v) => setPerson(p.id, { ahvMonthly: v })}
            hint={`Einzelrente bei ${String(ref).replace('.', ',')}, gemäss Rentenvorausberechnung. Maximum ${chf(PARAMS.ahv.maxPensionMonthly)}.`}
            tip={
              <>
                Die Rentenvorausberechnung bestellst du kostenlos bei deiner Ausgleichskasse. Ohne Beitragslücken und bei einem
                durchschnittlichen Einkommen ab rund CHF 90’000 gibt es die Maximalrente. Die 13. AHV-Rente rechnet der Finanzkompass
                automatisch dazu. <a href={href('info/ahv')}>Anleitung</a>
              </>
            }
          />
          <Segmented
            label="AHV beziehen ab"
            value={p.ahvClaimAge}
            onChange={(v) => setPerson(p.id, { ahvClaimAge: v })}
            options={[63, 64, 65, 66, 67, 70].map((a) => ({ value: a, label: String(a) }))}
            hint={p.ahvClaimAge < ref ? `Vorbezug: −${pct((ref - p.ahvClaimAge) * PARAMS.ahv.earlyReductionPerYear, 1)} lebenslang` : p.ahvClaimAge > ref ? `Aufschub: +${pct(PARAMS.ahv.deferralSupplement[Math.min(5, Math.round(p.ahvClaimAge - ref))], 1)}` : 'Ordentlicher Bezug'}
          />
        </div>
        {p.ahvMonthly === 2300 && (
          <div className="callout" style={{ marginTop: 14 }}>
            <p>
              <strong>Noch eine Schätzung.</strong> Hol dir die genaue Zahl: <a href={href('info/ahv')}>So findest du deine AHV-Rente heraus</a>.
            </p>
          </div>
        )}
      </div>

      <div className="form-section">
        <h3>Pensionskasse</h3>
        <Check label="Ich bin in einer Pensionskasse versichert" checked={p.hasPensionFund} onChange={(v) => setPerson(p.id, { hasPensionFund: v })} hint="Angestellte ab einem Jahreslohn von CHF 22’680 sind obligatorisch versichert." />
        {p.hasPensionFund && age >= p.retirementAge && (
          <div className="grid-2" style={{ marginTop: 16 }}>
            <NumberField
              label="Laufende PK-Rente pro Jahr"
              value={p.pkPensionCurrent ?? 0}
              prefix="CHF"
              min={0}
              onChange={(v) => setPerson(p.id, { pkPensionCurrent: v })}
              hint="Du bist bereits pensioniert. Die Rente bleibt nominal gleich und verliert real an Wert."
            />
          </div>
        )}
        {p.hasPensionFund && age < p.retirementAge && (
          <>
            <div className="grid-2" style={{ marginTop: 16 }}>
              <NumberField label="Altersguthaben heute" value={p.pkBalance} prefix="CHF" min={0} onChange={(v) => setPerson(p.id, { pkBalance: v })} tip="Auf dem PK-Ausweis: «Vorhandenes Altersguthaben» oder «Sparkapital»." />
              <NumberField
                label="Sparbeiträge pro Jahr"
                value={p.pkSavingsContribution}
                prefix="CHF"
                min={0}
                onChange={(v) => setPerson(p.id, { pkSavingsContribution: v })}
                hint={`Schätzung für deinen Lohn: ${chf(estimatePkSavings(p.grossSalary, age))}`}
                tip="Altersgutschriften von Arbeitgeber und Arbeitnehmer zusammen (ohne Risikobeiträge). Sie steigen bei den meisten Kassen mit dem Alter – der Finanzkompass rechnet das nach der BVG-Staffel hoch."
              />
              <NumberField
                label="Eigener PK-Abzug pro Jahr"
                value={p.pkEmployeeContribution}
                prefix="CHF"
                min={0}
                onChange={(v) => setPerson(p.id, { pkEmployeeContribution: v })}
                hint={`Schätzung: ${chf(estimatePkEmployee(p.grossSalary, p.pkSavingsContribution))}`}
                tip="Der Abzug vom Lohn für die Pensionskasse (Lohnausweis Ziffer 10.1)."
              />
              <PercentField label="Verzinsung pro Jahr" value={p.pkInterest} decimals={2} min={0} max={0.06} onChange={(v) => setPerson(p.id, { pkInterest: v })} tip={`Nominal. Der BVG-Mindestzins liegt 2026 bei ${pct(PARAMS.bvg.minInterestRate, 2)}, viele Kassen haben in den letzten Jahren mehr bezahlt.`} />
              <PercentField
                label="Umwandlungssatz mit 65"
                value={p.pkConversionRate}
                decimals={2}
                min={0.03}
                max={0.08}
                onChange={(v) => setPerson(p.id, { pkConversionRate: v })}
                tip="Steht im Reglement oder auf dem PK-Ausweis. Auf dem obligatorischen Teil sind es 6,8 %, umhüllende Kassen liegen oft zwischen 5 und 6 %."
              />
              <NumberField label="Einkaufspotenzial" value={p.pkBuyInPotential} prefix="CHF" min={0} onChange={(v) => setPerson(p.id, { pkBuyInPotential: v })} tip="Maximal möglicher Einkauf laut PK-Ausweis. Einkäufe planst du unter Lebensereignisse." />
            </div>
            <div style={{ marginTop: 18 }}>
              <RangeField
                label="Bezug bei der Pensionierung als Kapital"
                value={Math.round(p.pkCapitalShare * 100)}
                min={0}
                max={100}
                step={25}
                format={(v) => `${v} %`}
                onChange={(v) => setPerson(p.id, { pkCapitalShare: v / 100 })}
                hint="0 % = nur Rente, 100 % = alles als Kapital. Viele Kassen erlauben mindestens 25 % Kapital."
              />
            </div>
            {proj && (
              <div className="callout" style={{ marginTop: 16 }}>
                <p>
                  <strong>Hochrechnung bis zur Pensionierung mit {p.retirementAge}:</strong> rund {chf(proj.balance)} Altersguthaben
                  {proj.pension > 0 ? `, das ergibt eine PK-Rente von etwa ${chf(proj.pension / 12)} pro Monat` : ''} (heutige Franken).
                  {p.pkProjectedAt65 ? ` Dein PK-Ausweis zeigt ${chf(p.pkProjectedAt65)} – Ausweise rechnen meist nominal und ohne künftige Lohnerhöhungen.` : ''}
                </p>
              </div>
            )}
            <div style={{ marginTop: 14, maxWidth: 340 }}>
              <NumberField label="Hochrechnung mit 65 laut PK-Ausweis (optional)" value={p.pkProjectedAt65 ?? 0} optional prefix="CHF" min={0} onChange={(v) => setPerson(p.id, { pkProjectedAt65: v || undefined })} onClear={() => setPerson(p.id, { pkProjectedAt65: undefined })} hint="Nur zum Vergleich" />
            </div>
          </>
        )}
      </div>

      <div className="form-section">
        <h3>Säule 3a</h3>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <NumberField label="Guthaben heute" value={p.p3aBalance} prefix="CHF" min={0} onChange={(v) => setPerson(p.id, { p3aBalance: v })} />
          <div className="field">
            <NumberField label="Einzahlung pro Jahr" value={p.p3aContribution} prefix="CHF" min={0} max={PARAMS.pillar3a.maxWithoutPensionFund} onChange={(v) => setPerson(p.id, { p3aContribution: v })} hint={`Maximum ${plan.startYear}: ${chf(max3a)}`} />
            {p.p3aContribution < max3a && (
              <button className="btn btn-quiet btn-small" style={{ justifySelf: 'start' }} onClick={() => setPerson(p.id, { p3aContribution: Math.round(max3a) })}>
                Maximum übernehmen
              </button>
            )}
          </div>
          <NumberField label="Anzahl 3a-Konten" value={p.p3aAccounts} min={1} max={5} onChange={(v) => setPerson(p.id, { p3aAccounts: Math.round(v) })} tip="Ein 3a-Konto lässt sich nur als Ganzes beziehen. Mit mehreren Konten verteilst du die Bezüge ab 60 auf mehrere Jahre und sparst Kapitalbezugssteuer." />
          <div className="field">
            <span className="label">Anlage</span>
            <Check label="In Wertschriften angelegt" checked={p.p3aInvested} onChange={(v) => setPerson(p.id, { p3aInvested: v })} hint="Sonst als Zinskonto gerechnet" />
          </div>
        </div>
        {p.p3aInvested && (
          <div style={{ marginTop: 16, maxWidth: 420 }}>
            <RangeField label="Aktienanteil der 3a-Lösung" value={Math.round(p.p3aStockShare * 100)} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={(v) => setPerson(p.id, { p3aStockShare: v / 100 })} />
          </div>
        )}
      </div>
    </>
  );
}
