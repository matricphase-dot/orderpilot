// OrderPilot — admin console shell with sub-navigation
import { NavLink, Outlet } from 'react-router-dom';
import { useApp } from '../../store.jsx';

const tabs = [
  { to: '/admin', label: '📊 Dashboard', end: true },
  { to: '/admin/orders', label: '📦 Orders' },
  { to: '/admin/products', label: '🏷️ Products & stock' },
];

export default function AdminLayout() {
  const { user } = useApp();
  return (
    <div>
      <div className="row between wrapline" style={{ gap: 12 }}>
        <div>
          <span className="chip" style={{ color: '#22d3ee', background: 'rgba(34,211,238,.1)', borderColor: 'rgba(34,211,238,.4)', marginBottom: 8 }}>ADMIN CONSOLE</span>
          <p className="sub mb0" style={{ marginTop: 4 }}>Signed in as <b style={{ color: 'var(--text)' }}>{user.name}</b> — fulfilment ops, tracking events and catalog control.</p>
        </div>
        <nav className="row" style={{ gap: 6, background: 'var(--panel)', padding: 5, borderRadius: 14, border: '1px solid var(--border)' }}>
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `btn sm ${isActive ? 'primary' : 'ghost'}`} style={{ boxShadow: 'none' }}>{t.label}</NavLink>
          ))}
        </nav>
      </div>
      <div className="mt24"><Outlet /></div>
    </div>
  );
}
