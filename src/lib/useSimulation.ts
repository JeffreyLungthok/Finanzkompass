import { useEffect, useRef, useState } from 'react';
import type { Plan } from '../engine/plan';
import type { RunResponse } from '../engine/sim.worker';
import { runSimulation } from './simClient';

export function useSimulation(plan: Plan | null, opts: { withCapacity?: boolean; delay?: number; channel?: string; simulations?: number } = {}) {
  const [result, setResult] = useState<RunResponse | null>(null);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const key = plan ? JSON.stringify({ ...plan, updatedAt: '', name: '' }) : '';

  useEffect(() => {
    if (!plan) return;
    clearTimeout(timer.current);
    setLoading(true);
    timer.current = setTimeout(() => {
      setCapacity(null);
      runSimulation(
        plan,
        {
          onResult: (r) => {
            setResult(r);
            setLoading(false);
            setError('');
          },
          onCapacity: (c) => setCapacity(c.capacity),
          onError: (m) => {
            setError(m);
            setLoading(false);
          }
        },
        { withCapacity: opts.withCapacity, channel: opts.channel, simulations: opts.simulations }
      );
    }, result ? (opts.delay ?? 350) : 0);
    return () => clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { result, capacity, loading, error };
}
