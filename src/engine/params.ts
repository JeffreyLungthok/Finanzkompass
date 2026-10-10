/**
 * Schweizer Eckwerte der Sozialversicherungen, Stand 2026.
 * Quellen: BSV «Renten und Beiträge ab 1.1.2026», PwC «Sozialversicherungen 2026»,
 * ahv-iv.ch (13. AHV-Rente), ESTV (Bundessteuer-Tarif 2026).
 * Werte sind in Franken von 2026 – die Simulation rechnet in heutigen Franken.
 */
export const PARAMS = {
  year: 2026,

  ahv: {
    /** Arbeitnehmeranteil AHV/IV/EO */
    employeeRate: 0.053,
    minPensionMonthly: 1260,
    maxPensionMonthly: 2520,
    /** Plafonierung Ehepaar: 150 % der Maximalrente */
    coupleMaxMonthly: 3780,
    /** 13. AHV-Rente ab Dezember 2026: ein Zwölftel der Jahresrente */
    thirteenthFromYear: 2026,
    referenceAge: 65,
    earliestClaimAge: 63,
    latestClaimAge: 70,
    /** Kürzung pro Vorbezugsjahr (ab Jahrgang 1964 bzw. Männer) */
    earlyReductionPerYear: 0.068,
    /** Zuschlag bei Aufschub nach Anzahl Jahren */
    deferralSupplement: [0, 0.052, 0.108, 0.171, 0.24, 0.315],
    /** Beiträge Nichterwerbstätige */
    nonEmployed: {
      min: 530,
      max: 26500,
      threshold: 350000,
      stepWealth: 50000,
      stepContribution: 106,
      pensionMultiplier: 20
    }
  },

  alv: { rate: 0.011, maxSalary: 148200 },
  /** Nichtberufsunfall: typischer Arbeitnehmeranteil (variiert je Arbeitgeber) */
  nbu: { rate: 0.01, maxSalary: 148200 },

  bvg: {
    entryThreshold: 22680,
    coordinationDeduction: 26460,
    upperLimit: 90720,
    minCoordinatedSalary: 3780,
    maxCoordinatedSalary: 64260,
    minInterestRate: 0.0125,
    minConversionRate: 0.068,
    /** Altersgutschriften nach BVG (Minimum), Total Arbeitgeber + Arbeitnehmer */
    savingsCredits: [
      { from: 25, to: 34, rate: 0.07 },
      { from: 35, to: 44, rate: 0.1 },
      { from: 45, to: 54, rate: 0.15 },
      { from: 55, to: 65, rate: 0.18 }
    ],
    earliestRetirementAge: 58,
    /** Rückgang Umwandlungssatz pro Jahr Frühpensionierung (typischer Wert) */
    conversionReductionPerYear: 0.002,
    /** Sperrfrist für Kapitalbezug nach einem Einkauf */
    buyInLockYears: 3
  },

  pillar3a: {
    maxWithPensionFund: 7258,
    maxWithoutPensionFund: 36288,
    /** Frühester Bezug: 5 Jahre vor dem Referenzalter */
    earliestWithdrawalAge: 60,
    /** Nachzahlungen für Lücken ab 2025 möglich, bis 10 Jahre zurück */
    retroFromGapYear: 2025
  },

  familyAllowance: {
    /** Bundesrechtliches Minimum pro Monat; Kantone zahlen teils mehr */
    childMonthly: 215,
    educationMonthly: 268,
    childUntilAge: 16,
    educationUntilAge: 25
  },

  mortgage: {
    /** Kalkulatorischer Zins für die Tragbarkeitsrechnung der Banken */
    calcRate: 0.05,
    /** Nebenkosten/Unterhalt in der Tragbarkeitsrechnung */
    calcMaintenance: 0.01,
    maxAffordabilityRatio: 1 / 3,
    firstMortgageLtv: 2 / 3,
    maxLtv: 0.8,
    secondMortgageAmortizationYears: 15,
    minHardEquity: 0.1
  },

  wohneigentum: {
    /** Systemwechsel: Eigenmietwert und Schuldzinsabzug für selbstbewohntes Eigentum entfallen ab */
    reformYear: 2029,
    /** Abzug für Ersterwerber nach dem Systemwechsel (erstes Jahr, danach -10 % pro Jahr) */
    firstBuyerDeductionMarried: 10000,
    firstBuyerDeductionSingle: 5000,
    firstBuyerYears: 10
  }
} as const;

/** Handänderungssteuer (Käuferanteil, grobe Sätze) pro Kanton-ID der ESTV. */
export const TRANSFER_TAX: Record<number, { rate: number; note?: string; exemptPrimary?: number }> = {
  1: { rate: 0, note: 'keine Handänderungssteuer, nur Gebühren' }, // AG
  2: { rate: 0.01 }, // AI
  3: { rate: 0.02, note: 'je nach Gemeinde bis 2 %' }, // AR
  4: { rate: 0.018, note: 'selbstbewohnt: die ersten 800 000 Franken sind befreit', exemptPrimary: 800000 }, // BE
  5: { rate: 0.0125, note: '2,5 %, je hälftig Käufer und Verkäufer' }, // BL
  6: { rate: 0.03 }, // BS
  7: { rate: 0.015 }, // FR
  8: { rate: 0.03 }, // GE
  9: { rate: 0, note: 'keine Handänderungssteuer, nur Gebühren' }, // GL
  10: { rate: 0.02, note: 'je nach Gemeinde bis 2 %' }, // GR
  11: { rate: 0.021 }, // JU
  12: { rate: 0.015 }, // LU
  13: { rate: 0.033 }, // NE
  14: { rate: 0.01 }, // NW
  15: { rate: 0.0075, note: '1,5 %, je hälftig Käufer und Verkäufer' }, // OW
  16: { rate: 0.01 }, // SG
  17: { rate: 0, note: 'keine Handänderungssteuer, nur Gebühren' }, // SH
  18: { rate: 0.022 }, // SO
  19: { rate: 0, note: 'keine Handänderungssteuer' }, // SZ
  20: { rate: 0.01 }, // TG
  21: { rate: 0, note: 'keine Handänderungssteuer, nur Gebühren' }, // TI
  22: { rate: 0, note: 'keine Handänderungssteuer, nur Gebühren' }, // UR
  23: { rate: 0.022, note: 'plus Gemeindezuschlag bis 1,1 %' }, // VD
  24: { rate: 0.0125, note: '1–1,5 % je nach Wert' }, // VS
  25: { rate: 0, note: 'keine Handänderungssteuer, nur Gebühren' }, // ZG
  26: { rate: 0, note: 'keine Handänderungssteuer, nur Notariats- und Grundbuchgebühren' } // ZH
};

/** Kantone, die Erbschaften an Nachkommen besteuern (Ehegatten sind überall befreit). */
export const INHERITANCE_DESCENDANTS_TAXED: Record<number, string> = {
  2: 'Appenzell Innerrhoden besteuert Erbschaften an Nachkommen.',
  12: 'Luzern: Gemeinden können eine Nachkommenserbschaftssteuer erheben.',
  13: 'Neuenburg besteuert Erbschaften an Nachkommen.',
  23: 'Waadt besteuert Erbschaften an Nachkommen (mit Freibetrag).'
};
/** Kantone ohne Erbschafts- und Schenkungssteuer */
export const NO_INHERITANCE_TAX = new Set([19, 15]);

export const CANTON_NAMES: Record<number, string> = {
  1: 'Aargau', 2: 'Appenzell Innerrhoden', 3: 'Appenzell Ausserrhoden', 4: 'Bern', 5: 'Basel-Landschaft',
  6: 'Basel-Stadt', 7: 'Freiburg', 8: 'Genf', 9: 'Glarus', 10: 'Graubünden', 11: 'Jura', 12: 'Luzern',
  13: 'Neuenburg', 14: 'Nidwalden', 15: 'Obwalden', 16: 'St. Gallen', 17: 'Schaffhausen', 18: 'Solothurn',
  19: 'Schwyz', 20: 'Thurgau', 21: 'Tessin', 22: 'Uri', 23: 'Waadt', 24: 'Wallis', 25: 'Zug', 26: 'Zürich'
};

/** Referenzalter Frauen der Übergangsgeneration (AHV 21) */
export function ahvReferenceAge(birthYear: number, sex: 'f' | 'm'): number {
  if (sex === 'm' || birthYear >= 1964) return 65;
  if (birthYear <= 1960) return 64;
  return 64 + (birthYear - 1960) * 0.25; // 1961: 64.25, 1962: 64.5, 1963: 64.75
}
