import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, MapPin, Plus, Send, Users, X } from 'lucide-react';
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

function localDateTime(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function eventDate(value) {
  return new Date(value).toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function eventTime(value) {
  return new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

export default function Events({ user, notify }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('upcoming');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [compose, setCompose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => {
    const starts = new Date(Date.now() + 60 * 60 * 1000);
    const ends = new Date(starts.getTime() + 60 * 60 * 1000);
    return { title: '', description: '', location: '', startsAt: localDateTime(starts), endsAt: localDateTime(ends) };
  });
  const canCreate = ['trainer', 'coordinator', 'admin'].includes(user.role);
  const now = Date.now();
  const visibleEvents = useMemo(() => items.filter((event) => {
    const past = new Date(event.ends_at).getTime() <= now;
    if (filter === 'past') return past;
    if (filter === 'registered') return !past && event.is_attending;
    return !past;
  }), [filter, items, now]);

  useEffect(() => {
    api('/events')
      .then(setItems)
      .catch((loadFailure) => setLoadError(loadFailure.message))
      .finally(() => setLoading(false));
  }, []);

  async function createEvent(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const event = await api('/events', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString()
        })
      });
      setItems((current) => [...current, event].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setCompose(false);
      notify('Campus event created.');
    } catch (createFailure) {
      setError(createFailure.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateRsvp(event) {
    try {
      const updated = await api(`/events/${encodeURIComponent(event.id)}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ attending: !event.is_attending })
      });
      setItems((current) => current.map((item) => item.id === event.id ? updated : item));
      notify(updated.is_attending ? 'You’re on the event list.' : 'Your RSVP was cancelled.');
    } catch (rsvpFailure) {
      notify(rsvpFailure.message);
    }
  }

  return <div className="page-content">
    <div className="page-heading">
      <div><p className="eyebrow">WHAT’S HAPPENING ON CAMPUS</p><h1>Make room for something good.</h1><p className="heading-desc">Find campus events and let the community know when you’ll be there.</p></div>
      {canCreate && <button className="button-primary" onClick={() => { setError(''); setCompose(true); }}><Plus size={16} /> Create event</button>}
    </div>
    <section className="events-toolbar" aria-label="Filter events">
      <div className="events-filters">
        {[['upcoming', 'Upcoming'], ['registered', 'My RSVPs'], ['past', 'Past events']].map(([value, label]) =>
          <button key={value} className={filter === value ? 'active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
        )}
      </div>
      <span>{visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}</span>
    </section>
    {loadError && <p className="error-message" role="alert">{loadError}</p>}
    {loading ? <div className="panel events-empty"><CalendarDays size={21} /><p>Finding campus events…</p></div>
      : visibleEvents.length ? <div className="events-list">{visibleEvents.map((event) => {
        const past = new Date(event.ends_at).getTime() <= Date.now();
        return <article className="panel event-card" key={event.id}>
          <div className="event-date"><span>{new Date(event.starts_at).toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</span><strong>{new Date(event.starts_at).toLocaleDateString('en-IN', { day: '2-digit' })}</strong><small>{new Date(event.starts_at).toLocaleDateString('en-IN', { weekday: 'short' })}</small></div>
          <div className="event-details">
            <p className="eyebrow">{past ? 'PAST EVENT' : 'CAMPUS EVENT'}</p><h2>{event.title}</h2><p className="event-description">{event.description}</p>
            <div className="event-meta"><span><CalendarDays size={14} />{eventDate(event.starts_at)}</span><span><Clock3 size={14} />{eventTime(event.starts_at)} – {eventTime(event.ends_at)}</span><span><MapPin size={14} />{event.location}</span><span><Users size={14} />{event.attendance_count} attending</span></div>
          </div>
          {user.role === 'student' && !past && <button className={event.is_attending ? 'button-secondary event-rsvp attending' : 'button-dark event-rsvp'} onClick={() => updateRsvp(event)}>{event.is_attending ? <><Check size={15} /> Going</> : <><Send size={14} /> RSVP</>}</button>}
        </article>;
      })}</div> : <div className="panel events-empty"><CalendarDays size={21} /><h2>{filter === 'registered' ? 'No RSVPs yet.' : filter === 'past' ? 'No past events.' : 'Nothing on the calendar yet.'}</h2><p>{filter === 'registered' ? 'RSVP to an upcoming campus event and it will appear here.' : filter === 'past' ? 'Completed campus events will appear here.' : 'Check back soon for events from your campus community.'}</p></div>}
    {compose && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="event-modal-title">
      <div className="modal-top"><span className="modal-icon"><CalendarDays size={19} /></span><button className="icon-button" aria-label="Close" onClick={() => setCompose(false)}><X size={19} /></button></div>
      <p className="eyebrow">CAMPUS COMMUNITY</p><h2 id="event-modal-title">Create a campus event.</h2>
      <form onSubmit={createEvent}>
        <label htmlFor="event-title">Event name</label><input id="event-title" required minLength={3} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <label htmlFor="event-description">Description</label><textarea id="event-description" maxLength={2000} rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <label htmlFor="event-location">Location</label><input id="event-location" required minLength={2} maxLength={120} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <div className="event-form-times"><label htmlFor="event-start">Starts<input id="event-start" type="datetime-local" required value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} /></label><label htmlFor="event-end">Ends<input id="event-end" type="datetime-local" required value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></label></div>
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setCompose(false)}>Cancel</button><button className="button-dark" disabled={busy}>{busy ? 'Creating…' : 'Create event'} <Send size={15} /></button></div>
      </form>
    </section></div>}
  </div>;
}
