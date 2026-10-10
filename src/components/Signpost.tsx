import type { ReactNode } from 'react';

export interface SignItem {
  label: ReactNode;
  time?: ReactNode;
  sub?: ReactNode;
  direction?: 'left' | 'right';
  href?: string;
}

/** Wegweiser nach Schweizer Vorbild: weisse Standorttafel, gelbe Richtungsschilder. */
export function Signpost({ here, signs, label }: { here?: { label: ReactNode; value?: ReactNode }; signs: SignItem[]; label?: string }) {
  return (
    <div className="signpost" role="group" aria-label={label}>
      {here && (
        <div className="sign sign--here">
          <span>{here.label}</span>
          {here.value && <span className="sign-time">{here.value}</span>}
        </div>
      )}
      {signs.map((s, i) => {
        const cls = `sign ${s.direction === 'left' ? 'sign--left' : ''}`;
        const inner = (
          <>
            <span>
              {s.label}
              {s.sub && <small>{s.sub}</small>}
            </span>
            {s.time && <span className="sign-time">{s.time}</span>}
          </>
        );
        return s.href ? (
          <a key={i} className={cls} href={s.href}>
            {inner}
          </a>
        ) : (
          <div key={i} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="6" y="3" width="4" height="27" rx="1" fill="var(--post)" />
      <path d="M8 6h15l5 4.5-5 4.5H8z" fill="var(--sign)" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8 17h12l4 3.5-4 3.5H8z" fill="var(--sign)" stroke="var(--ink)" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
