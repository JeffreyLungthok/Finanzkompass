# Finanzkompass

Ein kostenloser Finanzplan für Private in der Schweiz – bis zur Pension und darüber hinaus.

- **Steuern jeder Gemeinde:** Bundes-, Kantons-, Gemeinde- und Kirchensteuer auf Einkommen und Vermögen sowie Kapitalleistungssteuer, mit den offiziellen Tarifen, Abzügen und Steuerfüssen der ESTV für alle 2110 Gemeinden.
- **Vorsorge:** AHV (inkl. 13. Rente, Vorbezug/Aufschub, Plafonierung), Pensionskasse (Sparbeiträge nach Alter, Umwandlung, Kapitalbezug, Einkäufe mit Sperrfrist), Säule 3a (gestaffelte Bezüge), AHV-Beiträge für Nichterwerbstätige bei Frühpensionierung.
- **Wohnen:** Hypotheken mit Zinsbindung, direkte und indirekte Amortisation, Tragbarkeit, Eigenmietwert und der Systemwechsel ab 2029, Handänderungs- und Grundstückgewinnsteuer (vereinfacht).
- **Ist-Check:** Monte-Carlo-Simulation mit 1000 Zukünften, «Höhenprofil» des Vermögens, Rentenlücke, Ausgaben-Spielraum, «Was wäre wenn»-Regler und konkrete Hinweise.
- **Lebenssimulation:** Ein zufälliger Börsenverlauf, Entscheide an Wegmarken (3a, Anlagestrategie, Familie, Hauskauf, Börsencrash, PK-Einkauf, Pensum, Pensionsalter, Rente oder Kapital, AHV-Bezug, Schenkung, Wohnen im Alter) und am Schluss ein Lebensauszug mit der Wirkung jedes Entscheids.
- **Privat by design:** Kein Server, kein Konto. Alles läuft im Browser, gespeichert wird im localStorage. Geteilt wird über einen Link, der den Plan komprimiert hinter dem `#` enthält.

Alle Beträge sind in heutigen Franken (Kaufkraft 2026).

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev        # Entwicklungsserver auf http://localhost:5173
npm test           # Tests der Rechen-Engine
npm run build      # fertige Seite in dist/
npm run preview    # gebaute Seite lokal ansehen
```

## Auf GitHub Pages veröffentlichen (gratis)

1. Neues Repository auf GitHub anlegen und den Inhalt dieses Ordners pushen (Branch `main`).
2. Im Repository unter **Settings → Pages** bei «Source» **GitHub Actions** wählen.
3. Der Workflow `.github/workflows/deploy.yml` testet, baut und veröffentlicht die Seite bei jedem Push. Die Adresse lautet `https://<benutzer>.github.io/<repository>/`.

Die Seite verwendet relative Pfade und Hash-Routen (`#/check`), daher ist keine weitere Konfiguration nötig.

## Steuerdaten aktualisieren

Die Daten liegen aufbereitet in `public/data/tax/<jahr>/` (eine Datei pro Kanton, `bund.json`, `locations.json`). Quelle ist die Schnittstelle des ESTV-Steuerrechners.

- **Automatisch:** `.github/workflows/update-tax-data.yml` versucht von Januar bis Mai monatlich, das aktuelle Steuerjahr zu laden, und erstellt einen Pull Request. Manuell auslösbar unter **Actions → Steuerdaten aktualisieren** (optional mit Jahr).
- **Von Hand:** `npm run steuerdaten -- 2027 --download` lädt das Jahr bei der ESTV und bereitet es auf. Ohne `--download` werden vorhandene Rohdaten aus `data/raw/<jahr>/` verwendet.

Beim Jahreswechsel zusätzlich prüfen:

- `src/engine/params.ts`: AHV-, BVG- und 3a-Eckwerte, Familienzulagen, Handänderungssteuer
- `src/engine/tax/incomeTax.ts`: Reduktion der Bundessteuer pro Kind (`BUND_CHILD_TAX_REDUCTION`)

Die App nimmt automatisch das neueste Jahr aus `public/data/tax/years.json`.

## Aufbau

```
src/
  engine/                 Rechen-Engine (ohne React, läuft im Web Worker)
    tax/                  Steuer-Engine: Tarife, Abzüge, Kapitalleistungssteuer
    params.ts             Eckwerte 2026 der Sozialversicherungen
    plan.ts               Datenmodell des Finanzplans
    simulate.ts           Jahr-für-Jahr-Simulation eines Haushalts
    market.ts             Kapitalmarktmodell (fette Ränder, Teuerung AR(1))
    montecarlo.ts         Monte-Carlo, Bandbreiten, Ausgaben-Spielraum
    insights.ts           Hinweise und Überraschungen
    journey.ts            Lebenssimulation: Kartenkatalog, Entscheide als Patches
    specialTaxes.ts       Handänderungs-, Grundstückgewinn-, Erbschaftssteuer
    sim.worker.ts         Web Worker
  components/             Formularfelder, Diagramme, Wegweiser
  pages/                  Startseite, Plan erfassen, Ist-Check, Lebenssimulation, Infos
  lib/                    Zustand, Router, Teilen-Link, Datenladen
scripts/import-tax-data.mjs   ESTV-Daten laden und aufbereiten
public/data/tax/              aufbereitete Steuerdaten
data/raw/                     Rohdaten der ESTV
```

## Genauigkeit und Grenzen

- Die Steuerberechnung wurde mit Referenzwerten des ESTV-Rechners geprüft (Einkommens-, Vermögens- und Kapitalleistungssteuer für mehrere Kantone). Individuelle Abzüge wie Weiterbildung, Spenden oder Krankheitskosten sind nicht erfasst.
- Die kantonalen Berechnungsarten der Kapitalleistungssteuer entsprechen dem Stand 2022, die Tarife sind aktuell.
- Nicht modelliert: Ergänzungsleistungen, Hinterlassenen- und Invalidenleistungen, Pflegekosten, Sterblichkeit (beide Personen leben bis zum Planungshorizont).
- Handänderungs- und Grundstückgewinnsteuer sind vereinfacht, Erbschaftssteuern nur als Hinweis.

Der Finanzkompass ist ein Planungswerkzeug und keine Finanz-, Steuer- oder Anlageberatung.

## Lizenz

MIT, siehe `LICENSE`. Hinweise zu Drittsoftware und Daten in `THIRD_PARTY_NOTICES.md`.
