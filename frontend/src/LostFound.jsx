import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, MapPin, Plus, Search, Tag, X } from 'lucide-react';
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

const today = () => new Date().toISOString().slice(0, 10);

export default function LostFound({ user, notify }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('open');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [compose, setCompose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ itemType: 'lost', title: '', category: '', description: '', location: '', reportedOn: today() });
  const canPost = ['student', 'trainer', 'coordinator', 'admin'].includes(user.role);

  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (filter === 'open' && item.status !== 'open') return false;
      if (filter === 'resolved' && item.status !== 'resolved') return false;
      return !query || [item.title, item.category, item.description, item.location].some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [filter, items, search]);

  useEffect(() => {
    api('/lost-found')
      .then(setItems)
      .catch((loadFailure) => setLoadError(loadFailure.message))
      .finally(() => setLoading(false));
  }, []);

  async function createReport(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const report = await api('/lost-found', { method: 'POST', body: JSON.stringify(form) });
      setItems((current) => [report, ...current]);
      setForm({ itemType: 'lost', title: '', category: '', description: '', location: '', reportedOn: today() });
      setCompose(false);
      notify('Lost & Found report posted.');
    } catch (createFailure) {
      setError(createFailure.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(item) {
    const status = item.status === 'open' ? 'resolved' : 'open';
    try {
      const updated = await api(`/lost-found/${encodeURIComponent(item.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
      notify(status === 'resolved' ? 'Report marked as resolved.' : 'Report reopened.');
    } catch (updateFailure) {
      notify(updateFailure.message);
    }
  }

  return <div className="page-content">
    <div className="page-heading">
      <div><p className="eyebrow">HELP YOUR CAMPUS COMMUNITY</p><h1>Lost something? Found something?</h1><p className="heading-desc">Post an item or search reports to help it find its way back.</p></div>
      {canPost && <button className="button-primary" onClick={() => { setError(''); setCompose(true); }}><Plus size={16} /> Post an item</button>}
    </div>
    <section className="lost-found-toolbar" aria-label="Search and filter reports">
      <label className="lost-found-search"><Search size={16} /><input aria-label="Search lost and found items" placeholder="Search items, places, or categories" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="events-filters">
        {[['open', 'Open reports'], ['all', 'All reports'], ['resolved', 'Resolved']].map(([value, label]) =>
          <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        )}
      </div>
    </section>
    {loadError && <p className="error-message" role="alert">{loadError}</p>}
    {loading ? <div className="panel events-empty"><Search size={21} /><p>Loading Lost & Found reports…</p></div>
      : visibleItems.length ? <div className="lost-found-list">{visibleItems.map((item) => (
        <article className={`panel lost-found-card ${item.status === 'resolved' ? 'resolved' : ''}`} key={item.id}>
          <span className={`lost-found-type ${item.item_type}`}><Tag size={15} />{item.item_type === 'lost' ? 'Lost item' : 'Found item'}</span>
          <div className="lost-found-details"><div className="lost-found-title"><h2>{item.title}</h2><span className={`badge ${item.status === 'resolved' ? 'subtle' : 'review'}`}>{item.status === 'resolved' ? 'Resolved' : 'Looking for owner'}</span></div>
            <p>{item.description}</p><div className="event-meta"><span><Tag size={14} />{item.category}</span><span><MapPin size={14} />{item.location}</span><span><CalendarDays size={14} />{new Date(`${item.reported_on}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
          </div>
          {(item.created_by_me || user.role === 'admin') && <button className="button-secondary lost-found-status" onClick={() => updateStatus(item)}>{item.status === 'open' ? <><Check size={15} /> Mark resolved</> : 'Reopen'}</button>}
        </article>
      ))}</div> : <div className="panel events-empty"><Search size={21} /><h2>{search ? 'No matching reports.' : filter === 'resolved' ? 'No resolved reports.' : 'No reports here yet.'}</h2><p>{search ? 'Try another search term.' : 'Post a lost or found item to let your campus community know.'}</p></div>}
    {compose && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="lost-found-modal-title">
      <div className="modal-top"><span className="modal-icon"><Search size={19} /></span><button className="icon-button" aria-label="Close" onClick={() => setCompose(false)}><X size={19} /></button></div>
      <p className="eyebrow">CAMPUS LOST & FOUND</p><h2 id="lost-found-modal-title">Post an item report.</h2>
      <form onSubmit={createReport}>
        <label htmlFor="lost-found-type">Report type</label><select id="lost-found-type" value={form.itemType} onChange={(event) => setForm({ ...form, itemType: event.target.value })}><option value="lost">I lost an item</option><option value="found">I found an item</option></select>
        <label htmlFor="lost-found-title">Item name</label><input id="lost-found-title" required minLength={2} maxLength={100} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <label htmlFor="lost-found-category">Category</label><input id="lost-found-category" required minLength={2} maxLength={50} placeholder="e.g. Electronics, books, keys" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
        <label htmlFor="lost-found-description">Description</label><textarea id="lost-found-description" required minLength={5} maxLength={1000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <label htmlFor="lost-found-location">Where was it lost or found?</label><input id="lost-found-location" required minLength={2} maxLength={120} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
        <label htmlFor="lost-found-date">Date</label><input id="lost-found-date" type="date" required max={today()} value={form.reportedOn} onChange={(event) => setForm({ ...form, reportedOn: event.target.value })} />
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setCompose(false)}>Cancel</button><button className="button-dark" disabled={busy}>{busy ? 'Posting…' : 'Post report'} <Plus size={15} /></button></div>
      </form>
    </section></div>}
  </div>;
}
