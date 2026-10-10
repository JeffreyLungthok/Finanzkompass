/// <reference lib="webworker" />
/**
 * Web Worker: rechnet die Monte-Carlo-Simulation im Hintergrund, damit die Oberfläche flüssig bleibt.
 */
import { runMonteCarlo, spendingCapacity, type MonteCarloResult } from './montecarlo';
import { buildInsights, retirementSnapshot, type Insight, type RetirementSnapshot } from './insights';
import { currentTaxes, type CurrentTaxes } from './taxHelpers';
import { buildTaxContext } from './tax/context';
import type { CantonTaxData } from './tax/types';
import type { Plan } from './plan';

export interface RunRequest {
  type: 'run';
  id: number;
  plan: Plan;
  bund: CantonTaxData;
  canton: CantonTaxData;
  simulations?: number;
  withCapacity?: boolean;
}

export interface RunResponse {
  type: 'result';
  id: number;
  mc: MonteCarloResult;
  insights: Insight[];
  taxes: CurrentTaxes;
  snapshot: RetirementSnapshot | null;
  ms: number;
}

export interface CapacityResponse {
  type: 'capacity';
  id: number;
  capacity: number;
}

export interface ErrorResponse {
  type: 'error';
  id: number;
  message: string;
}

export type WorkerResponse = RunResponse | CapacityResponse | ErrorResponse;

let latestId = 0;

self.onmessage = (ev: MessageEvent<RunRequest>) => {
  const req = ev.data;
  if (req.type !== 'run') return;
  latestId = req.id;
  try {
    const t0 = performance.now();
    const plan = req.plan;
    if (!plan.location) throw new Error('Kein Wohnort gewählt');
    const ctx = buildTaxContext(req.bund, req.canton, plan.location.bfsId);
    const mc = runMonteCarlo(plan, ctx, req.simulations ?? plan.assumptions.simulations);
    const taxes = currentTaxes(plan, ctx);
    const insights = buildInsights(plan, ctx, mc, taxes);
    const snapshot = retirementSnapshot(plan, mc);
    const res: RunResponse = { type: 'result', id: req.id, mc, insights, taxes, snapshot, ms: performance.now() - t0 };
    (self as unknown as Worker).postMessage(res);
    if (req.withCapacity) {
      // Abbrechen, falls inzwischen eine neuere Anfrage kam
      setTimeout(() => {
        if (latestId !== req.id) return;
        const capacity = spendingCapacity(plan, ctx);
        if (latestId !== req.id) return;
        (self as unknown as Worker).postMessage({ type: 'capacity', id: req.id, capacity } satisfies CapacityResponse);
      }, 0);
    }
  } catch (e) {
    (self as unknown as Worker).postMessage({ type: 'error', id: req.id, message: (e as Error).message } satisfies ErrorResponse);
  }
};
