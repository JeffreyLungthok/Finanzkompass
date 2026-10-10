# Hinweise zu Drittsoftware und Daten

## Steuerdaten

Die Steuertarife, Abzüge und Steuerfüsse stammen aus dem Steuerrechner der
Eidgenössischen Steuerverwaltung ESTV (https://swisstaxcalculator.estv.admin.ch/#/taxdata).

## swisstaxcalculator (devbrains-com)

Die Tarifberechnung (`src/engine/tax/tariff.ts`), die Struktur der Abzüge
(`src/engine/tax/incomeTax.ts`), die kantonalen Regeln zur Kapitalleistungssteuer
(`src/engine/tax/capitalTax.ts`) sowie die Download-Endpunkte im Import-Skript sind
an das Projekt https://github.com/devbrains-com/swisstaxcalculator angelehnt bzw.
daraus portiert. Lizenz:

```
MIT License

Copyright (c) 2025 devbrains-com

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Schriften

Atkinson Hyperlegible Next (Braille Institute) und Barlow Condensed (Jeremy Tribby),
beide unter der SIL Open Font License, eingebunden über @fontsource.
