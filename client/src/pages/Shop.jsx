// OrderPilot — storefront: search, filter, sort, add-to-cart with live stock
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, INR } from '../api.js';
import { useApp } from '../store.jsx';
import { Skeleton } from '../components/ui.jsx';

export default function Shop() {
  const { user, addToCart, inCart, toast, cartCount } = useApp();
  const nav = useNavigate();
  const [products, setProducts] = useState(null);
  const [cats, setCats] = useState([]);
  const [cat, setCat] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('');

  useEffect(() => {
    api.categories().then((r) => setCats(r.items)).catch(() => {});
  }, []);
  useEffect(() => {
    const h = setTimeout(() => {
      api.products({ q: q || undefined, category: cat || undefined, sort: sort || undefined })
        .then((r) => setProducts(r.items))
        .catch((e) => toast(e.message, 'error'));
    }, q ? 240 : 0);
    return () => clearTimeout(h);
  }, [q, cat, sort]); // eslint-disable-line

  return (
    <>
      <section className="hero">
        <span className="float">📦</span>
        <div className="chip" style={{ color: '#22d3ee', background: 'rgba(34,211,238,.1)', borderColor: 'rgba(34,211,238,.35)', marginBottom: 14, padding: '6px 12px' }}>
          <span className="dot live" /> Live order management · full-stack demo
        </div>
        <h1 className="h1" style={{ fontSize: 'clamp(26px, 4vw, 40px)', maxWidth: 640 }}>
          Gear that ships in <span className="grad-text">seconds.</span><br />Orders you can actually track.
        </h1>
        <p className="sub" style={{ maxWidth: 520, fontSize: 15 }}>Place → confirm → pack → ship → deliver. Update address, cancel before dispatch, track by order number — the entire lifecycle, powered by a real REST API.</p>
        <div className="row mt16 wrapline">
          {!user && <button className="btn primary" onClick={() => nav('/auth')}>Create an account — it's instant</button>}
          <button className="btn" onClick={() => nav('/track')}>📮 Track an order</button>
          {cartCount > 0 && user && <button className="btn ok" onClick={() => nav('/orders')}>You have {cartCount} item{cartCount > 1 ? 's' : ''} in cart</button>}
          <span className="small faint hide-sm" style={{ marginLeft: 'auto' }}>Try code <span className="kbd">FIRST10</span> at checkout</span>
        </div>
      </section>

      <div className="row between wrapline" style={{ gap: 12 }}>
        <div className="row wrapline" style={{ gap: 8 }}>
          <button className={`chip chip-btn ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>All</button>
          {cats.map((c) => <button key={c.category} className={`chip chip-btn ${cat === c.category ? 'on' : ''}`} onClick={() => setCat(c.category === cat ? '' : c.category)}>{icon(c.category)} {c.category} <span className="faint">{c.n}</span></button>)}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input className="input" style={{ width: 200 }} placeholder="🔍 search products…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="select" style={{ width: 150 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="">Featured</option><option value="price_asc">Price ↑</option><option value="price_desc">Price ↓</option><option value="name">Name A–Z</option>
          </select>
        </div>
      </div>

      {!products ? (
        <div className="pgrid">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={230} style={{ borderRadius: 20 }} />)}</div>
      ) : products.length === 0 ? (
        <div className="empty"><div className="e-ic">🕵️</div><b>No products match.</b><p className="sub">Try clearing search or filters.</p></div>
      ) : (
        <div className="pgrid">
          {products.map((p, i) => <ProductCard key={p.id} p={p} delay={i} onAdd={() => { if (!user) { toast('Sign in to add to cart.', 'warn'); return nav('/auth'); } addToCart(p); toast(`${p.emoji} ${p.name} added to cart`, 'success', 1800); }} inCart={inCart(p.id)} />)}
        </div>
      )}
    </>
  );
}

const icon = (c) => ({ audio: '🎧', wearables: '⌚', accessories: '🎮', power: '🔌', home: '🏠', general: '📦' }[c] || '🏷️');

function ProductCard({ p, onAdd, inCart, delay }) {
  const out = p.stock === 0;
  const low = p.stock > 0 && p.stock <= 5;
  return (
    <article className="card pcard" style={{ animation: `pageIn .4s ${delay * 40}ms both` }}>
      <div className="pthumb" style={{ background: `radial-gradient(140px 90px at 50% 20%, ${p.accent}33, transparent 70%)` }}>
        <span style={{ filter: `drop-shadow(0 12px 22px ${p.accent}55)`, transform: 'scale(1.06)' }}>{p.emoji}</span>
        <span className="chip stock-tag" style={out ? { color: '#ef4444', background: 'rgba(239,68,68,.14)' } : low ? { color: '#f59e0b', background: 'rgba(245,158,11,.14)' } : { color: '#22c55e', background: 'rgba(34,197,94,.1)' }}>
          <span className={`dot ${low ? 'live' : ''}`} />{out ? 'Out of stock' : low ? `Only ${p.stock} left` : `${p.stock} in stock`}
        </span>
      </div>
      <div className="pbody">
        <div className="row between"><span className="small faint mono">{p.sku}</span><span className="small" style={{ color: p.accent }}>{icon(p.category)} {p.category}</span></div>
        <b style={{ fontSize: 14.5, lineHeight: 1.3, minHeight: 36 }}>{p.name}</b>
        <p className="small faint" style={{ margin: 0, lineHeight: 1.45, height: 36, overflow: 'hidden' }}>{p.description}</p>
        <div className="row between" style={{ marginTop: 8 }}>
          <b style={{ fontSize: 17 }}>{INR(p.price)}</b>
          <button className="btn primary sm" disabled={out} onClick={onAdd}>{inCart ? `In cart × ${inCart} ✓` : out ? 'Sold out' : 'Add to cart'}</button>
        </div>
      </div>
    </article>
  );
}
