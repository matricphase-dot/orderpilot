import { NavLink, useNavigate } from 'react-router-dom';
import { useApp } from '../store.jsx';

const link = ({ isActive }) => `link ${isActive ? 'active' : ''}`;

export default function Nav({ onOpenCart }) {
  const { user, isAdmin, logout, cartCount, toast } = useApp();
  const nav = useNavigate();
  return (
    <header className="nav">
      <div className="wrap nav-in">
        <NavLink to="/" className="logo">
          <span className="logo-mark">🛒</span>
          <span>Order<em style={{ fontStyle: 'normal' }} className="grad-text">Pilot</em></span>
        </NavLink>
        <NavLink to="/" className={link} end>Shop</NavLink>
        <NavLink to="/orders" className={link}>My Orders</NavLink>
        <NavLink to="/track" className={link}>Track</NavLink>
        {isAdmin && <NavLink to="/admin" className={link}>⚙️ Admin</NavLink>}

        <div className="nav-right">
          {user && (
            <button className="icon-btn" onClick={onOpenCart} title="Open cart">
              🧺
              {cartCount > 0 && <span className="badge-dot">{cartCount}</span>}
            </button>
          )}
          {user ? (
            <div className="row" style={{ gap: 8 }}>
              <div className="row" style={{ gap: 9, padding: '4px 10px 4px 4px', border: '1px solid var(--border)', borderRadius: 99 }}>
                <span className="avatar">{user.name.split(' ').map((s) => s[0]).slice(0, 2).join('')}</span>
                <span className="hide-sm" style={{ fontSize: 13, fontWeight: 650 }}>
                  {user.name.split(' ')[0]}
                  {isAdmin && <span className="chip" style={{ color: '#22d3ee', background: 'rgba(34,211,238,.12)', marginLeft: 6, padding: '2px 8px', fontSize: 10.5 }}>ADMIN</span>}
                </span>
              </div>
              <button className="btn ghost sm" onClick={() => { logout(); nav('/'); toast('Cart kept safe — sign back in to checkout.', 'info', 2600); }}>Sign out</button>
            </div>
          ) : (
            <button className="btn primary sm" onClick={() => nav('/auth')}>Sign in</button>
          )}
        </div>
      </div>
    </header>
  );
}
