// OrderPilot — app shell: routing, nav, cart drawer, toasts
import { useState } from 'react';
import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { useApp } from './store.jsx';
import { Toasts } from './components/ui.jsx';
import Nav from './components/Nav.jsx';
import CartDrawer from './components/CartDrawer.jsx';
import Shop from './pages/Shop.jsx';
import MyOrders from './pages/MyOrders.jsx';
import OrderDetail from './pages/OrderDetail.jsx';
import Track from './pages/Track.jsx';
import Auth from './pages/Auth.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import AdminOrders from './pages/admin/AdminOrders.jsx';
import AdminProducts from './pages/admin/AdminProducts.jsx';

export default function App() {
  const { booted, isAdmin, toasts, dismissToast, cartCount } = useApp();
  const [cartOpen, setCartOpen] = useState(false);

  if (!booted) return <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}><div className="row" style={{ gap: 12, color: '#8b94ad' }}><span className="spin" /> Booting OrderPilot…</div></div>;

  return (
    <>
      <Nav onOpenCart={() => setCartOpen(true)} />
      <div className="wrap page">
        <Routes>
          <Route path="/" element={<Shop />} />
          <Route path="/orders" element={<MyOrders />} />
          <Route path="/orders/:id" element={<OrderDetail />} />
          <Route path="/track" element={<Track />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin" element={isAdmin ? <AdminLayout /> : <Navigate to="/" replace state={{ needAdmin: true }} />}>
            <Route index element={<Dashboard />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="products" element={<AdminProducts />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
      {cartOpen && <CartDrawer onClose={() => setCartOpen(false)} />}
      <Toasts items={toasts} onDismiss={dismissToast} />
      <footer className="wrap" style={{ padding: '26px 0 40px', color: '#5c6478', fontSize: 12.5, display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="logo-mark" style={{ width: 22, height: 22, fontSize: 12, borderRadius: 7 }}>🛒</span>
        <span><b style={{ color: '#8b94ad' }}>OrderPilot</b> — full-stack order management demo · React 18 + Vite · Express 4 · SQLite (WAL)</span>
        <span style={{ marginLeft: 'auto' }}>cart: <b className="kbd">{cartCount}</b></span>
      </footer>
    </>
  );
}
