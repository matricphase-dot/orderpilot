// OrderPilot — global store: auth session, cart, toasts
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { api } from './api.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

let toastId = 0;

export function AppProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('op_token') || null);
  const [user, setUser] = useState(null);
  const [booted, setBooted] = useState(false);
  const [cart, setCart] = useState(() => { try { return JSON.parse(localStorage.getItem('op_cart') || '[]'); } catch { return []; } });
  const [toasts, setToasts] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);

  const toast = useCallback((message, type = 'info', ms = 4200) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);
  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id));

  useEffect(() => {
    if (!token) { setUser(null); setBooted(true); return; }
    let alive = true;
    api.me(token).then((r) => { if (alive) { setUser(r.user); setBooted(true); } })
      .catch(() => { localStorage.removeItem('op_token'); if (alive) { setToken(null); setUser(null); setBooted(true); } });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => { localStorage.setItem('op_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { token ? localStorage.setItem('op_token', token) : localStorage.removeItem('op_token'); }, [token]);

  const login = useCallback(async (email, password) => {
    const r = await api.login({ email, password });
    setUser(r.user); setToken(r.token);
    toast(`Welcome back, ${r.user.name.split(' ')[0]}! 👋`, 'success');
    return r.user;
  }, [toast]);

  const register = useCallback(async (payload) => {
    const r = await api.register(payload);
    setUser(r.user); setToken(r.token);
    toast(`Account created — welcome, ${r.user.name.split(' ')[0]}! 🎉`, 'success');
    return r.user;
  }, [toast]);

  const logout = useCallback(() => { setUser(null); setToken(null); toast('Signed out.', 'info', 2000); }, [toast]);

  const cartCount = useMemo(() => cart.reduce((s, l) => s + l.qty, 0), [cart]);
  const inCart = useCallback((id) => cart.find((l) => l.id === id)?.qty || 0, [cart]);

  const addToCart = useCallback((p, qty = 1) => {
    setCart((c) => {
      const ex = c.find((l) => l.id === p.id);
      const max = Math.min(p.stock, 99);
      if (ex) {
        if (ex.qty + qty > max) { toast(`Only ${max} of "${p.name}" in stock.`, 'warn'); return c.map((l) => l.id === p.id ? { ...l, qty: max } : l); }
        return c.map((l) => l.id === p.id ? { ...l, qty: l.qty + qty, price: p.price, stock: p.stock } : l);
      }
      if (qty > max) { toast(`Only ${max} of "${p.name}" in stock.`, 'warn'); return c; }
      return [...c, { id: p.id, name: p.name, price: p.price, emoji: p.emoji, accent: p.accent, qty: Math.min(qty, max), stock: p.stock }];
    });
  }, [toast]);

  const setQty = useCallback((id, qty) => {
    setCart((c) => qty <= 0 ? c.filter((l) => l.id !== id) : c.map((l) => l.id === id ? { ...l, qty: Math.min(qty, l.stock ?? 99) } : l));
  }, []);
  const clearCart = useCallback(() => setCart([]), []);

  const value = useMemo(() => ({
    token, user, booted, isAdmin: user?.role === 'admin',
    login, register, logout,
    cart, cartCount, inCart, addToCart, setQty, clearCart,
    cartOpen, setCartOpen,
    toasts, dismissToast, toast,
  }), [token, user, booted, login, register, logout, cart, cartCount, inCart, addToCart, setQty, clearCart, cartOpen, toasts, dismissToast, toast]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
