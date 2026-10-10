import { useId, useMemo, useState } from 'react';
import { MapPin, Plus, Trash2 } from 'lucide-react';
import { usePlan, updatePlan } from '../../lib/store';
import { useLocations } from '../../lib/useTax';
import { searchLocations } from '../../lib/taxData';
import { NumberField, Segmented, SelectField, TextField, InfoTip } from '../../components/fields';
import { setPerson } from './common';
import { CANTON_NAMES, ahvReferenceAge } from '../../engine/params';
import { defaultPerson, randomId, type Plan } from '../../engine/plan';
import type { TaxContext } from '../../engine/tax/types';

export function StepHousehold({ ctx }: { ctx: TaxContext | null }) {
  const plan = usePlan();
  const couple = plan.persons.length === 2;
  const household = couple ? plan.relationship : 's';

  const setHousehold = (v: 's' | 'm' | 'c') => {
    updatePlan((p) => {
      if (v === 's') return { ...p, relationship: 's', persons: [p.persons[0]] };
      const persons = p.persons.length === 2 ? p.persons : [p.persons[0], defaultPerson('p2', p.startYear, { birthYear: p.persons[0].birthYear, grossSalary: 80000 })];
      return { ...p, relationship: v, persons };
    });
  };

  return (
    <div>
      <p className="section-intro muted">Wohnort und Zivilstand bestimmen die Steuern, die Zahl der Personen die Vorsorge.</p>

      <div className="form-section">
        <h3>Wohnort</h3>
        <p className="section-intro">Die Steuern werden mit den Tarifen und Steuerfüssen deiner Gemeinde berechnet (Daten der Eidgenössischen Steuerverwaltung).</p>
        <LocationPicker plan={plan} />
        {ctx && plan.location && (
          <p className="small muted" style={{ marginTop: 10 }}>
            Steuerfüsse {ctx.year}: Kanton {ctx.factors.incomeCanton} %, Gemeinde {ctx.factors.incomeCity} %
            {ctx.factors.incomeProtestant ? `, reformierte Kirche ${ctx.factors.incomeProtestant} %` : ''}.
          </p>
        )}
      </div>

      <div className="form-section">
        <Segmented
          label="Zivilstand"
          value={household}
          onChange={setHousehold}
          options={[
            { value: 's', label: 'Alleinstehend' },
            { value: 'm', label: 'Verheiratet' },
            { value: 'c', label: 'Konkubinat' }
          ]}
          hint="Eingetragene Partnerschaft wie verheiratet. Konkubinatspaare zahlen getrennt Steuern."
        />
      </div>

      {plan.persons.map((p, i) => (
        <div className="form-section" key={p.id}>
          <h3>{couple ? `Person ${i + 1}` : 'Du'}</h3>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <TextField label="Name oder Kürzel" value={p.name} onChange={(v) => setPerson(p.id, { name: v })} placeholder={`Person ${i + 1}`} />
            <NumberField plain label="Jahrgang" value={p.birthYear} min={1930} max={plan.startYear - 16} onChange={(v) => setPerson(p.id, { birthYear: Math.round(v) })} hint={`heute ${plan.startYear - p.birthYear} Jahre alt`} />
            <Segmented
              label="Geschlecht"
              value={p.sex}
              onChange={(v) => setPerson(p.id, { sex: v })}
              options={[
                { value: 'f', label: 'Frau' },
                { value: 'm', label: 'Mann' }
              ]}
              hint={`Für das AHV-Referenzalter: ${String(ahvReferenceAge(p.birthYear, p.sex)).replace('.', ',')} Jahre.`}
            />
            <SelectField
              label="Konfession"
              value={p.confession}
              onChange={(v) => setPerson(p.id, { confession: v })}
              options={[
                { value: 'none', label: 'Keine / andere' },
                { value: 'protestant', label: 'Reformiert' },
                { value: 'roman', label: 'Römisch-katholisch' },
                { value: 'christ', label: 'Christkatholisch' }
              ]}
              hint="Für die Kirchensteuer."
            />
          </div>
        </div>
      ))}

      <div className="form-section">
        <h3>Kinder</h3>
        <p className="section-intro">Kinder im Haushalt oder in Ausbildung. Geplante Kinder erfasst du unter Lebensereignisse.</p>
        <div className="list-rows">
          {plan.children.map((c) => (
            <div key={c.id} className="panel" style={{ padding: 16, borderRadius: 'var(--radius-m)' }}>
              <div className="row" style={{ marginBottom: 10 }}>
                <strong>{c.name || 'Kind'}</strong>
                <span className="muted small">{plan.startYear - c.birthYear} Jahre</span>
                <span className="spacer" />
                <button className="icon-btn" aria-label={`${c.name || 'Kind'} entfernen`} onClick={() => updatePlan((p) => ({ ...p, children: p.children.filter((x) => x.id !== c.id) }))}>
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="grid-3">
                <TextField label="Name" value={c.name} onChange={(v) => updateChild(c.id, { name: v })} />
                <NumberField plain label="Jahrgang" value={c.birthYear} min={plan.startYear - 30} max={plan.startYear} onChange={(v) => updateChild(c.id, { birthYear: Math.round(v) })} />
                <NumberField label="Abhängig bis Alter" value={c.dependentUntilAge} min={16} max={30} suffix="Jahre" onChange={(v) => updateChild(c.id, { dependentUntilAge: Math.round(v) })} hint="Ende Ausbildung" />
                <NumberField label="Kosten pro Monat" value={c.monthlyCost} prefix="CHF" min={0} onChange={(v) => updateChild(c.id, { monthlyCost: v })} tip="Essen, Kleider, Hobbys, Krankenkasse, Ausbildung. Studien nennen in der Schweiz rund 1000 bis 1500 Franken pro Monat." />
                <NumberField label="Fremdbetreuung pro Jahr" value={c.childcareYearly} prefix="CHF" min={0} onChange={(v) => updateChild(c.id, { childcareYearly: v })} hint="bis 12 Jahre, teilweise abziehbar" />
              </div>
            </div>
          ))}
          <button
            className="add-row"
            onClick={() =>
              updatePlan((p) => ({
                ...p,
                children: [...p.children, { id: randomId(6), name: '', birthYear: p.startYear - 3, monthlyCost: 1100, childcareYearly: 12000, dependentUntilAge: 25 }]
              }))
            }
          >
            <Plus size={18} /> Kind hinzufügen
          </button>
        </div>
      </div>
    </div>
  );
}

const updateChild = (id: string, patch: Partial<Plan['children'][number]>) =>
  updatePlan((p) => ({ ...p, children: p.children.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

function LocationPicker({ plan }: { plan: Plan }) {
  const rows = useLocations();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const id = useId();
  const results = useMemo(() => (rows ? searchLocations(rows, query) : []), [rows, query]);

  const choose = (r: (typeof results)[number]) => {
    updatePlan((p) => ({ ...p, location: { bfsId: r[0], name: r[1], cantonId: r[2], canton: r[3] } }));
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="field" style={{ position: 'relative', maxWidth: 520 }}>
      <label htmlFor={id}>
        Gemeinde
        <InfoTip>Massgebend ist der steuerliche Wohnsitz am 31. Dezember. Für einen Umzug später kannst du den Plan kopieren und den Wohnort ändern.</InfoTip>
      </label>
      {plan.location && (
        <div className="row" style={{ marginBottom: 4 }}>
          <MapPin size={18} />
          <strong>{plan.location.name}</strong>
          <span className="muted">{CANTON_NAMES[plan.location.cantonId]}</span>
        </div>
      )}
      <div className="input">
        <input
          id={id}
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          placeholder={rows ? (plan.location ? 'Andere Gemeinde suchen' : 'z. B. Winterthur, Thun, Lugano') : 'Gemeinden werden geladen …'}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              setActive((a) => Math.min(results.length - 1, a + 1));
              e.preventDefault();
            } else if (e.key === 'ArrowUp') {
              setActive((a) => Math.max(0, a - 1));
              e.preventDefault();
            } else if (e.key === 'Enter' && results[active]) {
              choose(results[active]);
              e.preventDefault();
            }
          }}
        />
      </div>
      {open && results.length > 0 && (
        <ul
          id={`${id}-list`}
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 10,
            listStyle: 'none',
            margin: '4px 0 0',
            padding: 4,
            background: 'var(--surface)',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--radius-m)',
            boxShadow: 'var(--shadow)'
          }}
        >
          {results.map((r, i) => (
            <li
              key={r[0]}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => setActive(i)}
              style={{
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: i === active ? 'var(--surface-2)' : undefined,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10
              }}
            >
              <span>{r[1]}</span>
              <span className="muted">{r[3]}</span>
            </li>
          ))}
        </ul>
      )}
      {!plan.location && <span className="hint">Ohne Wohnort lassen sich die Steuern nicht berechnen.</span>}
    </div>
  );
}
