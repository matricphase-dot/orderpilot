// OrderPilot — order tracking timeline (full lifecycle + per-stage events)
import { STAGES, STATUS_META } from '../api.js';
import { dt } from '../api.js';

export default function Timeline({ order }) {
  const cancelled = order.status === 'CANCELLED';
  const curIdx = cancelled ? -1 : STAGES.indexOf(order.status);
  const evtByStage = new Map();
  for (const e of order.events || []) if (!evtByStage.has(e.status)) evtByStage.set(e.status, e);

  return (
    <div className="tl">
      {STAGES.map((s, i) => {
        const meta = STATUS_META[s];
        const done = !cancelled && i < curIdx;
        const now = !cancelled && i === curIdx;
        const evt = evtByStage.get(s);
        const when = done || now ? evt?.created_at : null;
        const msg = now ? (order.events?.at(-1)?.message || meta.hint) : evt?.message || meta.hint;
        return (
          <div key={s} className={`tl-item ${done ? 'done' : ''} ${now ? 'now' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="tl-node" style={done || now ? { background: meta.color, color: '#fff' } : undefined}>
              {done ? '✓' : now ? '●' : ''}
            </div>
            <div className="row between" style={{ gap: 10 }}>
              <b style={{ fontSize: 14, color: done || now ? 'var(--text)' : 'var(--faint)' }}>{meta.icon} {meta.label}</b>
              {when && <span className="tl-when">{dt(when)}</span>}
            </div>
            <div className="tl-msg" style={{ color: now ? 'var(--text)' : undefined }}>{now ? msg : done ? msg : 'Pending…'}</div>
          </div>
        );
      })}
      {cancelled && (
        <div className="tl-item now">
          <div className="tl-node" style={{ background: '#ef4444', color: '#fff' }}>✖</div>
          <div className="row between"><b style={{ fontSize: 14 }}>Cancelled</b><span className="tl-when">{dt(order.cancelled_at)}</span></div>
          <div className="tl-msg" style={{ color: 'var(--text)' }}>{order.events?.at(-1)?.message || 'This order was cancelled.'}</div>
        </div>
      )}
    </div>
  );
}
