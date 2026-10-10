import { Plus, Trash2 } from 'lucide-react';
import { usePlan, updatePlan } from '../../lib/store';
import { NumberField, PercentField, SelectField, TextField, RangeField } from '../../components/fields';
import { randomId, type LifeEvent, type LifeEventType, type Plan } from '../../engine/plan';
import { chf } from '../../lib/format';
import type { TaxContext } from '../../engine/tax/types';
import { inheritanceInfo, transferTaxInfo } from '../../engine/specialTaxes';

type EventOf<T extends LifeEventType> = Extract<LifeEvent, { type: T }>;

export const EVENT_LABELS: Record<LifeEventType, string> = {
  house_purchase: 'Hauskauf',
  house_sale: 'Hausverkauf',
  child: 'Kind',
  workload: 'Pensum ändern',
  salary: 'Neuer Lohn',
  inheritance: 'Erbschaft',
  pk_buyin: 'Einkauf Pensionskasse',
  one_off_expense: 'Einmalige Ausgabe',
  one_off_income: 'Einmalige Einnahme',
  expense_change: 'Ausgaben ändern',
  allocation: 'Anlagestrategie ändern',
  amortize: 'Hypothek amortisieren',
  gift: 'Schenkung'
};

function createEvent(type: LifeEventType, plan: Plan): LifeEvent {
  const y = plan.startYear + 2;
  const id = randomId(6);
  const p1 = plan.persons[0];
  switch (type) {
    case 'house_purchase': {
      const gross = plan.persons.reduce((s, p) => s + p.grossSalary, 0);
      const price = Math.round(Math.min(2000000, Math.max(500000, gross * 5.5)) / 50000) * 50000;
      return { id, type, year: y, price, equityFromSavings: price * 0.2, fromPk: 0, from3a: 0, rate: plan.assumptions.mortgageRateFuture, fixedYears: 10, amortizationYears: 15 };
    }
    case 'house_sale':
      return { id, type, year: p1.birthYear + 78, price: plan.property?.value ?? 1000000, newRentMonthly: 2400 };
    case 'child':
      return { id, type, year: y, name: 'Kind', monthlyCost: 1100, childcareYearly: 12000 };
    case 'workload':
      return { id, type, year: y, person: 'p1', workload: 80 };
    case 'salary':
      return { id, type, year: y, person: 'p1', grossSalary: Math.round(p1.grossSalary * 1.1) };
    case 'inheritance':
      return { id, type, year: p1.birthYear + 58, amount: 200000, from: 'eltern' };
    case 'pk_buyin':
      return { id, type, year: Math.max(plan.startYear, p1.birthYear + 50), person: 'p1', amount: 10000, years: 5 };
    case 'one_off_expense':
      return { id, type, year: y, amount: 30000, label: 'Neues Auto' };
    case 'one_off_income':
      return { id, type, year: y, amount: 20000, label: 'Bonus' };
    case 'expense_change':
      return { id, type, year: y, yearly: 6000, label: 'Mehr Ferien' };
    case 'allocation':
      return { id, type, year: y, stockShare: 0.5 };
    case 'amortize':
      return { id, type, year: y, amount: 100000 };
    case 'gift':
      return { id, type, year: p1.birthYear + 70, amount: 100000, label: 'Schenkung an Kinder' };
  }
}

const setEvent = (id: string, patch: Partial<LifeEvent>) =>
  updatePlan((p) => ({ ...p, events: p.events.map((e) => (e.id === id ? ({ ...e, ...patch } as LifeEvent) : e)) }));

export function StepEvents({ ctx }: { ctx: TaxContext | null }) {
  const plan = usePlan();
  const events = [...plan.events].sort((a, b) => a.year - b.year);
  const p1 = plan.persons[0];
  const types = Object.keys(EVENT_LABELS) as LifeEventType[];

  return (
    <div>
      <p className="section-intro muted">
        Was wird sich in deinem Leben verändern? Ereignisse fliessen in den Ist-Check ein. Durchspielen lassen sich viele davon
        auch in der Lebenssimulation.
      </p>
      <div className="list-rows">
        {events.length === 0 && <p className="muted">Noch keine Ereignisse geplant. Wähle unten eines aus.</p>}
        {events.map((e) => (
          <div className="event-item" key={e.id}>
            <div className="event-year">
              {e.year}
              <small>Alter {e.year - p1.birthYear}</small>
            </div>
            <div>
              <strong>{EVENT_LABELS[e.type]}</strong>
              <div className="event-fields">
                <NumberField plain label="Jahr" value={e.year} min={plan.startYear} max={p1.birthYear + plan.assumptions.endAge} onChange={(v) => setEvent(e.id, { year: Math.round(v) })} />
                <EventFields e={e} plan={plan} ctx={ctx} />
              </div>
            </div>
            <button className="icon-btn" aria-label={`${EVENT_LABELS[e.type]} entfernen`} onClick={() => updatePlan((p) => ({ ...p, events: p.events.filter((x) => x.id !== e.id) }))}>
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
      <h4 style={{ margin: '22px 0 10px' }}>Ereignis hinzufügen</h4>
      <div className="chips">
        {types
          .filter((t) => !(t === 'house_purchase' && (plan.property || plan.events.some((e) => e.type === 'house_purchase'))))
          .filter((t) => !(t === 'house_sale' && !plan.property && !plan.events.some((e) => e.type === 'house_purchase')))
          .map((t) => (
            <button key={t} className="chip" onClick={() => updatePlan((p) => ({ ...p, events: [...p.events, createEvent(t, p)] }))}>
              <Plus size={14} /> {EVENT_LABELS[t]}
            </button>
          ))}
      </div>
    </div>
  );
}

function PersonSelect({ value, onChange, plan }: { value: 'p1' | 'p2'; onChange: (v: 'p1' | 'p2') => void; plan: Plan }) {
  if (plan.persons.length < 2) return null;
  return <SelectField label="Person" value={value} onChange={onChange} options={plan.persons.map((p) => ({ value: p.id, label: p.name }))} />;
}

function EventFields({ e, plan, ctx }: { e: LifeEvent; plan: Plan; ctx: TaxContext | null }) {
  switch (e.type) {
    case 'house_purchase': {
      const ev = e as EventOf<'house_purchase'>;
      const t = ctx ? transferTaxInfo(ctx.cantonId, ev.price) : null;
      return (
        <>
          <NumberField label="Kaufpreis" value={ev.price} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { price: v })} />
          <NumberField label="Eigenkapital aus Ersparnissen" value={ev.equityFromSavings} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { equityFromSavings: v })} hint="mindestens 10 % hartes Eigenkapital" />
          <NumberField label="Vorbezug Pensionskasse" value={ev.fromPk} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { fromPk: v })} hint="wird als Kapitalleistung besteuert" />
          <NumberField label="Vorbezug Säule 3a" value={ev.from3a} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { from3a: v })} />
          <PercentField label="Hypothekarzins" value={ev.rate} decimals={2} min={0} max={0.1} onChange={(v) => setEvent(e.id, { rate: v })} />
          <NumberField label="Zinsbindung" value={ev.fixedYears} suffix="Jahre" min={0} max={15} onChange={(v) => setEvent(e.id, { fixedYears: Math.round(v) })} />
          {t && (
            <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>
              Kaufnebenkosten ca. {chf(t.total)}: Handänderungssteuer {chf(t.tax)}{t.note ? ` (${t.note})` : ''} plus Notariats- und Grundbuchkosten. Eigenkapital total{' '}
              {chf(ev.equityFromSavings + ev.fromPk + ev.from3a)} ({Math.round(((ev.equityFromSavings + ev.fromPk + ev.from3a) / Math.max(1, ev.price)) * 100)} %, Banken verlangen 20 %).
            </p>
          )}
        </>
      );
    }
    case 'house_sale': {
      const ev = e as EventOf<'house_sale'>;
      return (
        <>
          <NumberField label="Verkaufspreis (heutige Franken)" value={ev.price} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { price: v })} />
          <NumberField label="Neue Miete pro Monat" value={ev.newRentMonthly} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { newRentMonthly: v })} />
        </>
      );
    }
    case 'child': {
      const ev = e as EventOf<'child'>;
      return (
        <>
          <TextField label="Name" value={ev.name} onChange={(v) => setEvent(e.id, { name: v })} />
          <NumberField label="Kosten pro Monat" value={ev.monthlyCost} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { monthlyCost: v })} />
          <NumberField label="Fremdbetreuung pro Jahr" value={ev.childcareYearly} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { childcareYearly: v })} />
        </>
      );
    }
    case 'workload': {
      const ev = e as EventOf<'workload'>;
      return (
        <>
          <PersonSelect value={ev.person} onChange={(v) => setEvent(e.id, { person: v })} plan={plan} />
          <NumberField label="Neues Pensum" value={ev.workload} suffix="%" min={0} max={100} onChange={(v) => setEvent(e.id, { workload: Math.round(v) })} hint="0 % = Pause, z. B. Sabbatical" />
          <NumberField plain label="Bis Jahr (optional)" value={ev.untilYear ?? 0} optional min={ev.year} max={2100} onChange={(v) => setEvent(e.id, { untilYear: v || undefined })} onClear={() => setEvent(e.id, { untilYear: undefined })} hint="danach wieder das vorherige Pensum" />
        </>
      );
    }
    case 'salary': {
      const ev = e as EventOf<'salary'>;
      return (
        <>
          <PersonSelect value={ev.person} onChange={(v) => setEvent(e.id, { person: v })} plan={plan} />
          <NumberField label="Neuer Bruttolohn" value={ev.grossSalary} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { grossSalary: v })} hint="bei heutigem Pensum, heutige Franken" />
        </>
      );
    }
    case 'inheritance': {
      const ev = e as EventOf<'inheritance'>;
      return (
        <>
          <NumberField label="Betrag" value={ev.amount} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { amount: v })} />
          <SelectField label="Von" value={ev.from} onChange={(v) => setEvent(e.id, { from: v })} options={[{ value: 'eltern', label: 'Eltern' }, { value: 'andere', label: 'Andere' }]} />
          {ctx && <p className="small muted" style={{ gridColumn: '1 / -1', margin: 0 }}>{inheritanceInfo(ctx.cantonId, ev.from)} Im Plan ist der Betrag nach Steuern einzutragen.</p>}
        </>
      );
    }
    case 'pk_buyin': {
      const ev = e as EventOf<'pk_buyin'>;
      return (
        <>
          <PersonSelect value={ev.person} onChange={(v) => setEvent(e.id, { person: v })} plan={plan} />
          <NumberField label="Betrag pro Jahr" value={ev.amount} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { amount: v })} />
          <NumberField label="Während" value={ev.years} suffix="Jahren" min={1} max={20} onChange={(v) => setEvent(e.id, { years: Math.round(v) })} hint="begrenzt auf das Einkaufspotenzial" />
        </>
      );
    }
    case 'one_off_expense':
    case 'one_off_income':
    case 'gift': {
      const ev = e as EventOf<'one_off_expense'>;
      return (
        <>
          <TextField label="Bezeichnung" value={ev.label} onChange={(v) => setEvent(e.id, { label: v })} />
          <NumberField label="Betrag" value={ev.amount} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { amount: v })} />
        </>
      );
    }
    case 'expense_change': {
      const ev = e as EventOf<'expense_change'>;
      return (
        <>
          <TextField label="Bezeichnung" value={ev.label} onChange={(v) => setEvent(e.id, { label: v })} />
          <NumberField label="Mehr (+) oder weniger (−) pro Jahr" value={ev.yearly} prefix="CHF" onChange={(v) => setEvent(e.id, { yearly: v })} />
          <NumberField plain label="Bis Jahr (optional)" value={ev.untilYear ?? 0} optional min={ev.year} max={2120} onChange={(v) => setEvent(e.id, { untilYear: v || undefined })} onClear={() => setEvent(e.id, { untilYear: undefined })} />
        </>
      );
    }
    case 'allocation': {
      const ev = e as EventOf<'allocation'>;
      return <RangeField label="Neuer Aktienanteil" value={Math.round(ev.stockShare * 100)} min={0} max={100} step={5} format={(v) => `${v} %`} onChange={(v) => setEvent(e.id, { stockShare: v / 100 })} />;
    }
    case 'amortize': {
      const ev = e as EventOf<'amortize'>;
      return <NumberField label="Betrag" value={ev.amount} prefix="CHF" min={0} onChange={(v) => setEvent(e.id, { amount: v })} />;
    }
  }
}
