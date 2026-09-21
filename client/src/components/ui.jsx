// OrderPilot — shared UI atoms
import { useEffect, useState } from 'react';
import { STATUS_META, STAGES, INR } from '../api.js';

export function StatusChip({ status, live = false }) {
  const m = STATUS_META[status] || { label: status, color: '#8b94ad' };
  return (
    <span className="chip" style={{ color: m.color, background: `color-mix(in srgb, ${m.color} 14%, transparent)`, borderColor: `color-mix(in srgb, ${m.color} 40%, transparent)` }}>
      <span className={`dot ${live ? 'live' : ''}`} />{m.label}
    </span>
  );
}

export function Progress({ status, height = 4 }) {
  const idx = STAGES.indexOf(status);
  const cancelled = status === 'CANCELLED';
  const color = STATUS_META[status]?.color;
  return (
    <div className="progress" style={{ '--pc': cancelled ? '#ef4444' : color, height }}>
      {STAGES.map((_, i) => <i key={i} className={(!cancelled && i <= idx) || cancelled ? 'on' : ''} />)}
    </div>
  );
}

export function Modal({ onClose, children, wide = false }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-box" style={wide ? { width: 'min(640px, 100%)' } : undefined} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err-text">{error}</span>}
    </div>
  );
}

export const Spinner = ({ small }) => <span className="spin" style={small ? { width: 13, height: 13 } : undefined} />;

export function Empty({ icon = '🗂️', title, sub, action }) {
  return (
    <div className="empty">
      <div className="e-ic">{icon}</div>
      <div style={{ fontWeight: 750, fontSize: 16 }}>{title}</div>
      {sub && <div className="sub mt8">{sub}</div>}
      {action && <div className="mt16">{action}</div>}
    </div>
  );
}

export const Money = ({ v }) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{INR(v)}</span>;

export function Copyable({ text }) {
  const [hit, setHit] = useState(false);
  return (
    <button
      className="btn ghost sm mono"
      title="Copy to clipboard"
      onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(text); setHit(true); setTimeout(() => setHit(false), 1400); }}
      style={{ borderStyle: 'dashed' }}
    >
      {hit ? '✓ copied' : `${text} ⧉`}
    </button>
  );
}

export function Toasts({ items, onDismiss }) {
  const icons = { success: '✅', error: '⛔', warn: '⚠️', info: 'ℹ️' };
  return (
    <div className="toasts">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => onDismiss(t.id)}>
          <span className="ic">{icons[t.type] || 'ℹ️'}</span><span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

export const Skeleton = ({ h = 90, style }) => <div className="skel" style={{ height: h, ...style }} />;
