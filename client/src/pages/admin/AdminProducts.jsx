// OrderPilot — product & inventory console: inline stock nudges, price edits, new SKU form
import { useCallback, useEffect, useState } from 'react';
import { api, INR } from '../../api.js';
import { useApp } from '../../store.jsx';
import { Modal, Field, Spinner } from '../../components/ui.jsx';

export default function AdminProducts() {
  const { token, toast } = useApp();
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null); // product | 'new'
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.products({ sort: '' }).then((r) => setItems(r.items)).catch((e) => toast(e.message, 'error')), []); // eslint-disable-line
  useEffect(load, [load]);

  const nudge = async (p, delta) => {
    try { await api.patchProduct(p.id, { stock: Math.max(0, p.stock + delta) }, token); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const save = async (body, id) => {
    setBusy(true);
    try {
      if (id) await api.patchProduct(id, body, token);
      else await api.createProduct(body, token);
      toast(id ? 'Product updated ✓' : 'SKU created 🎉', 'success');
      setEditing(null); load();
    } catch (e) { toast(e.message, 'error', 6000); } finally { setBusy(false); }
  };

  const stockLevel = (s) => s === 0 ? { c: '#ef4444', t: 'OUT' } : s <= 5 ? { c: '#f59e0b', t: 'LOW' } : { c: '#22c55e', t: 'OK' };

  return (
    <div>
      <div className="row between">
        <p className="sub mb0">Live inventory — every order placement decrements stock; cancellations restock automatically.</p>
        <button className="btn primary sm" onClick={() => setEditing('new')}>＋ New SKU</button>
      </div>
      {!items ? <div className="mt16"><Spinner /></div> : (
        <div className="card mt16" style={{ padding: '4px 0 8px', overflow: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>SKU</th><th>Product</th><th>Category</th><th className="num">Price</th><th>Stock</th><th>Inventory</th><th /></tr></thead>
            <tbody>
              {items.map((p) => {
                const lv = stockLevel(p.stock);
                return (
                  <tr key={p.id}>
                    <td className="mono">{p.sku}</td>
                    <td><span style={{ marginRight: 8 }}>{p.emoji}</span><b>{p.name}</b></td>
                    <td className="small mut">{p.category}</td>
                    <td className="num">{INR(p.price)}</td>
                    <td><span className="chip" style={{ color: lv.c, background: `color-mix(in srgb, ${lv.c} 12%, transparent)` }}><span className={`dot ${p.stock <= 5 ? 'live' : ''}`} />{p.stock}</span></td>
                    <td style={{ width: 110 }}>
                      <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,.08)', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, (p.stock / 80) * 100)}%`, height: '100%', background: lv.c, transition: '.4s' }} />
                      </div>
                    </td>
                    <td>
                      <div className="row" style={{ gap: 5 }} onClick={(e) => e.stopPropagation()}>
                        <button className="btn xs" onClick={() => nudge(p, -1)}>−1</button>
                        <button className="btn xs" onClick={() => nudge(p, +1)}>+1</button>
                        <button className="btn xs" onClick={() => nudge(p, +10)}>+10</button>
                        <button className="btn xs ghost" onClick={() => setEditing(p)}>edit</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductModal
          p={editing === 'new' ? null : editing}
          busy={busy} onClose={() => setEditing(null)} onSave={(body) => save(body, editing === 'new' ? null : editing.id)}
        />
      )}
    </div>
  );
}

function ProductModal({ p, onClose, onSave, busy }) {
  const [f, setF] = useState(p ? { ...p } : { sku: '', name: '', category: 'general', price: '', stock: 0, emoji: '📦', accent: '#6366f1', description: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal onClose={onClose} wide>
      <h2 className="h2">{p ? `Edit ${p.sku}` : 'New product'}</h2>
      <div className="mt16 grid-2">
        <Field label="SKU"><input className="input mono" value={f.sku} onChange={set('sku')} disabled={!!p} placeholder="NEW-ABC1" /></Field>
        <Field label="Name"><input className="input" value={f.name} onChange={set('name')} /></Field>
      </div>
      <Field label="Description"><input className="input" value={f.description} onChange={set('description')} /></Field>
      <div className="grid-2">
        <Field label="Price (₹)"><input className="input" type="number" min="1" value={f.price} onChange={set('price')} /></Field>
        <Field label="Stock"><input className="input" type="number" min="0" value={f.stock} onChange={set('stock')} /></Field>
      </div>
      <div className="grid-2">
        <Field label="Category">
          <select className="select" value={f.category} onChange={set('category')}>
            {['audio', 'wearables', 'accessories', 'power', 'home', 'general'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Emoji tile"><input className="input" value={f.emoji} onChange={set('emoji')} maxLength={4} /></Field>
      </div>
      <div className="row mt10" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={() => onSave({ ...f, price: Number(f.price), stock: Number(f.stock) })}>
          {busy ? <Spinner small /> : p ? 'Save changes' : 'Create product'}
        </button>
      </div>
    </Modal>
  );
}
