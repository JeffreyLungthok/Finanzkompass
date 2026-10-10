import { usePlan, updatePlan } from '../../lib/store';
import { NumberField, PercentField, Segmented } from '../../components/fields';
import { DEFAULT_ASSUMPTIONS, type Assumptions } from '../../engine/plan';
import { href } from '../../lib/router';

const setA = (patch: Partial<Assumptions>) => updatePlan((p) => ({ ...p, assumptions: { ...p.assumptions, ...patch } }));

export function StepAssumptions() {
  const plan = usePlan();
  const a = plan.assumptions;
  return (
    <div>
      <p className="section-intro muted">
        Die Voreinstellungen sind bewusst zurückhaltend. Renditen sind <a href={href('info/heutige-franken')}>real</a> – also nach Abzug
        der Teuerung – und als durchschnittliche jährliche Wachstumsrate gemeint.
      </p>

      <div className="form-section">
        <h3>Märkte</h3>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <PercentField label="Aktien: Rendite real" value={a.stockReturn} decimals={1} min={-0.02} max={0.1} onChange={(v) => setA({ stockReturn: v })} tip="Langfristig erzielten Schweizer und globale Aktien real rund 4–5 % pro Jahr. Voreinstellung 4 %." />
          <PercentField label="Aktien: Schwankung" value={a.stockVol} decimals={0} min={0.05} max={0.35} onChange={(v) => setA({ stockVol: v })} tip="Standardabweichung der Jahresrendite. Rund 16 % bedeuten: In etwa jedem sechsten Jahr verlieren Aktien mehr als 12 %." />
          <PercentField label="Obligationen: Rendite real" value={a.bondReturn} decimals={1} min={-0.03} max={0.05} onChange={(v) => setA({ bondReturn: v })} />
          <PercentField label="Teuerung" value={a.inflation} decimals={1} min={-0.01} max={0.06} onChange={(v) => setA({ inflation: v })} tip="Die Schweizerische Nationalbank strebt 0–2 % an. Die Teuerung schwankt in der Simulation um diesen Mittelwert." />
          <PercentField label="Kontozins" value={a.cashYield} decimals={1} min={0} max={0.05} onChange={(v) => setA({ cashYield: v })} hint="nominal" />
          <PercentField label="Dividendenrendite" value={a.dividendYield} decimals={1} min={0} max={0.06} onChange={(v) => setA({ dividendYield: v })} hint="als Einkommen steuerbar" />
        </div>
      </div>

      <div className="form-section">
        <h3>Wohnen und Vorsorge</h3>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <PercentField label="Hypothekarzins künftig" value={a.mortgageRateFuture} decimals={2} min={0.005} max={0.08} onChange={(v) => setA({ mortgageRateFuture: v })} hint="nominal, nach Ablauf der Zinsbindung" />
          <PercentField label="Immobilienpreise real" value={a.propertyGrowth} decimals={1} min={-0.03} max={0.05} onChange={(v) => setA({ propertyGrowth: v })} />
          <PercentField label="AHV-Anpassung real" value={a.ahvRealIndexation} decimals={1} min={-0.02} max={0.02} onChange={(v) => setA({ ahvRealIndexation: v })} tip="Die AHV-Renten folgen dem Mischindex aus Lohn- und Preisentwicklung. 0 % heisst: Die Renten halten genau mit der Teuerung Schritt." />
          <NumberField plain label="Systemwechsel Eigenmietwert ab" value={a.reformYear} min={2026} max={2040} onChange={(v) => setA({ reformYear: Math.round(v) })} tip="Volk und Stände haben die Abschaffung des Eigenmietwerts im September 2025 angenommen. Inkrafttreten nach heutigem Stand 2029." />
        </div>
      </div>

      <div className="form-section">
        <h3>Planung</h3>
        <div className="grid-3" style={{ marginTop: 12 }}>
          <NumberField label="Planen bis Alter" value={a.endAge} min={80} max={105} suffix="Jahre" onChange={(v) => setA({ endAge: Math.round(v) })} tip="Eine 65-jährige Person in der Schweiz wird im Mittel rund 85 bis 88 Jahre alt – ein beträchtlicher Teil aber deutlich älter. Planen bis 95 deckt dieses Risiko gut ab." />
          <Segmented label="Anzahl Simulationen" value={a.simulations} onChange={(v) => setA({ simulations: v })} options={[{ value: 500, label: '500' }, { value: 1000, label: '1000' }, { value: 2000, label: '2000' }]} hint="Mehr ist genauer, aber langsamer" />
          <NumberField plain label="Zufallsstartwert" value={a.seed} min={1} max={4294967295} onChange={(v) => setA({ seed: Math.round(v) })} hint="Gleicher Wert = gleiche Zukünfte, damit Vergleiche fair sind" />
        </div>
        <button className="btn btn-secondary btn-small" style={{ marginTop: 18 }} onClick={() => setA({ ...DEFAULT_ASSUMPTIONS })}>
          Voreinstellungen wiederherstellen
        </button>
      </div>
    </div>
  );
}
