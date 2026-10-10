import { Plus, Trash2 } from 'lucide-react';
import { usePlan, updatePlan } from '../../lib/store';
import { Check, NumberField, PercentField, RangeField } from '../../components/fields';
import { randomId, type Mortgage, type Property } from '../../engine/plan';
import { chf, pct } from '../../lib/format';
import { href } from '../../lib/router';
import { PARAMS } from '../../engine/params';

const setPortfolio = (patch: Partial<ReturnType<typeof usePlan>['portfolio']>) =>
  updatePlan((p) => ({ ...p, portfolio: { ...p.portfolio, ...patch } }));
const setProperty = (patch: Partial<Property>) => updatePlan((p) => (p.property ? { ...p, property: { ...p.property, ...patch } } : p));
const setMortgage = (id: string, patch: Partial<Mortgage>) =>
  updatePlan((p) => (p.property ? { ...p, property: { ...p.property, mortgages: p.property.mortgages.map((m) => (m.id === id ? { ...m, ...patch } : m)) } } : p));

export function StepAssets() {
  const plan = usePlan();
  const pf = plan.portfolio;
  const prop = plan.property;
  const mortgageTotal = prop ? prop.mortgages.reduce((s, m) => s + m.amount, 0) : 0;
  const ltv = prop && prop.value > 0 ? mortgageTotal / prop.value : 0;

  return (
    <div>
      <p className="section-intro muted">Freies Vermögen, Wohneigentum und Schulden. Pensionskasse und Säule 3a hast du schon erfasst.</p>

      <div className="form-section">
        <h3>Freies Vermögen</h3>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <NumberField label="Konten und Bargeld" value={pf.cash} prefix="CHF" min={0} onChange={(v) => setPortfolio({ cash: v })} tip="Privat-, Spar- und Lohnkonten." />
          <NumberField label="Wertschriften" value={pf.securities} prefix="CHF" min={0} onChange={(v) => setPortfolio({ securities: v })} tip="Aktien, Fonds, ETF, Obligationen – zum aktuellen Kurswert. Ohne Säule 3a." />
          <RangeField
            label="Aktienanteil der Wertschriften"
            value={Math.round(pf.stockShare * 100)}
            min={0}
            max={100}
            step={5}
            format={(v) => `${v} %`}
            onChange={(v) => setPortfolio({ stockShare: v / 100 })}
            hint="Der Rest wird wie Obligationen gerechnet. Künftige Überschüsse werden gleich angelegt."
          />
          <NumberField label="Notgroschen" value={pf.emergencyMonths} suffix="Monatsausgaben" min={0} max={36} onChange={(v) => setPortfolio({ emergencyMonths: Math.round(v) })} hint="So viel bleibt auf dem Konto, der Rest wird angelegt." />
          <NumberField label="Übrige Schulden" value={pf.otherDebts} prefix="CHF" min={0} onChange={(v) => setPortfolio({ otherDebts: v })} hint="z. B. Kredite, Leasing (ohne Hypothek)" />
        </div>
      </div>

      <div className="form-section">
        <h3>Wohneigentum</h3>
        <Check
          label="Ich besitze selbstbewohntes Wohneigentum"
          checked={!!prop}
          onChange={(v) =>
            updatePlan((p) => ({
              ...p,
              property: v
                ? {
                    value: 950000,
                    purchaseYear: p.startYear - 5,
                    purchasePrice: 850000,
                    taxValueShare: 0.7,
                    eigenmietwert: 22000,
                    maintenanceRate: 0.01,
                    buildingAge: 20,
                    mortgages: [{ id: randomId(6), amount: 600000, rate: 0.016, fixedUntil: p.startYear + 4, amortization: 0, indirect: false }]
                  }
                : null
            }))
          }
          hint={<>Ein künftiger Kauf gehört zu den <a href={href('plan/ereignisse')}>Lebensereignissen</a>.</>}
        />
        {prop && (
          <>
            <div className="grid-3" style={{ marginTop: 16 }}>
              <NumberField label="Marktwert heute" value={prop.value} prefix="CHF" min={0} onChange={(v) => setProperty({ value: v })} />
              <NumberField label="Kaufpreis" value={prop.purchasePrice} prefix="CHF" min={0} onChange={(v) => setProperty({ purchasePrice: v })} hint="für die Grundstückgewinnsteuer" />
              <NumberField plain label="Kaufjahr" value={prop.purchaseYear} min={1950} max={plan.startYear} onChange={(v) => setProperty({ purchaseYear: Math.round(v) })} />
              <NumberField
                label="Eigenmietwert pro Jahr"
                value={prop.eigenmietwert}
                prefix="CHF"
                min={0}
                onChange={(v) => setProperty({ eigenmietwert: v })}
                tip={`Steht in der letzten Steuerveranlagung. Er fällt mit dem Systemwechsel ab ${plan.assumptions.reformYear} weg – zusammen mit dem Abzug der Schuldzinsen und Unterhaltskosten.`}
              />
              <PercentField label="Steuerwert" value={prop.taxValueShare} decimals={0} min={0.3} max={1} onChange={(v) => setProperty({ taxValueShare: v })} hint="in % des Marktwerts, für die Vermögenssteuer" />
              <PercentField label="Unterhalt und Nebenkosten" value={prop.maintenanceRate} decimals={1} min={0} max={0.05} onChange={(v) => setProperty({ maintenanceRate: v })} hint="pro Jahr in % des Werts, üblich sind rund 1 %" />
              <NumberField label="Alter des Gebäudes" value={prop.buildingAge} suffix="Jahre" min={0} max={300} onChange={(v) => setProperty({ buildingAge: Math.round(v) })} hint="für den Pauschalabzug" />
            </div>

            <h4 style={{ margin: '24px 0 10px' }}>Hypotheken</h4>
            <div className="list-rows">
              {prop.mortgages.map((m, i) => (
                <div key={m.id} className="panel" style={{ padding: 16, borderRadius: 'var(--radius-m)' }}>
                  <div className="row" style={{ marginBottom: 10 }}>
                    <strong>Tranche {i + 1}</strong>
                    <span className="spacer" />
                    <button className="icon-btn" aria-label={`Tranche ${i + 1} entfernen`} onClick={() => updatePlan((p) => (p.property ? { ...p, property: { ...p.property, mortgages: p.property.mortgages.filter((x) => x.id !== m.id) } } : p))}>
                      <Trash2 size={18} />
                    </button>
                  </div>
                  <div className="grid-3">
                    <NumberField label="Betrag" value={m.amount} prefix="CHF" min={0} onChange={(v) => setMortgage(m.id, { amount: v })} />
                    <PercentField label="Zins" value={m.rate} decimals={2} min={0} max={0.1} onChange={(v) => setMortgage(m.id, { rate: v })} />
                    <NumberField plain label="Zins fest bis" value={m.fixedUntil} min={plan.startYear - 1} max={plan.startYear + 20} onChange={(v) => setMortgage(m.id, { fixedUntil: Math.round(v) })} hint={`danach ${pct(plan.assumptions.mortgageRateFuture, 1)} (Annahme)`} />
                    <NumberField label="Amortisation pro Jahr" value={m.amortization} prefix="CHF" min={0} onChange={(v) => setMortgage(m.id, { amortization: v })} />
                    <div className="field">
                      <span className="label">Art der Amortisation</span>
                      <Check label="Indirekt über die Säule 3a" checked={m.indirect} onChange={(v) => setMortgage(m.id, { indirect: v })} hint="Hypothek bleibt stehen, das Geld fliesst in ein verpfändetes 3a-Konto" />
                    </div>
                  </div>
                </div>
              ))}
              <button className="add-row" onClick={() => updatePlan((p) => (p.property ? { ...p, property: { ...p.property, mortgages: [...p.property.mortgages, { id: randomId(6), amount: 100000, rate: 0.018, fixedUntil: p.startYear + 5, amortization: 0, indirect: false }] } } : p))}>
                <Plus size={18} /> Hypothekartranche hinzufügen
              </button>
            </div>
            <div className="callout" style={{ marginTop: 16 }}>
              <p>
                Belehnung {pct(ltv)} ({chf(mortgageTotal)} von {chf(prop.value)}).{' '}
                {ltv > PARAMS.mortgage.firstMortgageLtv
                  ? `Über zwei Drittel liegt die zweite Hypothek – sie muss in der Regel innert 15 Jahren oder bis zur Pensionierung amortisiert werden.`
                  : 'Mit höchstens zwei Dritteln Belehnung verlangen Banken meist keine Amortisation.'}{' '}
                Erfasste Mietkosten fallen weg, solange du Eigentum hast.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
