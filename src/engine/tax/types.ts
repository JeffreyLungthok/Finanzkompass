/**
 * Datentypen der Steuer-Engine. Die Tarif-, Abzugs- und Steuerfussdaten stammen
 * aus dem offiziellen Steuerrechner der ESTV (siehe scripts/import-tax-data.mjs).
 */

export type TaxTypeName = 'EINKOMMENSSTEUER' | 'VERMOEGENSSTEUER' | 'VORSORGESTEUER';
export type TarifTableType = 'ZUERICH' | 'FLATTAX' | 'BUND' | 'FREIBURG' | 'FORMEL';

export interface TarifRow {
  formula?: string;
  taxes: number;
  percent: number;
  amount: number;
}

export interface Tarif {
  tableType: TarifTableType;
  taxType: TaxTypeName;
  group: string;
  splitting: number;
  table: TarifRow[];
}

export interface DeductionItem {
  id: string;
  format: string;
  amount: number;
  percent: number;
  minimum: number;
  maximum: number;
  name: string;
}

export interface Factors {
  incomeCanton: number;
  incomeCity: number;
  incomeProtestant: number;
  incomeRoman: number;
  incomeChrist: number;
  fortuneCanton: number;
  fortuneCity: number;
  fortuneProtestant: number;
  fortuneRoman: number;
  fortuneChrist: number;
}

export interface CantonTaxData {
  year: number;
  cantonId: number;
  canton?: string;
  tarifs: Tarif[];
  deductions: Partial<Record<'EINKOMMENSSTEUER' | 'VERMOEGENSSTEUER', DeductionItem[]>>;
  factors: Record<string, Factors>;
}

/** Alles, was für die Steuerberechnung an einem Wohnort nötig ist. */
export interface TaxContext {
  year: number;
  bfsId: number;
  cantonId: number;
  bund: CantonTaxData;
  canton: CantonTaxData;
  factors: Factors;
}

/** s = alleinstehend, m = verheiratet / eingetragene Partnerschaft, c = Konkubinat */
export type TaxRelationship = 's' | 'm' | 'c';
export type Confession = 'protestant' | 'roman' | 'christ' | 'none';

export interface TaxPersonInput {
  confession: Confession;
  /** Nettolohn nach AHV/ALV/NBU und PK-Beiträgen (Lohnausweis Ziffer 11). */
  employmentNet: number;
  /** Übrige steuerbare Einkünfte der Person (AHV-Rente, PK-Rente, Kinderzulagen …). */
  otherIncome: number;
  /** Einzahlung Säule 3a im Jahr. */
  pillar3a: number;
  /** Einkauf in die Pensionskasse (voll abzugsfähig). */
  pkBuyIn: number;
  /** Hat die Person eine Pensionskasse? Bestimmt das 3a-Maximum. */
  hasPensionFund: boolean;
  /** Bezahlte Prämien (Krankenkasse etc.) – wird auf das Maximum begrenzt. */
  insurancePremiums?: number;
  /** Fahrkosten zum Arbeitsplatz pro Jahr. */
  travelExpenses?: number;
  /** Pensum in Prozent (0–100) für Verpflegungsabzug. */
  workload?: number;
}

export interface TaxSubjectInput {
  relationship: TaxRelationship;
  children: number;
  persons: TaxPersonInput[];
  /** Gemeinsame steuerbare Einkünfte: Vermögensertrag, Eigenmietwert … */
  householdIncome: number;
  /** davon Vermögensertrag (für die Begrenzung des Schuldzinsabzugs). */
  investmentIncome: number;
  debtInterest: number;
  maintenanceRealEstate: number;
  childcareCosts: number;
  otherDeductions: number;
  /** Reinvermögen vor Abzügen (Steuerwerte). */
  fortune: number;
  /** Kurswert der Wertschriften (für pauschale Verwaltungskosten). */
  securities: number;
  /** Krankenkassenprämien Kinder total. */
  insurancePremiumsKids?: number;
}

export interface TaxResult {
  incomeBund: number;
  incomeCanton: number;
  incomeCity: number;
  incomeChurch: number;
  fortuneCanton: number;
  fortuneCity: number;
  fortuneChurch: number;
  personnel: number;
  total: number;
  taxableIncomeBund: number;
  taxableIncomeCanton: number;
  taxableFortune: number;
}

export interface CapitalTaxResult {
  bund: number;
  canton: number;
  city: number;
  church: number;
  total: number;
}
