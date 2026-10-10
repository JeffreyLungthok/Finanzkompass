/**
 * Woher kommt das Geld? Gestapelte Flächen der Einkommensquellen pro Jahr
 * und die Ausgaben (inkl. Steuern) als Linie – alles in heutigen Franken.
 */
import { useMemo, useState } from 'react';
import type { YearRecord } from '../../engine/simulate';
import { chf, chfShort } from '../../lib/format';
import { areaPath, linePath, niceDomain, niceTicks, scaleLinear, useWidth } from './util';

interface Props {
  records: YearRecord[];
  birthYear: number;
  height?: number;
  ageLabel?: string;
}

const SERIES = [
  { key: 'lohn', label: 'Lohn (netto)', color: 'var(--s-lohn)' },
  { key: 'pk', label: 'PK-Rente', color: 'var(--s-pk)' },
  { key: 'ahv', label: 'AHV-Rente', color: 'var(--s-ahv)' },
  { key: 'verm', label: 'Aus dem Vermögen', color: 'var(--s-verm)' }
] as const;

type Key = (typeof SERIES)[number]['key'];

export function spendingOf(r: YearRecord) {
  return r.expenses + r.housing + r.children + r.taxIncome + r.taxWealth + r.ahvNonEmployed;
}

export function IncomeChart({ records, birthYear, height = 300, ageLabel = 'Alter' }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const compact = width < 520;
  const margin = { top: 12, right: 16, bottom: 34, left: compact ? 50 : 64 };
  const innerW = Math.max(100, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;

  const data = useMemo(
    () =>
      records.map((r) => {
        const lohn = r.netSalary + r.allowances;
        const spend = spendingOf(r);
        const income = lohn + r.ahv + r.pkPension;
        return { year: r.year, lohn, pk: r.pkPension, ahv: r.ahv, verm: Math.max(0, spend - income), spend };
      }),
    [records]
  );

  const [, y1] = useMemo(() => {
    let hi = 0;
    for (const d of data) hi = Math.max(hi, d.lohn + d.pk + d.ahv + d.verm, d.spend);
    return niceDomain(0, hi * 1.05 || 1, 5);
  }, [data]);

  if (!data.length) return null;
  const years = data.map((d) => d.year);
  const x = scaleLinear(years[0], years[years.length - 1], 0, innerW);
  const y = scaleLinear(0, y1, innerH, 0);
  const xs = years.map(x);
  const ticksY = niceTicks(0, y1, compact ? 4 : 5);

  // gestapelt
  let base = data.map(() => 0);
  const layers = SERIES.map((s) => {
    const bottom = base;
    const top = data.map((d, i) => bottom[i] + d[s.key as Key]);
    base = top;
    return { ...s, top, bottom };
  });

  const ageStart = years[0] - birthYear;
  const ageEnd = years[years.length - 1] - birthYear;
  const step = ageEnd - ageStart > 50 ? 10 : 5;
  const ticksX: number[] = [];
  for (let a = Math.ceil(ageStart / step) * step; a <= ageEnd; a += step) ticksX.push(a);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const idx = Math.round(((e.clientX - rect.left) / innerW) * (years.length - 1));
    setHover(Math.max(0, Math.min(years.length - 1, idx)));
  };
  const d = hover !== null ? data[hover] : null;

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label="Einkommensquellen und Ausgaben pro Jahr">
        <g transform={`translate(${margin.left},${margin.top})`}>
          {ticksY.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'axis-line' : 'grid-line'} x1={0} x2={innerW} y1={y(t)} y2={y(t)} />
              <text className="tick-label" x={-8} y={y(t)} dy="0.32em" textAnchor="end">
                {chfShort(t, false)}
              </text>
            </g>
          ))}
          {ticksX.map((a) => (
            <text key={a} className="tick-label" x={x(birthYear + a)} y={innerH + 22} textAnchor="middle">
              {a}
            </text>
          ))}
          {layers.map((l) => (
            <path key={l.key} d={areaPath(xs, l.top.map(y), l.bottom.map(y))} fill={l.color} opacity={l.key === 'verm' ? 0.55 : 0.85} stroke="var(--surface)" strokeWidth={1.5} strokeLinejoin="round" />
          ))}
          <path d={linePath(xs, data.map((v) => y(v.spend)))} fill="none" stroke="var(--ink)" strokeWidth={2} strokeLinejoin="round" />
          {hover !== null && (
            <g pointerEvents="none">
              <line x1={xs[hover]} x2={xs[hover]} y1={0} y2={innerH} stroke="var(--ink-2)" strokeWidth={1} />
              <circle cx={xs[hover]} cy={y(data[hover].spend)} r={4.5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />
            </g>
          )}
          <rect x={0} y={0} width={innerW} height={innerH} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </g>
      </svg>
      {d && hover !== null && (
        <div className="tooltip" style={{ left: Math.min(Math.max(0, margin.left + xs[hover] + 14), width - 220), top: 4 }}>
          <div className="tt-head">
            Alter {d.year - birthYear} ({d.year})
          </div>
          {SERIES.map((s) =>
            d[s.key as Key] > 0 ? (
              <div className="tt-row" key={s.key}>
                <span>
                  <span className="swatch" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="num">{chf(d[s.key as Key])}</span>
              </div>
            ) : null
          )}
          <div className="tt-row" style={{ borderTop: '1px solid var(--line)', marginTop: 4, paddingTop: 4 }}>
            <span>
              <span className="swatch-line" style={{ background: 'var(--ink)' }} />
              Ausgaben inkl. Steuern
            </span>
            <span className="num">{chf(d.spend)}</span>
          </div>
        </div>
      )}
      <div className="chart-legend">
        {SERIES.map((s) => (
          <span key={s.key}>
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        <span>
          <span className="swatch-line" style={{ background: 'var(--ink)' }} />
          Ausgaben inkl. Steuern
        </span>
        <span className="muted">Waagrecht: {ageLabel}, Beträge pro Jahr</span>
      </div>
    </div>
  );
}
