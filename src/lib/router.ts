/**
 * Minimaler Hash-Router: #/check, #/plan/vorsorge, #/info/selbstaendige …
 * Hash-Routen funktionieren auf GitHub Pages ohne Server-Konfiguration.
 */
import { useSyncExternalStore } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [p, q] = hash.split('?');
  return { path: p ? p.split('/').filter(Boolean) : [], query: new URLSearchParams(q ?? '') };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  for (const l of listeners) l();
});

export function useRoute(): Route {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current
  );
}

export function navigate(path: string) {
  const target = `#/${path.replace(/^\/?/, '')}`;
  if (window.location.hash !== target) window.location.hash = target;
  window.scrollTo({ top: 0 });
}

/** Entfernt Daten aus der Adresszeile, ohne einen Seitenwechsel auszulösen. */
export function replaceQuietly(path: string) {
  history.replaceState(null, '', `#/${path}`);
  current = parse();
  for (const l of listeners) l();
}

export const href = (path: string) => `#/${path.replace(/^\/?/, '')}`;
