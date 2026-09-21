// OrderPilot — admin dashboard: KPIs, revenue chart, status donut, funnel, low-stock, live feed
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, INR, rel, STATUS_META } from '../../api.js';
import { useApp } from '../../store.jsx';
import { StatusChip, Skeleton } from '../../components/ui.jsx';
import { BarChart, Donut, Funnel } from '../../components/charts.jsx';

export default function Dashboard() {
  const { token, toast } = useApp();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const [ov, rev, top, fun, recent] = await Promise.all([
        api.overview(token), api.revenueDaily(14, token), api.topProducts(token), api.funnel(token),
        api.listOrders({ limit: 6 }, token),
      ]);
      setD({ ov, rev, top, fun, recent });
    } catch (e) { toast(e.message, 'error'); }
  }, [token]); // eslint-disable-line
  useEffect(() => { load(); const h = setInterval(load, 25000); return () => clearInterval(h); }, [load, tick]);

  if (!d) return <div className="kpis">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={92} style={{ borderRadius: 18 }} />)}</div>;
  const { ov, rev, top, fun, recent } = d;

  const kpis = [
    { l: 'Total revenue', v: INR(ov.totals.revenue), c: '#22c55e', s: `today +${INR(ov.totals.revenue_today)}`, icon: '💰' },
    { l: 'Orders', v: ov.totals.orders, c: '#6d7cff', s: `${ov.totals.orders_today} today · ${ov.totals.in_transit} in transit`, icon: '🧾' },
    { l: 'Avg order value', v: INR(ov.totals.aov), c: '#22d3ee', s: `${ov.customers} customers`, icon: '📈' },
    { l: 'Needs action', v: ov.totals.needs_action, c: '#f59e0b', s: `pending confirm/pack queue`, icon: '🚨', action: () => nav('/admin/orders?status=PENDING') },
    { l: 'Catalog health', v: `${ov.catalog.products} SKUs`, c: '#a855f7', s: `${ov.catalog.low_stock || 0} low · ${ov.catalog.out_of_stock || 0} out of stock`, icon: '🏷️', action: () => nav('/admin/products') },
  ];

  const donutParts = Object.entries(ov.by_status).filter(([, n]) => n > 0).map(([s, n]) => ({ label: s.replace(/_/g, ' ').toLowerCase(), value: n, color: chipColor(s) }));

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div className="kpis">
        {kpis.map((k, i) => (
          <div key={i} className="card kpi" style={{ animation: `pageIn .4s ${i * 60}ms both`, cursor: k.action ? 'pointer' : 'default' }} onClick={k.action}>
            <span className="glow" style={{ background: k.c }} />
            <div className="l"><span>{k.icon}</span>{k.l}{k.action && <span className="faint" style={{ marginLeft: 'auto' }}>→</span>}</div>
            <div className="v" style={{ color: k.c }}>{k.v}</div>
            <div className="small faint">{k.s}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 18 }}>
        <section className="card" style={{ padding: 20 }}>
          <div className="row between"><h2 className="h2">Revenue · last 14 days</h2><span className="small faint">excludes cancelled</span></div>
          <div className="mt16"><BarChart data={rev.series} /></div>
        </section>
        <section className="card" style={{ padding: 20 }}>
          <h2 className="h2">Orders by status</h2>
          <div className="mt16"><Donut parts={donutParts} /></div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 18 }}>
        <section className="card" style={{ padding: 20 }}>
          <h2 className="h2">Fulfilment funnel</h2>
          <p className="small faint mb0">live orders that reached each stage</p>
          <div className="mt16"><Funnel stages={fun.stages} counts={fun.counts} /></div>
        </section>
        <section className="card" style={{ padding: 20 }}>
          <h2 className="h2">🏆 Top sellers</h2>
          <div className="mt10">
            {top.items.map((p, i) => (
              <div key={i} className="row between" style={{ padding: '8px 0', borderBottom: '1px dashed rgba(255,255,255,.06)' }}>
                <span className="row" style={{ gap: 10 }}>
                  <span className="mini" style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'var(--grad-soft)' }}>{p.emoji}</span>
                  <span style={{ fontSize: 13.5 }}><b>{p.name}</b><span className="small faint" style={{ marginLeft: 8 }}>{p.units} sold</span></span>
                </span>
                <b className="mono small">{INR(p.revenue)}</b>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card" style={{ padding: '6px 0 10px' }}>
        <div className="row between" style={{ padding: '14px 20px 8px' }}><h2 className="h2">⚡ Latest orders</h2><button className="btn ghost sm" onClick={() => nav('/admin/orders')}>Open ops table →</button></div>
        <table className="tbl">
          <thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Items</th><th className="num">Total</th><th>Updated</th></tr></thead>
          <tbody>
            {recent.items.map((o) => (
              <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/orders/${o.id}`)}>
                <td className="mono">{o.order_number}</td>
                <td>{o.customer_name}</td>
                <td><StatusChip status={o.status} /></td>
                <td className="small mut">{o.unit_count} units</td>
                <td className="num">{INR(o.total)}</td>
                <td className="small faint">{rel(o.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

const chipColor = (s) => STATUS_META[s]?.color || '#8b94ad';
