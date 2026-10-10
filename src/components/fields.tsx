import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { num, parseNumber } from '../lib/format';

export function InfoTip({ children, label = 'Erklärung' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span className="info-tip" ref={ref}>
      <button type="button" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <Info size={16} />
      </button>
      {open && (
        <span className="tip-body" id={id} role="note">
          {children}
        </span>
      )}
    </span>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  tip?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}

export function Field({ label, hint, tip, children, htmlFor }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {tip && <InfoTip label={`Erklärung zu ${label}`}>{tip}</InfoTip>}
      </label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  hint?: ReactNode;
  tip?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  decimals?: number;
  placeholder?: string;
  /** leeres Feld erlaubt (z. B. optionaler Nettolohn) */
  optional?: boolean;
  onClear?: () => void;
  /** ohne Tausendertrennzeichen, z. B. für Jahreszahlen */
  plain?: boolean;
}

export function NumberField(props: NumberFieldProps) {
  const { label, value, onChange, prefix, suffix, hint, tip, min, max, decimals = 0, placeholder, optional, onClear, plain } = props;
  const id = useId();
  const format = (v: number) =>
    Number.isFinite(v) ? (decimals ? v.toFixed(decimals).replace('.', ',') : plain ? String(Math.round(v)) : num(v)) : '';
  const [text, setText] = useState(optional && !value ? '' : format(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(optional && !value ? '' : format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  const commit = (raw: string) => {
    const n = parseNumber(raw);
    if (n === null) {
      if (optional) onClear?.();
      return;
    }
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  };
  return (
    <Field label={label} hint={hint} tip={tip} htmlFor={id}>
      <div className="input">
        {prefix && <span className="affix">{prefix}</span>}
        <input
          id={id}
          className="num-input"
          inputMode="decimal"
          value={text}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit(text);
          }}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseNumber(e.target.value);
            if (n !== null && (min === undefined || n >= min) && (max === undefined || n <= max)) onChange(n);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </div>
    </Field>
  );
}

/** Prozentwert, intern als Anteil (0.015 = 1,5 %) gespeichert. */
export function PercentField(props: Omit<NumberFieldProps, 'suffix' | 'decimals'> & { decimals?: number }) {
  const { value, onChange, decimals = 1, min, max, ...rest } = props;
  return (
    <NumberField
      {...rest}
      decimals={decimals}
      value={Math.round(value * 100 * 10 ** decimals) / 10 ** decimals}
      onChange={(v) => onChange(v / 100)}
      min={min !== undefined ? min * 100 : undefined}
      max={max !== undefined ? max * 100 : undefined}
      suffix="%"
    />
  );
}

export function TextField({ label, value, onChange, hint, placeholder }: { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode; placeholder?: string }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <div className="input">
        <input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </div>
    </Field>
  );
}

export function SelectField<T extends string | number>({
  label,
  value,
  onChange,
  options,
  hint,
  tip
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: ReactNode;
  tip?: ReactNode;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} tip={tip} htmlFor={id}>
      <div className="input">
        <select
          id={id}
          value={String(value)}
          onChange={(e) => {
            const opt = options.find((o) => String(o.value) === e.target.value);
            if (opt) onChange(opt.value);
          }}
        >
          {options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </Field>
  );
}

export function Segmented<T extends string | number>({
  label,
  value,
  onChange,
  options,
  hint,
  tip
}: {
  label?: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  hint?: ReactNode;
  tip?: ReactNode;
}) {
  const id = useId();
  const seg = (
    <div className="seg" role="group" aria-labelledby={label ? id : undefined}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
  if (!label) return seg;
  return (
    <div className="field">
      <span className="label" id={id}>
        {label}
        {tip && <InfoTip label={`Erklärung zu ${label}`}>{tip}</InfoTip>}
      </span>
      {seg}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && (
          <>
            <br />
            <span className="hint muted small">{hint}</span>
          </>
        )}
      </span>
    </label>
  );
}

export function RangeField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
  hint,
  tip
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  hint?: ReactNode;
  tip?: ReactNode;
}) {
  const id = useId();
  return (
    <Field label={label} hint={hint} tip={tip} htmlFor={id}>
      <div className="range-row">
        <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="num" style={{ fontSize: '1.2rem', textAlign: 'right' }}>
          {format(value)}
        </span>
      </div>
    </Field>
  );
}
