import { useState, type ReactNode } from 'react';
import { updatePlan } from '../../lib/store';
import type { PersonId, PersonPlan, Plan } from '../../engine/plan';

export const setPerson = (id: PersonId, patch: Partial<PersonPlan>) =>
  updatePlan((p) => ({ ...p, persons: p.persons.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));

export const setPlan = (patch: Partial<Plan>) => updatePlan((p) => ({ ...p, ...patch }));

/** Für Paare: Umschalten zwischen den Personen; Einzelpersonen sehen nur das Formular. */
export function PersonSwitch({ plan, children }: { plan: Plan; children: (p: PersonPlan) => ReactNode }) {
  const [active, setActive] = useState<PersonId>('p1');
  const person = plan.persons.find((p) => p.id === active) ?? plan.persons[0];
  return (
    <>
      {plan.persons.length > 1 && (
        <div className="person-tabs">
          <div className="seg" role="group" aria-label="Person wählen">
            {plan.persons.map((p) => (
              <button key={p.id} type="button" aria-pressed={p.id === person.id} onClick={() => setActive(p.id)}>
                {p.name || (p.id === 'p1' ? 'Person 1' : 'Person 2')}
              </button>
            ))}
          </div>
        </div>
      )}
      <div key={person.id}>{children(person)}</div>
    </>
  );
}
