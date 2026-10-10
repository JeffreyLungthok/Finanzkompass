import { useEffect, useRef, useState } from 'react';
import { Copy, Download, Upload, X } from 'lucide-react';
import { useAppState, replacePlan, resetAll } from '../lib/store';
import { downloadPlanFile, readPlanFile, shareUrl } from '../lib/planIO';
import { navigate } from '../lib/router';

export function ShareDialog({ onClose, view }: { onClose: () => void; view: string }) {
  const { plan, journey } = useAppState();
  const url = shareUrl(plan, journey, view);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector<HTMLElement>('button, input')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      inputRef.current?.select();
      document.execCommand('copy');
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" ref={dialogRef}>
        <div className="row">
          <h2 id="share-title">Plan speichern und teilen</h2>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Schliessen">
            <X size={20} />
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Dein Plan steckt vollständig in diesem Link – verschlüsselt ist er nicht, aber er wird nirgends gespeichert.
          Der Teil hinter dem # wird von Browsern nie an einen Server geschickt. Wer den Link hat, sieht den Plan.
        </p>
        <div className="copy-row">
          <input ref={inputRef} readOnly value={url} aria-label="Link zum Plan" onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={copy}>
            <Copy size={16} /> {copied ? 'Kopiert' : 'Link kopieren'}
          </button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Plan-Nummer {plan.id}. Der Link ist {url.length.toLocaleString('de-CH')} Zeichen lang. Im Browser gespeichert wird dein Plan zusätzlich automatisch.
        </p>
        <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%', margin: '4px 0' }} />
        <div className="row">
          <button className="btn btn-secondary" onClick={() => downloadPlanFile(plan, journey)}>
            <Download size={16} /> Als Datei sichern
          </button>
          <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Datei öffnen
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const res = await readPlanFile(f);
              if (!res) {
                setError('Diese Datei enthält keinen gültigen Finanzplan.');
                return;
              }
              replacePlan(res.plan, res.journey);
              onClose();
              navigate('check');
            }}
          />
        </div>
        {error && <p style={{ color: 'var(--warn)', margin: 0 }}>{error}</p>}
        <button
          className="btn btn-quiet btn-small"
          style={{ justifySelf: 'start' }}
          onClick={() => {
            if (confirm('Alle Eingaben im Browser löschen und neu beginnen?')) {
              resetAll();
              onClose();
              navigate('');
            }
          }}
        >
          Alle Daten im Browser löschen
        </button>
      </div>
    </div>
  );
}
