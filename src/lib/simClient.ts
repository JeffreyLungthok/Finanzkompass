/**
 * Dünne Hülle um den Web Worker. Pro «Kanal» zählt nur die neueste Anfrage,
 * ältere Ergebnisse werden verworfen.
 */
import type { CapacityResponse, RunResponse, WorkerResponse } from '../engine/sim.worker';
import type { Plan } from '../engine/plan';
import { loadTaxData } from './taxData';

export interface Listener {
  onResult: (r: RunResponse) => void;
  onCapacity?: (r: CapacityResponse) => void;
  onError: (msg: string) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { channel: string; listener: Listener }>();
const latestByChannel = new Map<string, number>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../engine/sim.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data;
      const entry = pending.get(msg.id);
      if (!entry || latestByChannel.get(entry.channel) !== msg.id) return;
      if (msg.type === 'result') entry.listener.onResult(msg);
      else if (msg.type === 'capacity') entry.listener.onCapacity?.(msg);
      else entry.listener.onError(msg.message);
    };
    worker.onerror = (e) => {
      for (const { listener } of pending.values()) listener.onError(e.message || 'Fehler in der Berechnung');
    };
  }
  return worker;
}

export async function runSimulation(
  plan: Plan,
  listener: Listener,
  opts: { simulations?: number; withCapacity?: boolean; channel?: string } = {}
) {
  if (!plan.location) {
    listener.onError('Bitte zuerst den Wohnort wählen.');
    return;
  }
  const channel = opts.channel ?? 'main';
  const id = nextId++;
  latestByChannel.set(channel, id);
  pending.set(id, { channel, listener });
  // Aufräumen alter Einträge
  for (const key of pending.keys()) if (key < id - 50) pending.delete(key);
  try {
    const { bund, canton } = await loadTaxData(plan.location.cantonId);
    if (latestByChannel.get(channel) !== id) return;
    getWorker().postMessage({ type: 'run', id, plan, bund, canton, simulations: opts.simulations, withCapacity: opts.withCapacity });
  } catch (e) {
    listener.onError((e as Error).message);
  }
}
