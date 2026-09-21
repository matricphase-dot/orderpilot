// OrderPilot — dependency-free SVG/CSS charts
import { useState } from 'react';
import { INR, STATUS_META } from '../api.js';

export function BarChart({ data, height = 130, format = (v) => INR(v) }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  return (
    <div>
      <div className="bars" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="b" style={{ height: `${(d.revenue / max) * 100}%`, animationDelay: `${i * 30}ms` }} title={`${d.date} — ${format(d.revenue)}`}>
            <div className="tip">{d.date.slice(5)} · {format(d.revenue)} · {d.orders} ord</div>
          </div>
        ))}
      </div>
      <div className="row between small faint" style={{ marginTop: 8 }}>
        <span>{data[0]?.date.slice(5)}</span><span>{data.at(-1)?.date.slice(5)}</span>
      </div>
    </div>
  );
}

export function Donut({ parts, size = 150, thickness = 22 }) {
  const [hover, setHover] = useState(null);
  const total = Math.max(1, parts.reduce((s, p) => s + p.value, 0));
  const R = (size - thickness) / 2, C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = parts.map((p) => {
    const frac = p.value / total;
    const a = { ...p, dash: `${Math.max(frac * C - (frac > 0 ? 2 : 0), 0)} ${C}`, offset: -acc * C, frac };
    acc += frac;
    return a;
  });
  return (
    <div className="row" style={{ gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)', flex: 'none' }}>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="rgba(255,255,255,.06)" strokeWidth={thickness} />
        {arcs.map((a, i) => (
          <circle key={i} cx={size / 2} cy={size / 2} r={R} fill="none" stroke={a.color}
            strokeWidth={hover === i ? thickness + 4 : thickness} strokeDasharray={a.dash} strokeDashoffset={a.offset}
            strokeLinecap="butt" opacity={hover === null || hover === i ? 1 : 0.35}
            style={{ transition: '.2s', cursor: a.frac > 0 ? 'pointer' : 'default' }}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill="var(--text)" fontSize={size / 7} fontWeight={800} style={{ transform: 'rotate(90deg)', transformOrigin: 'center' }}>
          {hover !== null ? parts[hover].value : total}
        </text>
      </svg>
      <div style={{ display: 'grid', gap: 7, fontSize: 12.5 }}>
        {parts.map((p, i) => (
          <div key={i} className="row" style={{ gap: 8, opacity: hover === null || hover === i ? 1 : .4, cursor: 'pointer' }} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: p.color, boxShadow: `0 0 8px ${p.color}66` }} />
            <span style={{ color: 'var(--muted)' }}>{p.label}</span><b>{p.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Funnel({ stages = [], counts = [] }) {
  const max = Math.max(1, ...counts);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {stages.map((s, i) => (
        <div key={s} className="row" style={{ gap: 10 }}>
          <span className="small" style={{ width: 128, color: STATUS_META[s]?.color, fontWeight: 700, fontSize: 12 }}>{STATUS_META[s]?.icon} {STATUS_META[s]?.label}</span>
          <div style={{ flex: 1, background: 'rgba(255,255,255,.06)', borderRadius: 8, height: 22, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(counts[i] / max) * 100}%`, background: `linear-gradient(90deg, ${STATUS_META[s]?.color}cc, ${STATUS_META[s]?.color}55)`, borderRadius: 8, transition: 'width .7s cubic-bezier(.22,1,.36,1)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 7, fontSize: 11.5, fontWeight: 800 }}>
              {counts[i] > 0 ? counts[i] : ''}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
