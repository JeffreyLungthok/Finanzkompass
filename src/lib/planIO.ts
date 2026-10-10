/**
 * Plan teilen und sichern: Der ganze Plan wird komprimiert in den Link geschrieben
 * (hinter dem #, das nie an einen Server übertragen wird).
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { DEFAULT_ASSUMPTIONS, createDefaultPlan, defaultPerson, randomId, type Plan } from '../engine/plan';
import type { JourneyState } from '../engine/journey';

/** Füllt fehlende Felder auf (ältere Links, manuell bearbeitete Dateien). */
export function normalizePlan(input: Partial<Plan>): Plan {
  const base = createDefaultPlan(input.startYear);
  const persons = (input.persons?.length ? input.persons : base.persons).slice(0, 2).map((p, i) => ({
    ...defaultPerson(i === 0 ? 'p1' : 'p2', input.startYear ?? base.startYear),
    ...p,
    id: (i === 0 ? 'p1' : 'p2') as 'p1' | 'p2'
  }));
  return {
    ...base,
    ...input,
    v: 1,
    id: input.id || randomId(11),
    persons,
    children: input.children ?? [],
    expenses: input.expenses ?? base.expenses,
    portfolio: { ...base.portfolio, ...(input.portfolio ?? {}) },
    property: input.property ? { ...input.property, mortgages: input.property.mortgages ?? [] } : null,
    events: input.events ?? [],
    assumptions: { ...DEFAULT_ASSUMPTIONS, ...(input.assumptions ?? {}) },
    relationship: persons.length === 1 ? 's' : input.relationship === 'c' ? 'c' : 'm'
  };
}

interface SharePayload {
  plan: Plan;
  journey?: JourneyState | null;
}

export function encodeShare(plan: Plan, journey?: JourneyState | null): string {
  const payload: SharePayload = { plan, journey: journey ?? undefined };
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function decodeShare(data: string): SharePayload | null {
  try {
    const json = decompressFromEncodedURIComponent(data);
    if (!json) return null;
    const parsed = JSON.parse(json) as SharePayload;
    if (!parsed.plan || !Array.isArray(parsed.plan.persons)) return null;
    return { plan: normalizePlan(parsed.plan), journey: parsed.journey ?? null };
  } catch {
    return null;
  }
}

export function shareUrl(plan: Plan, journey: JourneyState | null, view: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/${view}?p=${encodeShare(plan, journey)}`;
}

export function downloadPlanFile(plan: Plan, journey: JourneyState | null) {
  const blob = new Blob([JSON.stringify({ plan, journey }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `finanzplan-${plan.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readPlanFile(file: File): Promise<SharePayload | null> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const plan = parsed.plan ?? parsed;
    if (!plan || !Array.isArray(plan.persons)) return null;
    return { plan: normalizePlan(plan), journey: parsed.journey ?? null };
  } catch {
    return null;
  }
}
