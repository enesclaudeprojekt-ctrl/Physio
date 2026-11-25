import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { RecoveryStatus } from '../../domain/types';
import { STATUS_LABEL } from '../../engine/recoveryAssessmentEngine';

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const p: Record<string, ReactNode> = {
    home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
    today: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18M8 15l2.5 2.5L16 13" /></>,
    progress: <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />,
    library: <><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="16" rx="1.5" /></>,
    load: <><path d="M12 3a9 9 0 1 0 9 9" /><path d="M12 12l6-6" /><circle cx="12" cy="12" r="1.6" /></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
    back: <path d="M15 18l-6-6 6-6" />,
    check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    x: <path d="M6 6l12 12M18 6L6 18" />,
    alert: <><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
    lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
    up: <path d="M12 19V5M6 11l6-6 6 6" />,
    down: <path d="M12 5v14M6 13l6 6 6-6" />,
    equal: <path d="M6 9h12M6 15h12" />,
    play: <path d="M7 4l13 8-13 8z" />,
    timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    chevron: <path d="M9 6l6 6-6 6" />
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {p[name]}
    </svg>
  );
}

export function TopBar({ title, sub, back, right }: { title: string; sub?: ReactNode; back?: () => void; right?: ReactNode }) {
  return (
    <>
      {back && (
        <button className="back" onClick={back}>
          <Icon name="back" size={18} /> Zurück
        </button>
      )}
      <div className="topbar" style={back ? { paddingTop: 4 } : undefined}>
        <div className="grow">
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {right}
      </div>
    </>
  );
}

const STATUS_ICON: Record<RecoveryStatus, string> = { green: 'check', yellow: 'info', orange: 'alert', red: 'alert' };
export function StatusPill({ status, label }: { status: RecoveryStatus; label?: string }) {
  return (
    <span className={`pill ${status}`}>
      <Icon name={STATUS_ICON[status]} size={14} />
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

export function Scale({ value, onChange, max = 10, labels }: { value: number | undefined; onChange: (v: number) => void; max?: number; labels?: [string, string] }) {
  return (
    <div>
      <div className="scale" style={{ gridTemplateColumns: `repeat(${max + 1}, 1fr)` }} role="radiogroup">
        {Array.from({ length: max + 1 }, (_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            className={`chip ${value === i ? 'on' : ''} ${value === i && max === 10 && i >= 5 ? 'badc' : value === i && max === 10 && i >= 3 ? 'warnc' : ''}`}
            onClick={() => onChange(i)}
          >
            {i}
          </button>
        ))}
      </div>
      {labels && (
        <div className="scale-legend">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T | undefined; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ values, options, onChange, tone }: { values: T[]; options: { value: T; label: string }[]; onChange: (v: T[]) => void; tone?: 'bad' }) {
  return (
    <div className="chips">
      {options.map((o) => {
        const on = values.includes(o.value);
        return (
          <button key={o.value} type="button" aria-pressed={on} className={`chip ${on ? 'on' : ''} ${on && tone === 'bad' ? 'badc' : ''}`} onClick={() => onChange(on ? values.filter((v) => v !== o.value) : [...values, o.value])}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Stepper({ label, value, onChange, step = 1, min = 0, max = 9999, format }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; format?: (v: number) => string }) {
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <div>
      <div className="stepper-label">{label}</div>
      <div className="stepper">
        <button type="button" aria-label={`${label} verringern`} onClick={() => onChange(Math.max(min, round(value - step)))}>
          −
        </button>
        <div className="v">{format ? format(value) : value.toLocaleString('de-DE')}</div>
        <button type="button" aria-label={`${label} erhöhen`} onClick={() => onChange(Math.min(max, round(value + step)))}>
          +
        </button>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="label">{label}</div>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Banner({ kind = 'info', title, children }: { kind?: 'info' | 'warn' | 'danger' | 'good'; title?: string; children: ReactNode }) {
  return (
    <div className={`banner ${kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      <span style={{ flex: 'none', marginTop: 1 }}>
        <Icon name={kind === 'good' ? 'check' : kind === 'info' ? 'info' : 'alert'} size={18} />
      </span>
      <div>
        {title && <b>{title}</b>}
        {children}
      </div>
    </div>
  );
}

export function Ring({ value, label, color = 'var(--accent)' }: { value: number; label: string; color?: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring">
      <svg viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="9" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * c} ${c}`} />
      </svg>
      <div className="lbl">
        <div>
          {Math.round(value)}
          <small>{label}</small>
        </div>
      </div>
    </div>
  );
}

export function Timer({ seconds, label }: { seconds: number; label: string }) {
  const [left, setLeft] = useState<number | null>(null);
  const ref = useRef<number>();
  useEffect(() => () => clearInterval(ref.current), []);
  const start = () => {
    clearInterval(ref.current);
    setLeft(seconds);
    ref.current = window.setInterval(() => {
      setLeft((l) => {
        if (l === null || l <= 1) {
          clearInterval(ref.current);
          try {
            navigator.vibrate?.(300);
          } catch {
            /* optional */
          }
          return 0;
        }
        return l - 1;
      });
    }, 1000);
  };
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  return (
    <div className="stat">
      <div className="row between">
        <span className="label">{label}</span>
        <button className="btn sm" onClick={start} type="button">
          <Icon name="timer" size={16} /> {left === null ? 'Start' : 'Neu'}
        </button>
      </div>
      {left !== null && <div className="timer">{left === 0 ? 'Fertig' : fmt(left)}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="muted small center" style={{ padding: '18px 8px' }}>{children}</div>;
}
