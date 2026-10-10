/**
 * «Höhenprofil» des Vermögens: Bandbreite aus der Monte-Carlo-Simulation über dem Alter,
 * wie das Profil einer Wanderroute. Optional mit einem einzelnen Lebenspfad darüber.
 */
import { useMemo, useState } from 'react';
import type { Bands } from '../../engine/montecarlo';
import { chf, chfShort } from '../../lib/format';
import { areaPath, linePath, niceDomain, niceTicks, scaleLinear, useWidth } from './util';

export interface Milestone {
  year: number;
  label: string;
}

interface Props {
  years: number[];
  birthYear: number;
  bands?: Bands;
  path?: number[];
  /** Pfad nur bis zu diesem Jahr zeichnen (Lebenssimulation) */
  pathUntil?: number;
  milestones?: Milestone[];
  retirementYear?: number;
  height?: number;
  title: string;
  pathLabel?: string;
  /** feste y-Achse, damit sie während der Lebenssimulation nicht springt */
  fixedDomain?: [number, number];
  ageLabel?: string;
}

const M = { top: 30, right: 16, bottom: 34, left: 64 };

export function WealthProfile({ years, birthYear, bands, path, pathUntil, milestones = [], retirementYear, height = 340, title, pathLabel = 'Dein Lebenspfad', fixedDomain, ageLabel = 'Alter' }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const compact = width < 520;
  const margin = compact ? { ...M, left: 50 } : M;
  const innerW = Math.max(100, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;

  const pathEnd = pathUntil !== undefined ? years.findIndex((y) => y > pathUntil) : -1;
  const visiblePath = path ? (pathEnd >= 0 ? path.slice(0, pathEnd) : path) : undefined;

  const [y0, y1] = useMemo(() => {
    if (fixedDomain) return fixedDomain;
    let lo = 0;
    let hi = 0;
    if (bands) {
      for (const v of bands.p10) lo = Math.min(lo, v);
      for (const v of bands.p90) hi = Math.max(hi, v);
    }
    if (path) for (const v of path) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    return niceDomain(lo, hi * 1.04 || 100000, 5);
  }, [bands, path, fixedDomain]);

  const x = scaleLinear(years[0], years[years.length - 1], 0, innerW);
  const y = scaleLinear(y0, y1, innerH, 0);
  const xs = years.map(x);
  const ticksY = niceTicks(y0, y1, compact ? 4 : 5);
  const ageStart = years[0] - birthYear;
  const ageEnd = years[years.length - 1] - birthYear;
  const ageStep = ageEnd - ageStart > 50 ? 10 : 5;
  const ticksX: number[] = [];
  for (let a = Math.ceil(ageStart / ageStep) * ageStep; a <= ageEnd; a += ageStep) ticksX.push(a);

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const idx = Math.round((px / innerW) * (years.length - 1));
    setHover(Math.max(0, Math.min(years.length - 1, idx)));
  };

  const hi = hover !== null ? hover : null;
  const tooltipLeft = hi !== null ? Math.min(Math.max(0, margin.left + xs[hi] + 14), width - 200) : 0;
  const ms = milestones.filter((m) => m.year >= years[0] && m.year <= years[years.length - 1]);

  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={title}>
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

          {retirementYear && retirementYear >= years[0] && retirementYear <= years[years.length - 1] && (
            <g>
              <line x1={x(retirementYear)} x2={x(retirementYear)} y1={-14} y2={innerH} stroke="var(--ink-2)" strokeWidth={1} />
              <g transform={`translate(${x(retirementYear)},${-26})`}>
                <polygon points="0,0 70,0 80,9 70,18 0,18" fill="var(--sign)" />
                <text x={7} y={13} style={{ fill: 'var(--sign-ink)', fontFamily: 'var(--font-sign)', fontWeight: 600, fontSize: 13 }}>
                  Pension
                </text>
              </g>
            </g>
          )}

          {bands && (
            <>
              <path d={areaPath(xs, bands.p90.map(y), bands.p10.map(y))} fill="var(--band)" opacity={0.12} />
              <path d={areaPath(xs, bands.p75.map(y), bands.p25.map(y))} fill="var(--band)" opacity={0.2} />
              <path d={linePath(xs, bands.p50.map(y))} fill="none" stroke="var(--band)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </>
          )}

          {visiblePath && visiblePath.length > 0 && (
            <>
              <path d={linePath(xs.slice(0, visiblePath.length), visiblePath.map(y))} fill="none" stroke="var(--ink)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={xs[visiblePath.length - 1]} cy={y(visiblePath[visiblePath.length - 1])} r={6} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
            </>
          )}

          {ms.map((m, i) => (
            <g key={`${m.year}-${i}`} transform={`translate(${x(m.year)},${innerH})`}>
              <rect x={-5} y={-5} width={10} height={10} transform="rotate(45)" fill="var(--accent)" stroke="var(--ink)" strokeWidth={1.5} />
            </g>
          ))}

          {hi !== null && (
            <g pointerEvents="none">
              <line x1={xs[hi]} x2={xs[hi]} y1={0} y2={innerH} stroke="var(--ink-2)" strokeWidth={1} />
              {bands && <circle cx={xs[hi]} cy={y(bands.p50[hi])} r={4.5} fill="var(--band)" stroke="var(--surface)" strokeWidth={2} />}
              {visiblePath && hi < visiblePath.length && <circle cx={xs[hi]} cy={y(visiblePath[hi])} r={4.5} fill="var(--ink)" stroke="var(--surface)" strokeWidth={2} />}
            </g>
          )}
          <rect
            x={0}
            y={0}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerDown={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </g>
      </svg>
      {hi !== null && (
        <div className="tooltip" style={{ left: tooltipLeft, top: 8 }}>
          <div className="tt-head">
            Alter {years[hi] - birthYear} ({years[hi]})
          </div>
          {bands && (
            <>
              <div className="tt-row">
                <span>Gutes Szenario (90 %)</span>
                <span className="num">{chfShort(bands.p90[hi])}</span>
              </div>
              <div className="tt-row">
                <span>
                  <span className="swatch-line" style={{ background: 'var(--band)' }} />
                  Mittleres Szenario
                </span>
                <span className="num">{chfShort(bands.p50[hi])}</span>
              </div>
              <div className="tt-row">
                <span>Schlechtes Szenario (10 %)</span>
                <span className="num">{chfShort(bands.p10[hi])}</span>
              </div>
            </>
          )}
          {visiblePath && hi < visiblePath.length && (
            <div className="tt-row">
              <span>
                <span className="swatch-line" style={{ background: 'var(--ink)' }} />
                {pathLabel}
              </span>
              <span className="num">{chf(visiblePath[hi])}</span>
            </div>
          )}
          {ms
            .filter((m) => m.year === years[hi])
            .map((m) => (
              <div key={m.label} className="small" style={{ marginTop: 4 }}>
                ◆ {m.label}
              </div>
            ))}
        </div>
      )}
      <div className="chart-legend">
        {bands && (
          <>
            <span>
              <span className="swatch-line" style={{ background: 'var(--band)' }} />
              Mittleres Szenario
            </span>
            <span>
              <span className="swatch-band" style={{ background: 'color-mix(in srgb, var(--band) 32%, transparent)' }} />
              Die Hälfte aller Zukünfte
            </span>
            <span>
              <span className="swatch-band" style={{ background: 'color-mix(in srgb, var(--band) 13%, transparent)' }} />
              8 von 10 Zukünften
            </span>
          </>
        )}
        {path && (
          <span>
            <span className="swatch-line" style={{ background: 'var(--ink)' }} />
            {pathLabel}
          </span>
        )}
        {ms.length > 0 && (
          <span>
            <svg width="12" height="12" aria-hidden="true">
              <rect x="2" y="2" width="8" height="8" transform="rotate(45 6 6)" fill="var(--accent)" stroke="var(--ink)" strokeWidth="1.2" />
            </svg>
            Ereignis
          </span>
        )}
        <span className="muted">Waagrecht: {ageLabel}</span>
      </div>
    </div>
  );
}
