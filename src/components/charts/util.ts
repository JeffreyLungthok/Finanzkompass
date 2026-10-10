import { useEffect, useRef, useState } from 'react';

export function useWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.getBoundingClientRect().width || initial);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, width] as const;
}

export function scaleLinear(d0: number, d1: number, r0: number, r1: number) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v: number) => r0 + (v - d0) * k;
}

/** «Schöne» Achsenwerte (1, 2, 2.5, 5 × 10^n). */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (max === min) return [min];
  const span = max - min;
  const raw = span / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.map((s) => s * pow).find((s) => span / s <= count) ?? 10 * pow;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-6; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

export function niceDomain(min: number, max: number, count = 5): [number, number] {
  const t = niceTicks(min, max, count);
  if (!t.length) return [min, max];
  const step = t.length > 1 ? t[1] - t[0] : Math.abs(max - min) || 1;
  const lo = Math.min(t[0], Math.floor(min / step) * step);
  const hi = Math.max(t[t.length - 1], Math.ceil(max / step) * step);
  return [lo, hi];
}

export function areaPath(xs: number[], top: number[], bottom: number[]): string {
  if (!xs.length) return '';
  let d = `M${xs[0]},${top[0]}`;
  for (let i = 1; i < xs.length; i++) d += `L${xs[i]},${top[i]}`;
  for (let i = xs.length - 1; i >= 0; i--) d += `L${xs[i]},${bottom[i]}`;
  return d + 'Z';
}

export function linePath(xs: number[], ys: number[]): string {
  return xs.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join('');
}
