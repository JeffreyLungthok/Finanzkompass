import { ShieldCheck } from 'lucide-react';
import { Signpost } from '../components/Signpost';
import { href } from '../lib/router';
import { useAppState } from '../lib/store';

export function Landing() {
  const { plan, started } = useAppState();
  const p1 = plan.persons[0];
  const age = plan.startYear - p1.birthYear;
  const retireYear = p1.birthYear + p1.retirementAge;

  return (
    <>
      <section className="hero">
        <div>
          <h1 className="display">Wohin führt dein Geld?</h1>
          <p className="lede">
            Plane deine Finanzen bis zur Pension und darüber hinaus – mit den Steuern deiner Gemeinde, AHV, Pensionskasse
            und Säule 3a. Tausend mögliche Zukünfte zeigen, wie robust dein Plan ist und wo Überraschungen lauern.
          </p>
          <div className="row">
            {started ? (
              <>
                <a className="btn" href={href('check')}>
                  Wo stehe ich?
                </a>
                <a className="btn btn-secondary" href={href('plan/haushalt')}>
                  Plan bearbeiten
                </a>
              </>
            ) : (
              <>
                <a className="btn" href={href('plan/haushalt')}>
                  Plan erfassen
                </a>
                <a className="btn btn-secondary" href={href('info/methodik')}>
                  So rechnet der Finanzkompass
                </a>
              </>
            )}
          </div>
        </div>
        <div className="hero-visual ae-textured ae-textured--paper sheet">
          {started && plan.location ? (
            <Signpost
              label="Dein Weg"
              here={{ label: plan.location.name, value: `Alter ${age}` }}
              signs={[
                { label: `Pension ${retireYear}`, time: `${retireYear - plan.startYear} Jahre`, href: href('check') },
                { label: `Alter ${plan.assumptions.endAge}`, time: `${plan.assumptions.endAge - age} Jahre`, sub: 'Planungshorizont', href: href('reise') },
                { label: 'Infos', time: '', direction: 'left', href: href('info/heutige-franken') }
              ]}
            />
          ) : (
            <Signpost
              label="Wegweiser"
              here={{ label: 'Dein Standort', value: 'heute' }}
              signs={[
                { label: 'Ist-Check', time: '10 Min.', sub: 'Steuern, Vorsorge, Vermögen bis 95', href: href('plan/haushalt') },
                { label: 'Lebenssimulation', time: '15 Min.', sub: 'Entscheide durchspielen', href: href('reise') },
                { label: 'Infos für Selbständige', time: '', direction: 'left', href: href('info/selbstaendige') }
              ]}
            />
          )}
        </div>
      </section>

      <section className="paths" aria-label="Was du hier machen kannst">
        <div className="path">
          <span className="path-kicker">01</span>
          <h3>Plan erfassen</h3>
          <p>
            Wohnort, Lohn, Pensionskasse, Säule 3a, Vermögen, Hypothek und Ausgaben. Werte vom Lohnausweis, PK-Ausweis und
            der AHV-Rentenvorausberechnung machen den Plan genau.
          </p>
          <a href={href('plan/haushalt')}>Mit dem Haushalt beginnen</a>
        </div>
        <div className="path">
          <span className="path-kicker">02</span>
          <h3>Wo stehe ich?</h3>
          <p>
            Der Ist-Check rechnet tausend Zukünfte mit schwankenden Börsen, Teuerung und Zinsen. Du siehst, wie
            wahrscheinlich dein Geld reicht, wie gross die Rentenlücke ist und wo du Steuern sparen könntest.
          </p>
          <a href={href('check')}>Zum Ist-Check</a>
        </div>
        <div className="path">
          <span className="path-kicker">03</span>
          <h3>Lebenssimulation</h3>
          <p>
            Durchlebe einen möglichen Lebenslauf Jahr für Jahr: Hauskauf, Börsencrash, Einkauf in die Pensionskasse,
            Rente oder Kapital. Am Schluss erhältst du einen Auszug deiner Entscheide und ihrer Wirkung.
          </p>
          <a href={href('reise')}>Zur Lebenssimulation</a>
        </div>
      </section>

      <div className="notice" style={{ marginTop: 32 }}>
        <ShieldCheck size={20} />
        <p>
          Deine Zahlen bleiben in deinem Browser. Es gibt kein Konto und keinen Server, der deine Daten speichert. Teilen
          kannst du deinen Plan über einen Link, in dem die Daten selbst stecken.
        </p>
      </div>
    </>
  );
}
