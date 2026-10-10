import { useEffect, useState } from 'react';
import { Share2 } from 'lucide-react';
import { BrandMark } from './components/Signpost';
import { ShareDialog } from './components/ShareDialog';
import { href, replaceQuietly, useRoute } from './lib/router';
import { decodeShare } from './lib/planIO';
import { getState, replacePlan } from './lib/store';
import { Landing } from './pages/Landing';
import { PlanEditor } from './pages/PlanEditor';
import { CheckPage } from './pages/CheckPage';
import { JourneyPage } from './pages/JourneyPage';
import { InfoPage } from './pages/InfoPage';

export default function App() {
  const route = useRoute();
  const [share, setShare] = useState(false);
  const [toast, setToast] = useState('');
  const section = route.path[0] ?? '';

  // Geteilten Plan aus dem Link übernehmen
  useEffect(() => {
    const data = route.query.get('p');
    if (!data) return;
    const decoded = decodeShare(data);
    const view = route.path.join('/') || 'check';
    if (!decoded) {
      setToast('Der Link enthält keinen gültigen Plan.');
      replaceQuietly(view);
      return;
    }
    const current = getState();
    if (current.started && current.plan.id !== decoded.plan.id) {
      const ok = confirm('Geteilten Plan öffnen? Dein bisheriger Plan in diesem Browser wird ersetzt. Sichere ihn vorher als Datei, wenn du ihn behalten willst.');
      if (!ok) {
        replaceQuietly(view);
        return;
      }
    }
    replacePlan(decoded.plan, decoded.journey);
    replaceQuietly(view);
    setToast('Geteilter Plan geöffnet');
  }, [route]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const titles: Record<string, string> = {
      '': 'Finanzkompass – Finanzplan bis zur Pension und darüber hinaus',
      plan: 'Plan erfassen – Finanzkompass',
      check: 'Wo stehe ich? – Finanzkompass',
      reise: 'Lebenssimulation – Finanzkompass',
      info: 'Infos – Finanzkompass'
    };
    document.title = titles[section] ?? titles[''];
  }, [section]);

  const nav = [
    { id: 'plan', label: 'Plan erfassen', to: 'plan/haushalt' },
    { id: 'check', label: 'Wo stehe ich?', to: 'check' },
    { id: 'reise', label: 'Lebenssimulation', to: 'reise' },
    { id: 'info', label: 'Infos', to: 'info/heutige-franken' }
  ];

  return (
    <div className="app">
      <header className="topbar ae-nav">
        <div className="topbar-inner">
          <a className="brand" href={href('')}>
            <BrandMark />
            Finanzkompass
          </a>
          <nav className="nav" aria-label="Hauptnavigation">
            {nav.map((n) => (
              <a key={n.id} href={href(n.to)} aria-current={section === n.id ? 'page' : undefined}>
                {n.label}
              </a>
            ))}
          </nav>
          <div className="topbar-actions">
            <button className="btn btn-secondary btn-small" onClick={() => setShare(true)}>
              <Share2 size={16} aria-hidden="true" />
              <span className="hide-sm">Speichern & teilen</span>
              <span className="visually-hidden"> (Plan speichern und teilen)</span>
            </button>
          </div>
        </div>
      </header>

      <main className="main" id="inhalt">
        {section === '' && <Landing />}
        {section === 'plan' && <PlanEditor step={route.path[1] ?? 'haushalt'} />}
        {section === 'check' && <CheckPage />}
        {section === 'reise' && <JourneyPage />}
        {section === 'info' && <InfoPage topic={route.path[1] ?? 'heutige-franken'} />}
      </main>

      <hr className="ae-horizon page-horizon" aria-hidden="true" />
      <footer className="footer ae-pattern ae-pattern--schindel">
        <div className="footer-inner">
          <span>
            Finanzkompass ist ein kostenloses Planungswerkzeug und keine Finanz-, Steuer- oder Anlageberatung. Alle Angaben ohne Gewähr.
          </span>
          <span className="row" style={{ gap: 18 }}>
            <a href={href('info/methodik')}>Methodik</a>
            <a href={href('info/datenschutz')}>Datenschutz & Haftung</a>
          </span>
        </div>
      </footer>

      {share && <ShareDialog onClose={() => setShare(false)} view={section === 'reise' ? 'reise' : 'check'} />}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
