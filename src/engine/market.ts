/**
 * Kapitalmarkt-Modell für die Monte-Carlo-Simulation.
 * - Aktien: fette Ränder (Student-t, 5 Freiheitsgrade), log-normal, real in CHF
 * - Obligationen: log-normal, leicht mit Aktien korreliert
 * - Teuerung: AR(1)-Prozess um den langfristigen Mittelwert
 * - Hypothekarzins: folgt der Teuerung, mit Schwankung
 * Renditeannahmen sind geometrische (durchschnittlich erzielte) reale Jahresrenditen.
 */
import type { Assumptions } from './plan';

export interface MarketYear {
  inflation: number;
  /** reale Renditen */
  stock: number;
  bond: number;
  cash: number;
  property: number;
  /** nominaler Hypothekarzins bei Neuabschluss */
  mortgageRate: number;
}

/** Schneller, reproduzierbarer Zufallsgenerator (mulberry32). */
export function createRng(seed: number) {
  let a = seed >>> 0;
  let spare: number | null = null;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = uniform();
    while (v === 0) v = uniform();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };
  /** Student-t mit 5 Freiheitsgraden, auf Varianz 1 skaliert */
  const fatTail = () => {
    const df = 5;
    let chi = 0;
    for (let i = 0; i < df; i++) {
      const z = normal();
      chi += z * z;
    }
    return (normal() / Math.sqrt(chi / df)) * Math.sqrt((df - 2) / df);
  };
  return { uniform, normal, fatTail };
}

const STOCK_BOND_CORR = 0.15;
const INFLATION_PERSISTENCE = 0.6;

export function generateMarketPath(a: Assumptions, years: number, seed: number): MarketYear[] {
  const rng = createRng(seed);
  const path: MarketYear[] = new Array(years);
  const stockMu = Math.log(1 + a.stockReturn);
  const bondMu = Math.log(1 + a.bondReturn);
  const propMu = Math.log(1 + a.propertyGrowth);
  const innovationSd = a.inflationVol * Math.sqrt(1 - INFLATION_PERSISTENCE ** 2);
  let infl = a.inflation;
  for (let t = 0; t < years; t++) {
    infl = a.inflation + INFLATION_PERSISTENCE * (infl - a.inflation) + innovationSd * rng.normal();
    infl = Math.min(0.09, Math.max(-0.02, infl));
    const zs = rng.fatTail();
    const zb = STOCK_BOND_CORR * zs + Math.sqrt(1 - STOCK_BOND_CORR ** 2) * rng.normal();
    // Obligationen leiden unter überraschender Teuerung
    const inflShock = infl - a.inflation;
    const stock = Math.exp(stockMu + a.stockVol * zs) - 1;
    const bond = Math.exp(bondMu + a.bondVol * zb - 1.5 * Math.max(0, inflShock)) - 1;
    const cash = (1 + a.cashYield + 0.5 * inflShock) / (1 + infl) - 1;
    const property = Math.exp(propMu + a.propertyVol * rng.normal()) - 1;
    const mortgageRate = Math.min(0.08, Math.max(0.008, a.mortgageRateFuture + 0.6 * inflShock + 0.004 * rng.normal()));
    path[t] = { inflation: infl, stock, bond, cash, property, mortgageRate };
  }
  return path;
}

/** Erwartungspfad ohne Zufall – für Tabellen und die deterministische Vorschau. */
export function expectedMarketPath(a: Assumptions, years: number): MarketYear[] {
  const y: MarketYear = {
    inflation: a.inflation,
    stock: a.stockReturn,
    bond: a.bondReturn,
    cash: (1 + a.cashYield) / (1 + a.inflation) - 1,
    property: a.propertyGrowth,
    mortgageRate: a.mortgageRateFuture
  };
  return Array.from({ length: years }, () => ({ ...y }));
}
