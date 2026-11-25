import { useState } from 'react';
import type { SeriesPoint } from '../../engine/analyticsEngine';
import { formatShort } from '../../utils/date';

interface LineProps {
  data: SeriesPoint[];
  unit?: string;
  height?: number;
  yMax?: number;
  yMin?: number;
  /** Diskrete Skala (z. B. Schwellung 0–3) */
  integerTicks?: boolean;
  emptyText?: string;
  title: string;
}

/** Einzelreihen-Liniendiagramm mit Antipp-/Hover-Tooltip (kein Doppelachsen-Chart). */
export function LineChart({ data, unit = '', height = 150, yMax, yMin = 0, integerTicks, emptyText = 'Noch keine Daten', title }: LineProps) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <div className="muted small" style={{ padding: '24px 0', textAlign: 'center' }}>{emptyText}</div>;
  const W = 320;
  const H = height;
  const pad = { l: 28, r: 10, t: 10, b: 22 };
  const maxV = yMax ?? Math.max(1, ...data.map((d) => d.value)) * 1.15;
  const x = (i: number) => (data.length === 1 ? (W + pad.l - pad.r) / 2 : pad.l + (i / (data.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - (v - yMin) / (maxV - yMin)) * (H - pad.t - pad.b);
  const ticks = integerTicks ? Array.from({ length: Math.floor(maxV) + 1 }, (_, i) => i) : [0, maxV / 2, maxV].map((v) => Math.round(v * 10) / 10);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i)},${y(d.value)}`).join(' ');
  const area = `${path} L${x(data.length - 1)},${y(yMin)} L${x(0)},${y(yMin)} Z`;
  const labelIdx = data.length <= 6 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1];
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < data.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    setHover(best);
  };
  const h = hover !== null ? data[hover] : data[data.length - 1];
  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${title}: ${data.length} Werte, zuletzt ${data[data.length - 1].value} ${unit}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end">{t.toLocaleString('de-DE')}</text>
          </g>
        ))}
        {data.length > 1 && <path className="area" d={area} />}
        {data.length > 1 && <path className="series" d={path} />}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="var(--text-faint)" strokeDasharray="2 3" />}
        {data.map((d, i) => (
          <circle key={i} className="pt" cx={x(i)} cy={y(d.value)} r={hover === i ? 5.5 : data.length > 30 ? 0 : 3.5} />
        ))}
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 && data.length > 1 ? 'start' : i === data.length - 1 && data.length > 1 ? 'end' : 'middle'}>
            {formatShort(data[i].date)}
          </text>
        ))}
      </svg>
      <figcaption className="chart-tip">
        {hover !== null ? 'Ausgewählt' : 'Zuletzt'}: <b>{h.value.toLocaleString('de-DE')} {unit}</b> am {formatShort(h.date)}
      </figcaption>
    </figure>
  );
}

export function BarChart({ data, title, unit = '' }: { data: { label: string; value: number }[]; title: string; unit?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 120;
  const pad = { l: 22, r: 6, t: 8, b: 20 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (W - pad.l - pad.r) / data.length;
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const h = hover !== null ? data[hover] : null;
  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onPointerLeave={() => setHover(null)}>
        {[0, max].map((t) => (
          <g key={t}>
            <line className="gridline" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
            <text x={pad.l - 5} y={y(t) + 3} textAnchor="end">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const top = y(d.value);
          const bh = H - pad.b - top;
          return (
            <g key={i} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {bh > 0 && <path d={`M${pad.l + i * bw + 2},${H - pad.b} V${top + 4} q0,-4 4,-4 H${pad.l + (i + 1) * bw - 6} q4,0 4,4 V${H - pad.b} Z`} fill="var(--series)" opacity={hover === null || hover === i ? 1 : 0.45} />}
              {(data.length <= 8 || i % 2 === 0) && (
                <text x={pad.l + i * bw + bw / 2} y={H - 6} textAnchor="middle">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="chart-tip">{h ? <>{h.label}: <b>{h.value} {unit}</b></> : 'Balken antippen für Details'}</figcaption>
    </figure>
  );
}

export function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const W = 80;
  const H = 24;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * W},${H - 2 - ((v - min) / (max - min || 1)) * (H - 4)}`).join(' ');
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--series)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
