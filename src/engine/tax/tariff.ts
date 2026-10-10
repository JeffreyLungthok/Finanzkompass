/**
 * Tarifberechnung für Bund, Kantone und Gemeinden.
 * Portierung der Logik aus devbrains-com/swisstaxcalculator (MIT-Lizenz),
 * umgeschrieben auf reine Zahlen und synchrone Ausführung für die Simulation.
 */
import type { CantonTaxData, Tarif, TarifRow, TaxRelationship, TaxTypeName } from './types';

export const TARIF_GROUPS = ['VERHEIRATET', 'LEDIG_MIT_KINDER', 'LEDIG_ALLEINE', 'LEDIG_KONKUBINAT'] as const;
export type TarifGroup = (typeof TARIF_GROUPS)[number];

/** Rundet kaufmännisch auf ganze Franken (bei .5 auf die gerade Zahl, wie die ESTV). */
export function roundHalfEven(value: number): number {
  const rounded = Math.round(value);
  const diff = Math.abs(value % 1);
  if (Math.abs(diff - 0.5) < 1e-9) {
    const floor = Math.floor(value);
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return rounded;
}

/** Auf 100 Franken abrunden (steuerbares Einkommen wird so abgerundet). */
export const round100Down = (value: number) => Math.floor(Math.max(0, value) / 100 + 1e-9) * 100;

export function getTarifGroups(relationship: TaxRelationship, children: number): TarifGroup[] {
  if (relationship === 'm') return ['VERHEIRATET'];
  const groups: TarifGroup[] = [];
  if (children > 0) groups.push('LEDIG_MIT_KINDER');
  groups.push(relationship === 's' ? 'LEDIG_ALLEINE' : 'LEDIG_KONKUBINAT');
  return groups;
}

const isSplittingGroup = (group: TarifGroup) => group === 'VERHEIRATET' || group === 'LEDIG_MIT_KINDER';

const tarifCache = new WeakMap<CantonTaxData, Map<string, [Tarif, TarifGroup] | null>>();

export function findTarif(
  data: CantonTaxData,
  taxType: TaxTypeName,
  groups: TarifGroup[]
): [Tarif, TarifGroup] | null {
  let cache = tarifCache.get(data);
  if (!cache) {
    cache = new Map();
    tarifCache.set(data, cache);
  }
  const key = `${taxType}|${groups.join(',')}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const tables = data.tarifs.filter((t) => t.taxType === taxType);
  let result: [Tarif, TarifGroup] | null = null;
  for (const group of groups) {
    const t = tables.find((x) => x.group === 'ALLE' || x.group.includes(group));
    if (t) {
      result = [t, group];
      break;
    }
  }
  cache.set(key, result);
  return result;
}

function taxZurich(amount: number, table: TarifRow[]): number {
  let taxes = 0;
  let remaining = amount;
  for (const row of table) {
    const usable = remaining >= row.amount ? row.amount : remaining;
    taxes += (usable * row.percent) / 100;
    remaining -= usable;
    if (remaining <= 0) return taxes;
  }
  return taxes;
}

function taxFreiburg(amount: number, table: TarifRow[]): number {
  let last: TarifRow | undefined;
  for (const row of table) {
    if (row.amount >= amount) {
      if (!last || last.amount === 0) return 0;
      const percentDiff = row.percent - last.percent;
      const partCount = row.amount - last.amount;
      const finalPercent = ((amount - last.amount) * percentDiff) / partCount + last.percent;
      return (amount * finalPercent) / 100;
    }
    last = row;
  }
  // Über der letzten Stufe: letzter Satz gilt proportional
  return last ? (amount * last.percent) / 100 : 0;
}

function taxBund(amount: number, table: TarifRow[]): number {
  let last: TarifRow | undefined;
  for (const row of table) {
    if (row.amount <= amount) last = row;
    else break;
  }
  if (!last) return 0;
  return last.taxes + ((amount - last.amount) * last.percent) / 100;
}

// ---------- Formel-Tarife (z. B. Basel-Landschaft) ----------

function evaluateFormula(formula: string, wert: number): number {
  const tokens: string[] = [];
  let i = 0;
  while (i < formula.length) {
    const ch = formula[i];
    if (ch === ' ' || ch === '\t') {
      i++;
    } else if (ch === '$') {
      const end = formula.indexOf('$', i + 1);
      if (end === -1) throw new Error(`Ungültige Formel: ${formula}`);
      tokens.push(String(wert));
      i = end + 1;
    } else if (formula.startsWith('log', i)) {
      tokens.push('log');
      i += 3;
    } else if ('+-*/()'.includes(ch)) {
      tokens.push(ch);
      i++;
    } else if (/[\d.]/.test(ch)) {
      let num = '';
      while (i < formula.length && /[\d.eE]/.test(formula[i])) num += formula[i++];
      tokens.push(num);
    } else {
      throw new Error(`Unerwartetes Zeichen '${ch}' in Formel ${formula}`);
    }
  }
  let pos = 0;
  const expr = (): number => {
    let left = term();
    while (tokens[pos] === '+' || tokens[pos] === '-') {
      const op = tokens[pos++];
      const right = term();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };
  const term = (): number => {
    let left = unary();
    while (tokens[pos] === '*' || tokens[pos] === '/') {
      const op = tokens[pos++];
      const right = unary();
      left = op === '*' ? left * right : left / right;
    }
    return left;
  };
  const unary = (): number => {
    if (tokens[pos] === '-') {
      pos++;
      return -primary();
    }
    return primary();
  };
  const primary = (): number => {
    const t = tokens[pos];
    if (t === 'log') {
      pos++;
      return Math.log(primary());
    }
    if (t === '(') {
      pos++;
      const v = expr();
      pos++; // ')'
      return v;
    }
    pos++;
    return parseFloat(t);
  };
  return expr();
}

function taxFormel(amount: number, table: TarifRow[]): number {
  let last: TarifRow | undefined;
  for (const row of table) {
    if (row.amount <= amount) last = row;
    else break;
  }
  if (!last || !last.formula) return 0;
  const v = evaluateFormula(last.formula, amount);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

export function taxForAmount(amount: number, tarif: Tarif): number {
  let type = tarif.tableType;
  // Korrektur für fehlerhaft typisierte Tabellen (wie im ESTV-Rechner)
  if (type === 'ZUERICH' && tarif.table.some((t) => t.taxes > 0)) type = 'BUND';
  switch (type) {
    case 'FLATTAX':
      return (amount * (tarif.table[0]?.percent ?? 0)) / 100;
    case 'ZUERICH':
      return taxZurich(amount, tarif.table);
    case 'BUND':
      return taxBund(amount, tarif.table);
    case 'FREIBURG':
      return taxFreiburg(amount, tarif.table);
    case 'FORMEL':
      return taxFormel(amount, tarif.table);
    default:
      return 0;
  }
}

/**
 * Steuer gemäss Tarif (einfache Steuer, vor Steuerfuss).
 * Berücksichtigt Splitting und Rundung auf 100 Franken.
 */
export function taxForTarif(
  data: CantonTaxData,
  taxType: TaxTypeName,
  groups: TarifGroup[],
  taxable: number
): number {
  const found = findTarif(data, taxType, groups);
  if (!found || taxable <= 0) return 0;
  const [tarif, groupUsed] = found;
  const split = tarif.splitting > 0 && isSplittingGroup(groupUsed) ? tarif.splitting : 0;
  let base = split ? taxable / split : taxable;
  base = tarif.tableType === 'FORMEL' ? base : round100Down(base);
  const tax = taxForAmount(base, tarif);
  return split ? tax * split : tax;
}

export function hasTarif(data: CantonTaxData, taxType: TaxTypeName): boolean {
  return data.tarifs.some((t) => t.taxType === taxType);
}
