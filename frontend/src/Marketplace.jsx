import { useEffect, useMemo, useState } from 'react';
import { Check, IndianRupee, MapPin, Plus, Search, ShoppingBag, X } from 'lucide-react';
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

const EMPTY_FORM = { title: '', category: '', description: '', price: '', condition: 'good', location: '' };
const CONDITION_LABELS = { new: 'New', like_new: 'Like new', good: 'Good', fair: 'Fair' };
const currency = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

export default function Marketplace({ user, notify }) {
  const [listings, setListings] = useState([]);
  const [filter, setFilter] = useState('available');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [compose, setCompose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const canList = user.role === 'student';

  const visibleListings = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return listings.filter((listing) => {
      if (filter === 'available' && listing.status !== 'available') return false;
      if (filter === 'sold' && listing.status !== 'sold') return false;
      return !query || [listing.title, listing.category, listing.description, listing.location, listing.seller_name]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [filter, listings, search]);

  useEffect(() => {
    api('/marketplace')
      .then(setListings)
      .catch((loadFailure) => setLoadError(loadFailure.message))
      .finally(() => setLoading(false));
  }, []);

  async function createListing(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const listing = await api('/marketplace', {
        method: 'POST',
        body: JSON.stringify({ ...form, price: Number(form.price) })
      });
      setListings((current) => [listing, ...current]);
      setForm(EMPTY_FORM);
      setCompose(false);
      notify('Your item is now listed in the marketplace.');
    } catch (createFailure) {
      setError(createFailure.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(listing) {
    const status = listing.status === 'available' ? 'sold' : 'available';
    try {
      const updated = await api(`/marketplace/${encodeURIComponent(listing.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      setListings((current) => current.map((item) => item.id === listing.id ? updated : item));
      notify(status === 'sold' ? 'Listing marked as sold.' : 'Listing is available again.');
    } catch (updateFailure) {
      notify(updateFailure.message);
    }
  }

  return <div className="page-content">
    <div className="page-heading">
      <div><p className="eyebrow">BUY, SELL, AND REUSE ON CAMPUS</p><h1>A little marketplace, close to home.</h1><p className="heading-desc">Find useful second-hand items from your campus community, or list something you no longer need.</p></div>
      {canList && <button className="button-primary" onClick={() => { setError(''); setCompose(true); }}><Plus size={16} /> List an item</button>}
    </div>
    <section className="lost-found-toolbar" aria-label="Search and filter marketplace listings">
      <label className="lost-found-search"><Search size={16} /><input aria-label="Search marketplace listings" placeholder="Search items, categories, or campus locations" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="events-filters">
        {[['available', 'Available'], ['all', 'All listings'], ['sold', 'Sold']].map(([value, label]) =>
          <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        )}
      </div>
    </section>
    {loadError && <p className="error-message" role="alert">{loadError}</p>}
    {loading ? <div className="panel events-empty"><ShoppingBag size={21} /><p>Loading marketplace listings…</p></div>
      : visibleListings.length ? <div className="marketplace-list">{visibleListings.map((listing) => (
        <article className={`panel marketplace-card ${listing.status === 'sold' ? 'sold' : ''}`} key={listing.id}>
          <span className="marketplace-item-icon"><ShoppingBag size={19} /></span>
          <div className="marketplace-details">
            <div className="marketplace-title"><h2>{listing.title}</h2><span className={`badge ${listing.status === 'sold' ? 'subtle' : 'review'}`}>{listing.status === 'sold' ? 'Sold' : 'Available'}</span></div>
            <p>{listing.description}</p>
            <div className="event-meta"><span><IndianRupee size={14} />{currency.format(listing.price)}</span><span>{CONDITION_LABELS[listing.condition]}</span><span>{listing.category}</span><span><MapPin size={14} />{listing.location}</span><span>Listed by {listing.seller_name}</span></div>
          </div>
          {(listing.created_by_me || user.role === 'admin') && <button className="button-secondary marketplace-status" onClick={() => updateStatus(listing)}>{listing.status === 'available' ? <><Check size={15} /> Mark sold</> : 'Relist'}</button>}
        </article>
      ))}</div> : <div className="panel events-empty"><ShoppingBag size={21} /><h2>{search ? 'No matching listings.' : filter === 'sold' ? 'No sold listings.' : 'No items listed yet.'}</h2><p>{search ? 'Try another search.' : 'Check back soon, or list an item you no longer need.'}</p></div>}
    {compose && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="marketplace-modal-title">
      <div className="modal-top"><span className="modal-icon"><ShoppingBag size={19} /></span><button className="icon-button" aria-label="Close" onClick={() => setCompose(false)}><X size={19} /></button></div>
      <p className="eyebrow">STUDENT MARKETPLACE</p><h2 id="marketplace-modal-title">List an item for sale.</h2>
      <form onSubmit={createListing}>
        <label htmlFor="marketplace-title">Item name</label><input id="marketplace-title" required minLength={2} maxLength={100} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        <label htmlFor="marketplace-category">Category</label><input id="marketplace-category" required minLength={2} maxLength={50} placeholder="e.g. Books, electronics, furniture" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
        <label htmlFor="marketplace-description">Description</label><textarea id="marketplace-description" required minLength={5} maxLength={1000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        <label htmlFor="marketplace-price">Price (INR)</label><input id="marketplace-price" type="number" required min="1" max="10000000" step="1" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} />
        <label htmlFor="marketplace-condition">Condition</label><select id="marketplace-condition" value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value })}>{Object.entries(CONDITION_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
        <label htmlFor="marketplace-location">Campus pickup location</label><input id="marketplace-location" required minLength={2} maxLength={120} value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setCompose(false)}>Cancel</button><button className="button-dark" disabled={busy}>{busy ? 'Publishing…' : 'Publish listing'} <Plus size={15} /></button></div>
      </form>
    </section></div>}
  </div>;
}
