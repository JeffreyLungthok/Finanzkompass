/**
 * Die Monte-Carlo-Bandbreite als Berglandschaft: jedes Perzentil ist ein Grat, die guten Zukünfte
 * stehen hinten und hell, die schlechten vorne und dunkel. Die Sonne markiert das Ziel (Geld reicht
 * bis zum Planungshorizont). Gleiche Daten wie das Höhenprofil im Ist-Check, nur als Bild.
 */
import { useId } from 'react';
import type { Bands } from '../../engine/montecarlo';
import { chfShort, pct } from '../../lib/format';
import { areaPath, linePath, scaleLinear, useWidth } from './util';

interface Props {
  years: number[];
  bands: Bands;
  birthYear: number;
  retirementYear: number;
  endAge: number;
  successRate: number;
}

const RIDGES: { key: keyof Bands; cls: string }[] = [
  { key: 'p90', cls: 'ridge-1' },
  { key: 'p75', cls: 'ridge-2' },
  { key: 'p50', cls: 'ridge-3' },
  { key: 'p25', cls: 'ridge-4' },
  { key: 'p10', cls: 'ridge-5' }
];

const LABELS: { key: keyof Bands; text: string }[] = [
  { key: 'p90', text: 'Gute Börsenjahre' },
  { key: 'p50', text: 'Mittleres Szenario' },
  { key: 'p10', text: 'Schlechte Börsenjahre' }
];

export function HeroRidges({ years, bands, birthYear, retirementYear, endAge, successRate }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const id = useId().replace(/:/g, '');
  const compact = width < 480;
  const height = compact ? 280 : 360;
  const m = { top: compact ? 64 : 76, right: compact ? 92 : 128, bottom: 30, left: 0 };
  const innerW = Math.max(120, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;

  const max = Math.max(...bands.p90) * 1.04 || 1;
  const x = scaleLinear(years[0], years[years.length - 1], 0, innerW);
  const y = scaleLinear(0, max, innerH, 0);
  const xs = years.map(x);
  // Grundlinie unter die Zeichenfläche legen, damit der Rissrand nur die Grate trifft
  const base = years.map(() => innerH + 12);
  const last = years.length - 1;

  // Direktbeschriftung am rechten Rand, mit Mindestabstand
  const placed: { key: keyof Bands; text: string; value: number; ly: number }[] = [];
  for (const l of LABELS) {
    const value = bands[l.key][last];
    let ly = y(value);
    const prev = placed[placed.length - 1];
    if (prev && ly - prev.ly < 34) ly = prev.ly + 34;
    placed.push({ ...l, value, ly: Math.min(ly, innerH - 6) });
  }

  const retireX = x(retirementYear);
  const sunR = compact ? 22 : 30;
  const sunX = innerW - sunR - 4;
  const sunY = -m.top / 2;
  const age0 = years[0] - birthYear;
  const summary = `Vermögen in heutigen Franken von Alter ${age0} bis ${endAge}, aus 1000 simulierten Zukünften. Mit ${endAge}: schlechte Börsenjahre ${chfShort(bands.p10[last])}, mittleres Szenario ${chfShort(bands.p50[last])}, gute Börsenjahre ${chfShort(bands.p90[last])}. Das Geld reicht in ${pct(successRate)} der Zukünfte bis ${endAge}.`;

  return (
    <div ref={ref} className="hero-ridges">
      <svg width={width} height={height} role="img" aria-label={summary}>
        <defs>
          <filter id={`torn-${id}`} x="-2%" y="-10%" width="104%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="5" />
          </filter>
          <clipPath id={`plot-${id}`}>
            <rect x={0} y={-m.top} width={innerW} height={innerH + m.top} />
          </clipPath>
          <pattern id={`paper-${id}`} patternUnits="userSpaceOnUse" width="480" height="384">
            <image href="./alpine-earth/assets/Materials/paper-fiber.webp" width="480" height="384" />
          </pattern>
        </defs>
        <g transform={`translate(${m.left},${m.top})`}>
          {/* Sonne: das Ziel */}
          <image
            href="./alpine-earth/assets/Shapes/disc-sun.webp"
            x={sunX - sunR}
            y={sunY - sunR}
            width={sunR * 2}
            height={sunR * 2}
            className="ridge-sun"
          />
          <text className="ridge-goal" x={sunX - sunR - 10} y={sunY - 2} textAnchor="end">
            Ziel: Geld reicht bis {endAge}
          </text>
          <text className="ridge-goal-value" x={sunX - sunR - 10} y={sunY + 16} textAnchor="end">
            in {pct(successRate)} der Zukünfte
          </text>

          <g clipPath={`url(#plot-${id})`}>
          {RIDGES.map((r) => {
            const d = areaPath(xs, bands[r.key].map(y), base);
            return (
              <g key={r.key} filter={`url(#torn-${id})`}>
                <path d={d} className={r.cls} />
                <path d={d} fill={`url(#paper-${id})`} className="ridge-paper" />
              </g>
            );
          })}
          <path d={linePath(xs, bands.p50.map(y))} className="ridge-median" filter={`url(#torn-${id})`} />
          </g>

          {/* Pension als Pass */}
          <line x1={retireX} x2={retireX} y1={y(bands.p90[years.indexOf(retirementYear)] ?? 0) - 10} y2={innerH} className="ridge-pass" />

          {placed.map((l) => (
            <g key={l.key} transform={`translate(${innerW + 10},${l.ly})`}>
              <line x1={-8} x2={-2} y1={0} y2={0} className="ridge-tick" />
              <text className="ridge-label" y={-3}>
                {compact ? l.text.replace(' Börsenjahre', '').replace(' Szenario', '') : l.text}
              </text>
              <text className="ridge-value" y={13}>
                {chfShort(l.value)}
              </text>
            </g>
          ))}

          <g className="ridge-axis" transform={`translate(0,${innerH + 20})`}>
            <text x={0}>heute {age0}</text>
            <text x={retireX} textAnchor="middle">
              Pension {retirementYear - birthYear}
            </text>
            <text x={innerW} textAnchor="end">
              {endAge}
            </text>
          </g>
        </g>
      </svg>
    </div>
  );
}
