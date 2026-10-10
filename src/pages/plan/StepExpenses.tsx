import { useId } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { usePlan, updatePlan } from '../../lib/store';
import { randomId, yearlyAmount, type Expense, type ExpenseCategory } from '../../engine/plan';
import { chf, num, parseNumber } from '../../lib/format';
import type { TaxContext } from '../../engine/tax/types';
import { currentTaxes } from '../../engine/taxHelpers';
import { useMemo, useState, useEffect } from 'react';

export const CATEGORIES: { value: ExpenseCategory; label: string }[] = [
  { value: 'wohnen', label: 'Wohnen' },
  { value: 'krankenkasse', label: 'Krankenkasse' },
  { value: 'versicherungen', label: 'Versicherungen & Abos' },
  { value: 'mobilitaet', label: 'Mobilität' },
  { value: 'lebenshaltung', label: 'Lebenshaltung' },
  { value: 'freizeit', label: 'Freizeit' },
  { value: 'ferien', label: 'Ferien' },
  { value: 'kinder', label: 'Kinder' },
  { value: 'sonstiges', label: 'Sonstiges' }
];

const RETIREMENT_OPTIONS = [
  { value: 0, label: 'fällt weg' },
  { value: 0.5, label: 'halbiert' },
  { value: 0.7, label: 'etwas weniger' },
  { value: 1, label: 'gleich' },
  { value: 1.1, label: 'leicht mehr' },
  { value: 1.2, label: 'etwas mehr' },
  { value: 1.5, label: 'deutlich mehr' }
];

const QUICK: Omit<Expense, 'id'>[] = [
  { label: 'Auto (Leasing, Benzin, Versicherung)', amount: 650, period: 'monthly', category: 'mobilitaet', retirementFactor: 0.8 },
  { label: 'Unterstützung Eltern', amount: 300, period: 'monthly', category: 'sonstiges', retirementFactor: 0 },
  { label: 'Hobby und Sport', amount: 150, period: 'monthly', category: 'freizeit', retirementFactor: 1.2 },
  { label: 'Spenden', amount: 1000, period: 'yearly', category: 'sonstiges', retirementFactor: 1 },
  { label: 'Zahnarzt und Franchise', amount: 1500, period: 'yearly', category: 'krankenkasse', retirementFactor: 1.3 },
  { label: 'Haustier', amount: 120, period: 'monthly', category: 'sonstiges', retirementFactor: 1 }
];

const setExpense = (id: string, patch: Partial<Expense>) =>
  updatePlan((p) => ({ ...p, expenses: p.expenses.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));

function AmountInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [text, setText] = useState(num(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(num(value));
  }, [value, focused]);
  return (
    <div className="input">
      <span className="affix">CHF</span>
      <input
        className="num-input"
        aria-label={label}
        inputMode="decimal"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseNumber(e.target.value);
          if (n !== null && n >= 0) onChange(n);
        }}
      />
    </div>
  );
}

export function StepExpenses({ ctx }: { ctx: TaxContext | null }) {
  const plan = usePlan();
  const idBase = useId();
  const total = plan.expenses.reduce((s, e) => s + (e.isRent && plan.property ? 0 : yearlyAmount(e)), 0);
  const childCosts = plan.children.reduce((s, c) => {
    const age = plan.startYear - c.birthYear;
    return s + (age >= 0 && age < c.dependentUntilAge ? c.monthlyCost * 12 + (age < 12 ? c.childcareYearly : 0) : 0);
  }, 0);
  const net = useMemo(() => (ctx ? currentTaxes(plan, ctx).netIncome : null), [plan, ctx]);

  return (
    <div>
      <p className="section-intro muted">
        Erfasse deine Ausgaben so grob oder fein, wie du möchtest. Steuern, Wohneigentum, Kinder und Vorsorgebeiträge rechnet der
        Finanzkompass selbst – die gehören nicht hierher.
      </p>

      <div className="list-head" aria-hidden="true">
        <span>Bezeichnung</span>
        <span>Kategorie</span>
        <span>Betrag</span>
        <span>Im Ruhestand</span>
        <span />
      </div>
      <div className="list-rows">
        {plan.expenses.map((e) => (
          <div className="expense-row" key={e.id}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div className="input">
                <input aria-label="Bezeichnung" value={e.label} onChange={(ev) => setExpense(e.id, { label: ev.target.value })} />
              </div>
              {e.category === 'wohnen' && (
                <label className="check small muted">
                  <input type="checkbox" checked={!!e.isRent} onChange={(ev) => setExpense(e.id, { isRent: ev.target.checked })} />
                  <span>Miete – entfällt bei Wohneigentum</span>
                </label>
              )}
            </div>
            <div className="input">
              <select aria-label="Kategorie" value={e.category} onChange={(ev) => setExpense(e.id, { category: ev.target.value as ExpenseCategory })}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <AmountInput label={`Betrag ${e.label}`} value={e.amount} onChange={(v) => setExpense(e.id, { amount: v })} />
              <div className="seg" style={{ padding: 2 }}>
                {(['monthly', 'yearly'] as const).map((per) => (
                  <button key={per} type="button" aria-pressed={e.period === per} style={{ minHeight: 28, padding: '3px 8px', fontSize: '0.82rem' }} onClick={() => setExpense(e.id, { period: per, amount: per === e.period ? e.amount : per === 'yearly' ? e.amount * 12 : Math.round(e.amount / 12) })}>
                    {per === 'monthly' ? 'pro Monat' : 'pro Jahr'}
                  </button>
                ))}
              </div>
            </div>
            <div className="input">
              <select aria-label={`Im Ruhestand: ${e.label}`} value={String(e.retirementFactor)} onChange={(ev) => setExpense(e.id, { retirementFactor: Number(ev.target.value) })}>
                {RETIREMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={String(o.value)}>
                    {o.label}
                  </option>
                ))}
                {!RETIREMENT_OPTIONS.some((o) => o.value === e.retirementFactor) && <option value={String(e.retirementFactor)}>× {e.retirementFactor}</option>}
              </select>
            </div>
            <button className="icon-btn" aria-label={`${e.label} entfernen`} onClick={() => updatePlan((p) => ({ ...p, expenses: p.expenses.filter((x) => x.id !== e.id) }))}>
              <Trash2 size={18} />
            </button>
          </div>
        ))}
        <button
          className="add-row"
          id={`${idBase}-add`}
          onClick={() =>
            updatePlan((p) => ({ ...p, expenses: [...p.expenses, { id: randomId(6), label: 'Neue Ausgabe', amount: 100, period: 'monthly', category: 'sonstiges', retirementFactor: 1 }] }))
          }
        >
          <Plus size={18} /> Ausgabe hinzufügen
        </button>
        <div className="chips" aria-label="Vorschläge">
          {QUICK.filter((q) => !plan.expenses.some((e) => e.label === q.label)).map((q) => (
            <button key={q.label} className="chip" onClick={() => updatePlan((p) => ({ ...p, expenses: [...p.expenses, { ...q, id: randomId(6) }] }))}>
              <Plus size={14} /> {q.label}
            </button>
          ))}
        </div>
      </div>

      <div className="sum-line">
        <span>Total Ausgaben</span>
        <span>
          <span className="num">{chf(total / 12)}</span> <span className="muted small">pro Monat, {chf(total)} pro Jahr</span>
        </span>
      </div>
      {childCosts > 0 && <p className="small muted" style={{ marginTop: 8 }}>Dazu kommen Kinderkosten von {chf(childCosts)} pro Jahr (aus dem Schritt Haushalt).</p>}
      {net !== null && (
        <p className="small muted" style={{ marginTop: 8 }}>
          Zum Vergleich: Nettolohn {chf(net)} pro Jahr. Wie viel nach Steuern übrig bleibt, zeigt die Zusammenfassung rechts.
        </p>
      )}
    </div>
  );
}
