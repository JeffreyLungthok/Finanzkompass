/**
 * Spezialsteuern rund um Immobilien und Vermögensübertragungen.
 * Diese Steuern sind kantonal sehr unterschiedlich geregelt – hier stehen bewusst
 * einfache, transparente Schätzungen, die im Tool als solche gekennzeichnet sind.
 */
import { INHERITANCE_DESCENDANTS_TAXED, NO_INHERITANCE_TAX, TRANSFER_TAX } from './params';

/**
 * Grundstückgewinnsteuer – grobe Schätzung nach dem Muster des Kantons Zürich:
 * progressiver Tarif auf dem Gewinn, Zuschlag bei kurzer, Ermässigung bei langer Besitzdauer.
 */
export function estimateGrundstueckgewinnsteuer(gain: number, holdingYears: number): number {
  if (gain <= 0) return 0;
  const brackets: [number, number][] = [
    [4000, 0.1],
    [6000, 0.15],
    [8000, 0.2],
    [12000, 0.25],
    [20000, 0.3],
    [50000, 0.35],
    [Infinity, 0.4]
  ];
  let rest = gain;
  let tax = 0;
  for (const [width, rate] of brackets) {
    const part = Math.min(rest, width);
    tax += part * rate;
    rest -= part;
    if (rest <= 0) break;
  }
  let factor = 1;
  if (holdingYears < 1) factor = 1.5;
  else if (holdingYears < 2) factor = 1.25;
  else if (holdingYears >= 5) factor = 1 - Math.min(0.5, 0.08 + (holdingYears - 5) * 0.03);
  return tax * factor;
}

export function transferTaxInfo(cantonId: number, price: number) {
  const t = TRANSFER_TAX[cantonId] ?? { rate: 0.01 };
  const base = Math.max(0, price - (t.exemptPrimary ?? 0));
  const tax = base * t.rate;
  const fees = price * 0.004;
  return { rate: t.rate, tax, fees, total: tax + fees, note: t.note };
}

export function inheritanceInfo(cantonId: number, from: 'eltern' | 'andere' | 'partner'): string {
  if (NO_INHERITANCE_TAX.has(cantonId)) return 'Dein Wohnkanton kennt keine Erbschafts- und Schenkungssteuer.';
  if (from === 'eltern') {
    return (
      INHERITANCE_DESCENDANTS_TAXED[cantonId] ??
      'Erbschaften von den Eltern an Kinder sind in deinem Kanton steuerfrei. Massgebend ist der Wohnkanton der verstorbenen Person.'
    );
  }
  if (from === 'partner') {
    return 'Ehepartner sind überall steuerfrei. Konkubinatspartner zahlen je nach Kanton Erbschaftssteuer – teils hohe Sätze. Ein Testament und die Begünstigung in Pensionskasse und 3a sind wichtig.';
  }
  return 'Erbschaften von entfernteren Verwandten oder Dritten werden in den meisten Kantonen besteuert. Massgebend ist der letzte Wohnsitz der verstorbenen Person.';
}
