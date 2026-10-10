import { href } from '../lib/router';
import { chf } from '../lib/format';
import { PARAMS } from '../engine/params';

const TOPICS = [
  { id: 'heutige-franken', label: 'Heutige Franken' },
  { id: 'ahv', label: 'AHV-Rente herausfinden' },
  { id: 'spezialsteuern', label: 'Spezialsteuern' },
  { id: 'selbstaendige', label: 'Für Selbständige' },
  { id: 'methodik', label: 'Methodik & Annahmen' },
  { id: 'datenschutz', label: 'Datenschutz & Haftung' }
];

export function InfoPage({ topic }: { topic: string }) {
  const current = TOPICS.find((t) => t.id === topic) ?? TOPICS[0];
  return (
    <div className="info-layout">
      <nav className="info-nav" aria-label="Infos">
        {TOPICS.map((t) => (
          <a key={t.id} href={href(`info/${t.id}`)} aria-current={t.id === current.id ? 'page' : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
      <article className="prose panel">
        {current.id === 'heutige-franken' && <TodayFrancs />}
        {current.id === 'ahv' && <Ahv />}
        {current.id === 'spezialsteuern' && <SpecialTaxes />}
        {current.id === 'selbstaendige' && <SelfEmployed />}
        {current.id === 'methodik' && <Method />}
        {current.id === 'datenschutz' && <Privacy />}
      </article>
    </div>
  );
}

function TodayFrancs() {
  const f25 = Math.pow(1.01, 25);
  return (
    <>
      <h2>Was «heutige Franken» bedeutet</h2>
      <p>
        Alle Beträge im Finanzkompass sind in der Kaufkraft von {PARAMS.year} angegeben. Wenn der Plan zeigt, dass du mit 65 rund
        CHF 500’000 frei verfügbar hast, dann kannst du dir damit so viel kaufen wie heute mit CHF 500’000. Auf deinem
        Kontoauszug wird dann eine grössere Zahl stehen – weil die Preise bis dahin gestiegen sind.
      </p>
      <div className="example">
        <div>
          <span className="small">Heute</span>
          <span className="num">{chf(100000)}</span>
          <span className="small">Kaufkraft {PARAMS.year}</span>
        </div>
        <div>
          <span className="small">In 25 Jahren bei 1 % Teuerung</span>
          <span className="num">{chf(100000 * f25)}</span>
          <span className="small">nötig für die gleiche Kaufkraft</span>
        </div>
        <div>
          <span className="small">Im Finanzkompass angezeigt</span>
          <span className="num">{chf(100000)}</span>
          <span className="small">in heutigen Franken</span>
        </div>
      </div>
      <h3>Warum so gerechnet wird</h3>
      <ul>
        <li>Du kannst die Zahlen direkt mit deinem heutigen Budget vergleichen. CHF 4’000 Ausgaben pro Monat im Jahr 2060 bedeuten denselben Lebensstandard wie CHF 4’000 heute.</li>
        <li>Renditen sind deshalb <strong>real</strong> angegeben, also nach Abzug der Teuerung. 4 % reale Aktienrendite entsprechen bei 1 % Teuerung rund 5 % nominal.</li>
        <li>Die Lohnentwicklung bedeutet Wachstum über der Teuerung. 0 % heisst: Dein Lohn steigt genau mit den Preisen.</li>
      </ul>
      <h3>Wo die Teuerung trotzdem sichtbar wird</h3>
      <ul>
        <li><strong>PK-Rente:</strong> Pensionskassen passen laufende Renten meist nicht an die Teuerung an. In heutigen Franken sinkt die PK-Rente deshalb jedes Jahr ein wenig.</li>
        <li><strong>Hypothek:</strong> Die Schuld bleibt nominal gleich und wird real jedes Jahr etwas kleiner.</li>
        <li><strong>Konto:</strong> Liegt der Zins unter der Teuerung, verliert das Geld real an Wert.</li>
        <li><strong>Steuern:</strong> Bund und Kantone gleichen die kalte Progression aus. Deshalb werden die Tarife {PARAMS.year} auf die realen Beträge angewendet.</li>
      </ul>
      <p className="muted">
        Die Teuerung schwankt in der Simulation um den eingestellten Mittelwert (Voreinstellung 1 %). Ändern kannst du das unter{' '}
        <a href={href('plan/annahmen')}>Annahmen</a>.
      </p>
    </>
  );
}

function Ahv() {
  return (
    <>
      <h2>So findest du deine AHV-Rente heraus</h2>
      <p>
        Die AHV-Rente ist für die meisten Haushalte die wichtigste Einnahme im Alter. Sie hängt von deinen Beitragsjahren und dem
        durchschnittlichen Einkommen ab. Statt sie zu schätzen, lohnt sich ein Blick in die offiziellen Unterlagen.
      </p>
      <ol className="steps">
        <li>
          <strong>Kontoauszug bestellen (IK-Auszug).</strong> Auf{' '}
          <a href="https://www.ahv-iv.ch/de/Formulare/Bestellung-Kontoauszug/Schweiz" target="_blank" rel="noreferrer">
            ahv-iv.ch
          </a>{' '}
          wählst du eine Ausgleichskasse – am einfachsten die deines Arbeitgebers – und bestellst den Auszug. Er ist kostenlos und
          kommt per Post. Du brauchst deine AHV-Nummer; sie steht auf der Krankenversicherungskarte.
        </li>
        <li>
          <strong>Auf Lücken prüfen.</strong> Fehlt ein Jahr, etwa wegen Studium oder Auslandaufenthalt, kannst du Beiträge bis fünf
          Jahre zurück nachzahlen. Jedes fehlende Jahr kürzt die Rente um rund 1/44, also etwa 2,3 %.
        </li>
        <li>
          <strong>Rentenvorausberechnung beantragen.</strong> Die Ausgleichskasse rechnet deine künftige Rente auf Basis deines
          Kontos hoch. Das Formular findest du ebenfalls auf ahv-iv.ch; die Berechnung ist in der Regel kostenlos. Ehepaare beantragen
          am besten eine gemeinsame Berechnung, weil Einkommen geteilt (Splitting) und die Renten plafoniert werden.
        </li>
        <li>
          <strong>Schnell schätzen.</strong> Für eine erste Grössenordnung gibt es den Online-Rechner{' '}
          <a href="https://www.acor-avs.ch/" target="_blank" rel="noreferrer">
            ESCAL
          </a>{' '}
          der Ausgleichskassen. Er ist weniger genau als die Vorausberechnung.
        </li>
        <li>
          <strong>Im Finanzkompass eintragen.</strong> Trage die monatliche Einzelrente beim Referenzalter ein, ohne Plafonierung.
          Die 13. AHV-Rente (ab Dezember 2026 ein Zwölftel der Jahresrente) und die Plafonierung für Ehepaare rechnet das Tool selbst.
        </li>
      </ol>
      <h3>Faustregeln {PARAMS.year}</h3>
      <table>
        <tbody>
          <tr>
            <th>Minimale Einzelrente</th>
            <td>{chf(PARAMS.ahv.minPensionMonthly)} pro Monat</td>
          </tr>
          <tr>
            <th>Maximale Einzelrente</th>
            <td>{chf(PARAMS.ahv.maxPensionMonthly)} pro Monat – mit 44 Beitragsjahren und einem durchschnittlichen Einkommen ab rund CHF 90’720</td>
          </tr>
          <tr>
            <th>Ehepaare zusammen</th>
            <td>höchstens {chf(PARAMS.ahv.coupleMaxMonthly)} pro Monat (150 %)</td>
          </tr>
          <tr>
            <th>Vorbezug</th>
            <td>ab 63, Kürzung 6,8 % pro Jahr, lebenslang</td>
          </tr>
          <tr>
            <th>Aufschub</th>
            <td>bis 70, Zuschlag 5,2 % nach einem Jahr bis 31,5 % nach fünf Jahren</td>
          </tr>
        </tbody>
      </table>
      <p className="muted">Quellen: BSV, Renten und Beiträge ab 1.1.2026; ahv-iv.ch.</p>
    </>
  );
}

function SpecialTaxes() {
  return (
    <>
      <h2>Spezialsteuern im Lebenslauf</h2>
      <p>Neben Einkommens- und Vermögenssteuer gibt es Steuern, die nur bei bestimmten Ereignissen anfallen. Sie werden oft unterschätzt.</p>
      <h3>Kapitalleistungssteuer</h3>
      <p>
        Bezüge aus Pensionskasse und Säule 3a – auch Vorbezüge für Wohneigentum – werden separat vom übrigen Einkommen und zu einem
        reduzierten Satz besteuert. Der Bund nimmt einen Fünftel des ordentlichen Tarifs, die Kantone haben eigene Regeln. Die Steuer
        ist progressiv, und alle Bezüge eines Jahres werden zusammengezählt, bei Ehepaaren die beider Partner.
        <strong> Im Finanzkompass:</strong> exakt nach den kantonalen Berechnungsarten mit den Tarifen der ESTV.
      </p>
      <h3>Handänderungssteuer</h3>
      <p>
        Beim Kauf einer Liegenschaft verlangen viele Kantone eine Steuer von rund 1 bis 3,3 % des Kaufpreises, dazu kommen Notariats-
        und Grundbuchgebühren. Zürich, Zug, Schwyz, Aargau und einige andere Kantone erheben keine Handänderungssteuer.
        <strong> Im Finanzkompass:</strong> vereinfachte Sätze pro Kanton.
      </p>
      <h3>Eigenmietwert und Systemwechsel</h3>
      <p>
        Bis Ende 2028 versteuern Eigentümer den Eigenmietwert ihres Eigenheims und können dafür Schuldzinsen und Unterhaltskosten
        abziehen. Ab 2029 fallen Eigenmietwert und diese Abzüge für selbstbewohntes Eigentum weg. Ersterwerber dürfen während zehn
        Jahren einen sinkenden Schuldzinsabzug machen (im ersten Jahr bis CHF 10’000 für Ehepaare, CHF 5’000 für Alleinstehende).
        Kantone können auf Zweitliegenschaften eine Objektsteuer einführen. <strong>Im Finanzkompass:</strong> berücksichtigt, das
        Jahr des Wechsels lässt sich anpassen.
      </p>
      <h3>Grundstückgewinnsteuer</h3>
      <p>
        Wer eine Liegenschaft mit Gewinn verkauft, zahlt darauf eine kantonale Steuer. Kurze Besitzdauer kostet einen Zuschlag, lange
        Besitzdauer bringt Ermässigungen. Wird der Erlös innert Frist wieder in selbstbewohntes Eigentum investiert, kann die Steuer
        aufgeschoben werden. <strong>Im Finanzkompass:</strong> grobe Schätzung nach dem Muster des Kantons Zürich.
      </p>
      <h3>Erbschafts- und Schenkungssteuer</h3>
      <p>
        Ehepartner und eingetragene Partner sind in allen Kantonen befreit. Nachkommen sind in den meisten Kantonen befreit – Ausnahmen
        sind unter anderem Appenzell Innerrhoden, Neuenburg, die Waadt und teilweise Luzern. Schwyz und Obwalden kennen gar keine
        Erbschafts- und Schenkungssteuer. Konkubinatspartner und entferntere Verwandte zahlen je nach Kanton hohe Sätze. Massgebend ist
        der letzte Wohnsitz der verstorbenen Person. <strong>Im Finanzkompass:</strong> als Hinweis; den Betrag trägst du nach Steuern ein.
      </p>
      <h3>AHV-Beiträge für Nichterwerbstätige</h3>
      <p>
        Keine Steuer, wirkt aber wie eine: Wer sich vor dem Referenzalter pensionieren lässt, zahlt weiterhin AHV-Beiträge – berechnet
        auf dem Vermögen plus dem 20-fachen Renteneinkommen, mindestens {chf(PARAMS.ahv.nonEmployed.min)} und höchstens{' '}
        {chf(PARAMS.ahv.nonEmployed.max)} pro Jahr. <strong>Im Finanzkompass:</strong> berücksichtigt.
      </p>
    </>
  );
}

function SelfEmployed() {
  return (
    <>
      <h2>Finanzplanung für Selbständige</h2>
      <p>
        Der Finanzkompass ist auf Angestellte ausgerichtet. Für Selbständige gelten bei Sozialversicherungen und Vorsorge andere
        Regeln. Die wichtigsten Unterschiede:
      </p>
      <h3>AHV, IV und EO</h3>
      <p>
        Selbständige zahlen die Beiträge allein: rund 10 % des Erwerbseinkommens, bei tieferen Einkommen nach einer sinkenden Skala,
        mindestens {chf(PARAMS.ahv.nonEmployed.min)} pro Jahr. Die Ausgleichskasse erhebt provisorische Beiträge und rechnet später
        mit der Steuerveranlagung ab – Rückstellungen dafür einplanen.
      </p>
      <h3>Keine obligatorische Pensionskasse</h3>
      <ul>
        <li>Ohne Pensionskasse darfst du in die Säule 3a bis 20 % des Nettoerwerbseinkommens einzahlen, höchstens {chf(PARAMS.pillar3a.maxWithoutPensionFund)} pro Jahr ({PARAMS.year}).</li>
        <li>Freiwillig kannst du dich einer Pensionskasse anschliessen, etwa über einen Berufsverband oder die Stiftung Auffangeinrichtung. Dann gilt das kleine 3a-Maximum von {chf(PARAMS.pillar3a.maxWithPensionFund)}, dafür sind Einkäufe möglich.</li>
        <li>Wer eine Einzelfirma mit Personal führt, kann sich der Pensionskasse des Personals anschliessen.</li>
      </ul>
      <h3>Risiken selbst absichern</h3>
      <ul>
        <li>Keine Arbeitslosenversicherung.</li>
        <li>Keine obligatorische Unfallversicherung – Unfalldeckung in der Krankenkasse einschliessen.</li>
        <li>Erwerbsausfall bei Krankheit (Krankentaggeld) und Invalidität privat versichern.</li>
      </ul>
      <h3>Steuern</h3>
      <ul>
        <li>Geschäftsaufwand, AHV-Beiträge, 3a-Einzahlungen und Abschreibungen sind abziehbar.</li>
        <li>Bei der Aufgabe der Erwerbstätigkeit ab 55 werden stille Reserven (Liquidationsgewinn) privilegiert besteuert, ähnlich wie Vorsorgekapital.</li>
        <li>Rechne mit Vorauszahlungen: Steuerrechnungen kommen oft ein bis zwei Jahre verzögert.</li>
      </ul>
      <h3>Den Finanzkompass trotzdem nutzen</h3>
      <ol>
        <li>Trage dein Erwerbseinkommen als Bruttolohn ein und dein Einkommen nach AHV-Beiträgen als Nettolohn – so passt das Tool die Abzüge an.</li>
        <li>Deaktiviere die Pensionskasse und trage deine 3a-Einzahlung ein (bis 20 % des Einkommens).</li>
        <li>Erfasse eine Ausgabe für Krankentaggeld und Unfallversicherung.</li>
      </ol>
      <p className="muted">
        Für die Gründung und für grössere Entscheide wie den Wechsel in eine GmbH lohnt sich eine Fachperson.
      </p>
    </>
  );
}

function Method() {
  return (
    <>
      <h2>So rechnet der Finanzkompass</h2>
      <h3>Jahr für Jahr</h3>
      <p>
        Für jedes Jahr von heute bis zum Planungshorizont rechnet das Tool Löhne und Lohnabzüge, Pensionskasse, Säule 3a, AHV, Ausgaben,
        Wohnkosten, Steuern und Vermögen. Überschüsse fliessen zuerst in den Notgroschen, danach in die Anlagen. Fehlbeträge werden aus
        dem Konto und den Anlagen gedeckt. Reicht das nicht mehr, gilt der Plan in diesem Szenario als gescheitert.
      </p>
      <h3>Steuern</h3>
      <p>
        Grundlage sind die Tarife, Abzüge und Steuerfüsse aller {(2110).toLocaleString('de-CH')} Gemeinden aus dem Steuerrechner der
        Eidgenössischen Steuerverwaltung (Steuerjahr {PARAMS.year}). Berechnet werden Bundes-, Kantons-, Gemeinde- und Kirchensteuer auf
        Einkommen und Vermögen, die Kapitalleistungssteuer, Personalsteuern, der Eigenmietwert und der Systemwechsel. Die Berechnung
        wurde mit Referenzwerten des ESTV-Rechners geprüft. Weil die Simulation zehntausende Steuerrechnungen braucht, läuft sie direkt
        in deinem Browser; die Daten werden jährlich über eine Schnittstelle der ESTV aktualisiert.
      </p>
      <h3>Monte-Carlo-Simulation</h3>
      <p>
        Die Zukunft ist unsicher. Darum rechnet der Finanzkompass deinen Plan 1000-mal mit zufälligen, aber realistischen Jahren: Aktien
        schwanken mit gelegentlichen heftigen Einbrüchen, Obligationen leiden unter Teuerungsschüben, die Teuerung selbst schwankt und
        bewegt die Hypothekarzinsen. Die Erfolgswahrscheinlichkeit ist der Anteil der Zukünfte, in denen das Geld bis zum
        Planungshorizont reicht.
      </p>
      <h3>Voreinstellungen</h3>
      <table>
        <tbody>
          <tr><th>Aktien</th><td>4 % reale Rendite pro Jahr, Schwankung 16 %</td></tr>
          <tr><th>Obligationen</th><td>0,5 % real, Schwankung 4,5 %</td></tr>
          <tr><th>Teuerung</th><td>1 % im Mittel</td></tr>
          <tr><th>Pensionskasse</th><td>Verzinsung 1,75 % nominal, Umwandlungssatz 5,4 %</td></tr>
          <tr><th>Hypothekarzins künftig</th><td>2,5 % nominal</td></tr>
          <tr><th>Planungshorizont</th><td>Alter 95</td></tr>
        </tbody>
      </table>
      <h3>Vereinfachungen</h3>
      <ul>
        <li>Keine Ergänzungsleistungen, keine Hinterlassenen- oder Invalidenleistungen und keine Pflegekosten – plane dafür Reserven ein.</li>
        <li>Beide Personen leben bis zum Planungshorizont.</li>
        <li>Steuern werden im selben Jahr bezahlt, in dem das Einkommen anfällt.</li>
        <li>Die kantonalen Regeln für die Kapitalleistungssteuer entsprechen dem Stand 2022; die Tarife sind aktuell.</li>
        <li>Handänderungs- und Grundstückgewinnsteuer sind vereinfacht, Erbschaftssteuern nur als Hinweis.</li>
        <li>Bei Konkubinatspaaren werden Kinder steuerlich der ersten Person zugeordnet.</li>
        <li>Die AHV-Rente kommt aus deiner Eingabe; Auswirkungen späterer Lohnänderungen auf die AHV sind nicht berücksichtigt.</li>
      </ul>
      <h3>Quellen</h3>
      <ul>
        <li>Eidgenössische Steuerverwaltung: Steuerrechner und Steuerdaten {PARAMS.year}</li>
        <li>Bundesamt für Sozialversicherungen: Renten und Beiträge ab 1.1.2026</li>
        <li>Steuerlogik in Teilen portiert aus dem Open-Source-Projekt swisstaxcalculator von devbrains (MIT-Lizenz)</li>
      </ul>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h2>Datenschutz und Haftung</h2>
      <h3>Deine Daten bleiben bei dir</h3>
      <ul>
        <li>Es gibt kein Konto, keinen Server und keine Datenbank. Alles wird in deinem Browser gerechnet.</li>
        <li>Dein Plan wird im Speicher deines Browsers (localStorage) abgelegt, damit du später weitermachen kannst. Löschen kannst du ihn unter «Speichern & teilen».</li>
        <li>Teilst du einen Link, stecken die Daten komprimiert im Link selbst – hinter dem #, das Browser nicht an Server senden. Wer den Link hat, kann den Plan lesen. Behandle ihn wie ein vertrauliches Dokument.</li>
        <li>Keine Cookies, keine Tracker, keine eingebundenen Schriften oder Skripte von Dritten. Geladen werden nur die Dateien dieser Seite.</li>
      </ul>
      <h3>Keine Beratung</h3>
      <p>
        Der Finanzkompass ist ein Planungs- und Lernwerkzeug. Er gibt keine Anlage-, Steuer- oder Rechtsberatung und keine
        persönlichen Empfehlungen ab. Alle Ergebnisse sind Modellrechnungen mit vereinfachenden Annahmen. Die tatsächlichen Steuern,
        Renten und Renditen können abweichen.
      </p>
      <h3>Haftung</h3>
      <p>
        Die Angaben wurden sorgfältig zusammengestellt, eine Gewähr für Richtigkeit, Vollständigkeit und Aktualität besteht nicht.
        Für Entscheide, die auf Basis dieses Tools getroffen werden, wird keine Haftung übernommen. Für wichtige Entscheide – etwa
        Rente oder Kapital, Frühpensionierung oder Hauskauf – lohnt sich eine unabhängige Fachperson.
      </p>
    </>
  );
}
