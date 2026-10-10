import type { ReactNode } from 'react';

export interface SignItem {
  label: ReactNode;
  time?: ReactNode;
  sub?: ReactNode;
  direction?: 'left' | 'right';
  href?: string;
}

/** Wegweiser nach Schweizer Vorbild (Alpine Earth): Standorttafel und gelbe Richtungsschilder an einem Mast. */
export function Signpost({ here, signs, label }: { here?: { label: ReactNode; value?: ReactNode }; signs: SignItem[]; label?: string }) {
  return (
    <div className="signpost" role="group" aria-label={label}>
      {here && (
        <p className="ae-standort" aria-label="Du bist hier">
          <span className="ae-standort__name">{here.label}</span>
          {here.value && <span className="ae-standort__meta">{here.value}</span>}
        </p>
      )}
      <ul className="ae-wegweiser-mast">
        {signs.map((s, i) => {
          const cls = `ae-wegweiser${s.direction === 'left' ? ' ae-wegweiser--links' : ''}`;
          const inner = (
            <>
              <span className="ae-wegweiser__ziel">
                {s.label}
                {s.sub && <small className="sign-sub">{s.sub}</small>}
              </span>
              {s.time && <span className="ae-wegweiser__zeit">{s.time}</span>}
            </>
          );
          return (
            <li key={i}>
              {s.href ? (
                <a className={cls} href={s.href}>
                  {inner}
                </a>
              ) : (
                <div className={`${cls} ae-wegweiser--static`}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="6" y="3" width="4" height="27" rx="1" fill="var(--post)" />
      <path d="M8 6h15l5 4.5-5 4.5H8z" fill="var(--sign)" stroke="var(--sign-ink)" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 17h12l4 3.5-4 3.5H8z" fill="var(--sign)" stroke="var(--sign-ink)" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
