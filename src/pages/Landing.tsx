import { useMemo } from 'react';
import { href } from '../lib/router';
import { useAppState } from '../lib/store';
import { useSimulation } from '../lib/useSimulation';
import { createDefaultPlan, householdLabel } from '../engine/plan';
import { chf } from '../lib/format';
import { HeroRidges } from '../components/charts/HeroRidges';

const REPO_URL = 'https://github.com/JeffreyLungthok/Finanzkompass';

/** Beispielplan für Besucher ohne eigenen Plan: Standardwerte, Wohnort Zürich. */
function examplePlan() {
  return { ...createDefaultPlan(), location: { bfsId: 261, name: 'Zürich', cantonId: 26, canton: 'ZH' } };
}

export function Landing() {
  const { plan, started } = useAppState();
  const own = started && !!plan.location;
  const shown = useMemo(() => (own ? plan : examplePlan()), [own, plan]);
  const { result } = useSimulation(shown, { channel: 'hero' });
  const p1 = shown.persons[0];
  const age = shown.startYear - p1.birthYear;
  const retireYear = p1.birthYear + p1.retirementAge;
  const mc = result?.mc;

  return (
    <>
      <section className="hero">
        <div className="hero-text">
          <p className="eyebrow">Finanzplan für die Schweiz · Steuerjahr {shown.startYear}</p>
          <h1 className="display">Wohin führt dein Geld?</h1>
          <p className="lede">
            Tausend mögliche Zukünfte zeigen, wie robust dein Plan ist: mit den Steuern deiner Gemeinde, AHV, Pensionskasse
            und Säule 3a, bis zur Pension und darüber hinaus.
          </p>
          {own ? (
            <a className="ae-wegweiser hero-cta" href={href('check')}>
              <span className="ae-wegweiser__ziel">Zu deinem Ist-Check</span>
              <span className="ae-wegweiser__zeit">dein Plan</span>
            </a>
          ) : (
            <a className="ae-wegweiser hero-cta" href={href('plan/haushalt')}>
              <span className="ae-wegweiser__ziel">Start: Ist-Check</span>
              <span className="ae-wegweiser__zeit">10 min</span>
            </a>
          )}
          <p className="hero-secondary">
            {own ? (
              <>
                <a href={href('plan/haushalt')}>Plan bearbeiten</a> · <a href={href('reise')}>Lebenssimulation</a> (15 min)
              </>
            ) : (
              <>
                Oder zuerst <a href={href('info/methodik')}>nachlesen, wie der Finanzkompass rechnet</a>.
              </>
            )}
          </p>
        </div>

        <figure className="hero-figure">
          {mc ? (
            <HeroRidges
              years={mc.years}
              bands={mc.netWorth}
              birthYear={p1.birthYear}
              retirementYear={retireYear}
              endAge={shown.assumptions.endAge}
              successRate={mc.successRate}
            />
          ) : (
            <div className="hero-ridges hero-ridges--loading" aria-hidden="true">
              <div className="spinner-line" />
            </div>
          )}
          <figcaption>
            {own ? 'Dein Plan' : 'Beispiel'}: {householdLabel(shown).toLowerCase()}, {age} Jahre, {shown.location?.name}, Bruttolohn{' '}
            {chf(p1.grossSalary)}. Gesamtvermögen in heutigen Franken aus 1000 simulierten Zukünften.
          </figcaption>
        </figure>
      </section>

      <section className="trust" aria-label="Grundlagen">
        <dl>
          <div>
            <dt>Steuern</dt>
            <dd>Steuerjahr {shown.startYear}, alle 26 Kantone und 2110 Gemeinden</dd>
          </div>
          <div>
            <dt>Datenquellen</dt>
            <dd>Tarife, Abzüge und Steuerfüsse der ESTV; AHV- und BVG-Werte des BSV</dd>
          </div>
          <div>
            <dt>Offen</dt>
            <dd>
              Kostenlos und quelloffen (MIT): <a href={REPO_URL}>Code auf GitHub</a>
            </dd>
          </div>
        </dl>
      </section>

      <section className="steps" aria-labelledby="steps-title">
        <h2 id="steps-title">So funktioniert der Ist-Check</h2>
        <ol>
          <li>
            <span className="step-num">1</span>
            <h3>Plan erfassen</h3>
            <p>
              Wohnort, Lohn, Pensionskasse, Säule 3a, Vermögen, Hypothek und Ausgaben. Werte vom Lohnausweis, PK-Ausweis und der
              AHV-Rentenvorausberechnung machen den Plan genau. Selbständig? Lies zuerst die{' '}
              <a href={href('info/selbstaendige')}>Infos für Selbständige</a>.
            </p>
          </li>
          <li>
            <span className="step-num">2</span>
            <h3>Ergebnis ansehen</h3>
            <p>
              Tausend Zukünfte mit schwankenden Börsen, Teuerung und Zinsen. Du siehst, wie wahrscheinlich dein Geld reicht, wie
              gross die Rentenlücke ist und wo du Steuern sparen könntest.
            </p>
          </li>
          <li>
            <span className="step-num">3</span>
            <h3>Entscheide durchspielen</h3>
            <p>
              In der Lebenssimulation erlebst du einen Lebenslauf Jahr für Jahr: Hauskauf, Börsencrash, PK-Einkauf, Rente oder
              Kapital. Am Schluss zeigt ein Auszug, was jeder Entscheid bewirkt hat.
            </p>
          </li>
        </ol>
      </section>

      <section className="privacy" aria-labelledby="privacy-title">
        <h2 id="privacy-title">Deine Zahlen bleiben bei dir.</h2>
        <p>
          Kein Konto, kein Server, keine Datenbank. Alles wird in deinem Browser berechnet und gespeichert. Teilen kannst du
          deinen Plan über einen Link, in dem die Daten selbst stecken.
        </p>
      </section>
    </>
  );
}
