import { useEffect, useState } from 'react';
import { AlertTriangle, Bus, Check, Clock3, Plus, RefreshCw } from 'lucide-react';
import { apiUrl } from './api-base.js';

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}

function formatTime(value) {
  return new Date(`2000-01-01T${value}:00`).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function TransportUpdates({ user, notify }) {
  const [data, setData] = useState({ routes: [], updates: [] });
  const [form, setForm] = useState({ routeId: 'all', type: 'delay', message: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const canManage = ['coordinator', 'admin'].includes(user.role);

  async function loadUpdates() {
    setData(await api('/transport/updates'));
  }

  useEffect(() => {
    let active = true;
    api('/transport/updates')
      .then((result) => { if (active) setData(result); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function publishUpdate(event) {
    event.preventDefault();
    setError('');
    setBusy('publish');
    try {
      await api('/transport/updates', { method: 'POST', body: JSON.stringify(form) });
      setForm((current) => ({ ...current, message: '' }));
      await loadUpdates();
      notify('Transport update published.');
    } catch (publishError) {
      setError(publishError.message);
    } finally {
      setBusy('');
    }
  }

  async function resolveUpdate(update) {
    setError('');
    setBusy(update.id);
    try {
      await api(`/transport/updates/${encodeURIComponent(update.id)}`, { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
      await loadUpdates();
      notify('Transport update marked resolved.');
    } catch (resolveError) {
      setError(resolveError.message);
    } finally {
      setBusy('');
    }
  }

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">GET THERE WITH CONFIDENCE</p><h1>Campus transport.</h1><p className="heading-desc">Check sample shuttle schedules and current service notices before you travel.</p></div><button className="button-secondary" onClick={() => { setLoading(true); loadUpdates().catch((loadError) => setError(loadError.message)).finally(() => setLoading(false)); }} disabled={loading}><RefreshCw size={14} /> Refresh</button></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {canManage && <form className="panel transport-update-form" onSubmit={publishUpdate}><div><p className="eyebrow">TRANSPORT OPERATIONS</p><h2>Post a service update.</h2></div><label htmlFor="transport-route">Route<select id="transport-route" value={form.routeId} onChange={(event) => setForm({ ...form, routeId: event.target.value })}><option value="all">All routes</option>{data.routes.map((route) => <option value={route.id} key={route.id}>{route.name}</option>)}</select></label><label htmlFor="transport-type">Update type<select id="transport-type" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}><option value="delay">Delay</option><option value="cancellation">Cancellation</option><option value="information">Information</option></select></label><label className="transport-update-message" htmlFor="transport-message">Message<input id="transport-message" required minLength={5} maxLength={300} placeholder="Share a clear, useful travel update" value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label><button className="button-dark" disabled={busy === 'publish'}>{busy === 'publish' ? 'Publishing…' : 'Publish update'} <Plus size={14} /></button></form>}
    <section className="transport-updates-section"><div className="section-title-row"><div><h2>Service updates</h2><p>Active notices from campus transport.</p></div><span className="transport-live-label"><span /> {data.updates.length} active</span></div>
      {loading ? <div className="events-empty"><Bus size={20} /><p>Loading transport information…</p></div>
        : data.updates.length ? <div className="transport-update-list">{data.updates.map((update) => <article className={`panel transport-update-card ${update.type}`} key={update.id}><span className="transport-update-icon"><AlertTriangle size={17} /></span><div><span className="transport-update-meta">{update.type} · {update.route_name} · {new Date(update.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span><p>{update.message}</p></div>{canManage && <button className="button-secondary small" disabled={busy === update.id} onClick={() => resolveUpdate(update)}><Check size={13} /> Resolve</button>}</article>)}</div>
          : <div className="events-empty"><Check size={20} /><h2>No active transport alerts.</h2><p>There are no current service notices.</p></div>}
    </section>
    <section className="transport-routes-section"><div className="section-title-row"><div><h2>Campus shuttle routes</h2><p>Sample weekday and Saturday timetable; confirm with campus staff before traveling.</p></div></div><div className="transport-route-grid">{data.routes.map((route) => <article className="panel transport-route-card" key={route.id}><div className="transport-route-heading"><span><Bus size={18} /></span><div><p className="eyebrow">{route.code}</p><h3>{route.name}</h3></div></div><p>{route.description}</p><div className="transport-route-stops">{route.stops.map((stop) => <div key={`${route.id}-${stop.name}`}><span className="transport-stop-dot" /><b>{stop.name}</b><small><Clock3 size={11} /> {formatTime(stop.time)}</small></div>)}</div><small className="transport-route-hours">{route.service_days} · {route.frequency}</small></article>)}</div></section>
    <p className="transport-prototype-note">Schedules and routes are illustrative prototype data and are not connected to a live vehicle tracking service.</p>
  </div>;
}
