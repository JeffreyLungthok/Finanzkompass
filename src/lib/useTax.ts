import { useEffect, useState } from 'react';
import type { Location } from '../engine/plan';
import type { TaxContext } from '../engine/tax/types';
import { buildTaxContext } from '../engine/tax/context';
import { loadLocations, loadTaxData } from './taxData';
import type { LocationRow } from '../engine/tax/context';

export function useTaxContext(loc: Location | null): { ctx: TaxContext | null; error: string } {
  const [ctx, setCtx] = useState<TaxContext | null>(null);
  const [error, setError] = useState('');
  const key = loc ? `${loc.cantonId}-${loc.bfsId}` : '';
  useEffect(() => {
    let alive = true;
    if (!loc) {
      setCtx(null);
      return;
    }
    loadTaxData(loc.cantonId)
      .then(({ bund, canton }) => {
        if (!alive) return;
        try {
          setCtx(buildTaxContext(bund, canton, loc.bfsId));
          setError('');
        } catch (e) {
          setError((e as Error).message);
        }
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { ctx, error };
}

export function useLocations(): LocationRow[] | null {
  const [rows, setRows] = useState<LocationRow[] | null>(null);
  useEffect(() => {
    loadLocations().then(setRows).catch(() => setRows([]));
  }, []);
  return rows;
}
