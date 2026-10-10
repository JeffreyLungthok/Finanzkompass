#!/usr/bin/env node
/**
 * Lädt die offiziellen Steuerdaten der ESTV (Tarife, Abzüge, Steuerfüsse aller Gemeinden)
 * und bereitet sie für den Browser auf.
 *
 *   node scripts/import-tax-data.mjs 2026              # aus data/raw/2026 aufbereiten
 *   node scripts/import-tax-data.mjs 2027 --download   # zuerst bei der ESTV herunterladen
 *
 * Quelle: Steuerrechner der Eidgenössischen Steuerverwaltung
 *   https://swisstaxcalculator.estv.admin.ch/#/taxdata
 * Die Download-Endpunkte und das Datenformat folgen dem MIT-lizenzierten Projekt
 * devbrains-com/swisstaxcalculator.
 *
 * Ausgabe: public/data/tax/<jahr>/<kantonId>.json, bund.json, locations.json, index.json
 */
import fs from 'node:fs';
import path from 'node:path';

const API_BASE =
  'https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV';

const ENDPOINTS = {
  tarifs: { path: '/API_exportManyTaxScales', body: (year) => ({ TaxYear: year, TaxGroupID: 88 }) },
  factors: { path: '/API_exportManySimpleRates', body: (year) => ({ TaxYear: year, TaxGroupID: 99 }) },
  deductions: { path: '/API_exportManyDeductions', body: (year) => ({ TaxYear: year, TaxGroupID: 88 }) }
};

const RELEVANT_TAX_TYPES = new Set(['EINKOMMENSSTEUER', 'VERMOEGENSSTEUER', 'VORSORGESTEUER']);

const args = process.argv.slice(2);
const download = args.includes('--download');
const years = args
  .filter((a) => !a.startsWith('--'))
  .flatMap((a) => a.split(','))
  .map((y) => Number.parseInt(y, 10))
  .filter((y) => Number.isFinite(y));

if (years.length === 0) {
  console.log('Verwendung: node scripts/import-tax-data.mjs <jahr>[,<jahr>] [--download]');
  process.exit(1);
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rawDir = (year) => path.join(root, 'data', 'raw', String(year));
const outDir = (year) => path.join(root, 'public', 'data', 'tax', String(year));

async function downloadYear(year) {
  fs.mkdirSync(rawDir(year), { recursive: true });
  for (const [name, endpoint] of Object.entries(ENDPOINTS)) {
    process.stdout.write(`  Lade ${name} ${year} … `);
    const res = await fetch(`${API_BASE}${endpoint.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(endpoint.body(year))
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} für ${name}`);
    const text = await res.text();
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed.response) || parsed.response.length === 0) {
      throw new Error(`Keine Daten für ${name} ${year} – ist das Steuerjahr schon publiziert?`);
    }
    fs.writeFileSync(path.join(rawDir(year), `${name}.json`), text);
    console.log(`${parsed.response.length} Einträge`);
  }
}

const readRaw = (year, name) =>
  JSON.parse(fs.readFileSync(path.join(rawDir(year), `${name}.json`), 'utf8')).response;

const cantonOf = (item) => {
  if (item.Target === 'BUND') return 0;
  if (['KANTON', 'GEMEINDE', 'KIRCHE'].includes(item.Target)) return item.Location.CantonID;
  return -1;
};

const round = (n) => Math.round(n * 1e6) / 1e6;

function importYear(year) {
  const tarifsRaw = readRaw(year, 'tarifs');
  const factorsRaw = readRaw(year, 'factors');
  const deductionsRaw = readRaw(year, 'deductions');

  /** @type {Record<number, any>} */
  const byCanton = {};
  const ensure = (id) =>
    (byCanton[id] ??= { year, cantonId: id, tarifs: [], deductions: {}, factors: {} });

  // Tarife: pro Kanton, Steuerart und Gruppe nur die erste Tabelle (Reihenfolge der ESTV bleibt erhalten)
  for (const t of tarifsRaw) {
    if (!RELEVANT_TAX_TYPES.has(t.TaxType)) continue;
    const id = cantonOf(t);
    if (id < 0) continue;
    const c = ensure(id);
    if (c.tarifs.some((x) => x.group === t.Group && x.taxType === t.TaxType)) continue;
    c.tarifs.push({
      tableType: t.TableType,
      taxType: t.TaxType,
      group: t.Group,
      splitting: t.Splitting,
      table: t.Table.map((r) => ({
        formula: r.Formula || undefined,
        taxes: round(r.Taxes),
        percent: round(r.Percent),
        amount: round(r.Amount)
      }))
    });
  }

  // Abzüge
  for (const d of deductionsRaw) {
    let id = -1;
    if (d.Target === 'BUND') id = 0;
    else if (d.Target === 'KANTON') id = d.Location.CantonID;
    if (id < 0) continue;
    const c = ensure(id);
    if (c.deductions[d.TaxType]) continue;
    c.deductions[d.TaxType] = d.Table.filter((i) => i.Format !== '').map((i) => ({
      id: i.Name.ID,
      format: i.Format,
      amount: i.Amount,
      percent: i.Percent,
      minimum: i.Minimum,
      maximum: i.Maximum,
      name: i.Name.DE
    }));
  }

  // Steuerfüsse der Gemeinden + Ortsverzeichnis
  const locations = [];
  for (const f of factorsRaw) {
    const loc = f.Location;
    const c = ensure(loc.CantonID);
    c.canton = loc.Canton;
    let fx = { ...f };
    // Basel-Stadt erhebt die Gemeindesteuer als Kantonssteuer (gleiche Korrektur wie im ESTV-Rechner)
    if (loc.BfsID === 2701) {
      fx.IncomeRateCanton += fx.IncomeRateCity;
      fx.IncomeRateCity = 0;
      fx.FortuneRateCanton += fx.FortuneRateCity;
      fx.FortuneRateCity = 0;
    }
    if (c.factors[loc.BfsID]) continue;
    c.factors[loc.BfsID] = {
      incomeCanton: fx.IncomeRateCanton,
      incomeCity: fx.IncomeRateCity,
      incomeProtestant: fx.IncomeRateProtestant,
      incomeRoman: fx.IncomeRateRoman,
      incomeChrist: fx.IncomeRateChrist,
      fortuneCanton: fx.FortuneRateCanton,
      fortuneCity: fx.FortuneRateCity,
      fortuneProtestant: fx.FortuneRateProtestant,
      fortuneRoman: fx.FortuneRateRoman,
      fortuneChrist: fx.FortuneRateChrist
    };
    locations.push([loc.BfsID, loc.BfsName, loc.CantonID, loc.Canton]);
  }

  locations.sort((a, b) => a[1].localeCompare(b[1], 'de'));

  fs.rmSync(outDir(year), { recursive: true, force: true });
  fs.mkdirSync(outDir(year), { recursive: true });
  let count = 0;
  for (const [id, data] of Object.entries(byCanton)) {
    const file = Number(id) === 0 ? 'bund.json' : `${id}.json`;
    fs.writeFileSync(path.join(outDir(year), file), JSON.stringify(data));
    count++;
  }
  fs.writeFileSync(path.join(outDir(year), 'locations.json'), JSON.stringify(locations));
  fs.writeFileSync(
    path.join(outDir(year), 'index.json'),
    JSON.stringify({ year, cantons: Object.keys(byCanton).length - 1, locations: locations.length, importedAt: new Date().toISOString().slice(0, 10) })
  );

  // Liste verfügbarer Jahre aktualisieren
  const taxRoot = path.join(root, 'public', 'data', 'tax');
  const available = fs
    .readdirSync(taxRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map((d) => Number(d.name))
    .sort();
  fs.writeFileSync(path.join(taxRoot, 'years.json'), JSON.stringify({ years: available, latest: available.at(-1) }));

  console.log(`  ${year}: ${count - 1} Kantone + Bund, ${locations.length} Gemeinden aufbereitet`);
}

for (const year of years) {
  console.log(`== Steuerjahr ${year}`);
  if (download) await downloadYear(year);
  importYear(year);
}
