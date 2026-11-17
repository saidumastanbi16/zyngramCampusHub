import { useEffect, useState } from 'react';
import { BookOpen, Clock3, MapPin, Plus, Trash2 } from 'lucide-react';
import { apiUrl } from './api-base.js';

const SEATS = [
  ...Array.from({ length: 6 }, (_, index) => ({ id: `quiet-${String(index + 1).padStart(2, '0')}`, name: `Quiet desk ${String(index + 1).padStart(2, '0')}`, zone: 'Quiet study' })),
  ...Array.from({ length: 6 }, (_, index) => ({ id: `group-${String(index + 1).padStart(2, '0')}`, name: `Study desk ${String(index + 1).padStart(2, '0')}`, zone: 'Collaborative study' }))
];
const TIMES = Array.from({ length: 12 }, (_, index) => `${String(index + 8).padStart(2, '0')}:00`);
const dateValue = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const tomorrow = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return dateValue(date);
};
const latestDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return dateValue(date);
};

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

export default function LibrarySeatBooking({ user, notify }) {
  const [date, setDate] = useState(tomorrow);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ seatId: SEATS[0].id, time: TIMES[0] });
  const seatById = new Map(SEATS.map((seat) => [seat.id, seat]));
  const isStudent = user.role === 'student';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api(`/library-seat-bookings?date=${encodeURIComponent(date)}`)
      .then((result) => { if (active) setBookings(result); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date]);

  async function bookSeat(event) {
    event.preventDefault();
    setError('');
    setBusy('create');
    try {
      const booking = await api('/library-seat-bookings', {
        method: 'POST',
        body: JSON.stringify({ ...form, date })
      });
      setBookings((current) => [...current, booking].sort((a, b) => a.slot.localeCompare(b.slot)));
      notify(`${booking.seat_name} booked for ${booking.slot}.`);
    } catch (bookingError) {
      setError(bookingError.message);
    } finally {
      setBusy('');
    }
  }

  async function cancelBooking(booking) {
    setError('');
    setBusy(booking.id);
    try {
      await api(`/library-seat-bookings/${encodeURIComponent(booking.id)}`, { method: 'DELETE' });
      setBookings((current) => current.filter((item) => item.id !== booking.id));
      notify('Library seat booking cancelled.');
    } catch (cancelError) {
      setError(cancelError.message);
    } finally {
      setBusy('');
    }
  }

  const occupiedSlots = new Set(bookings.map((booking) => `${booking.seat_id}:${booking.slot}`));
  const availableSlots = TIMES.filter((time) => !occupiedSlots.has(`${form.seatId}:${time}`));

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">MAKE SPACE FOR FOCUS</p><h1>Book a library seat.</h1><p className="heading-desc">Reserve an individual study desk for a one-hour session.</p></div></div>
    <section className="library-seat-layout">
      {isStudent && <form className="panel library-seat-form" onSubmit={bookSeat}>
        <p className="eyebrow">NEW RESERVATION</p><h2>Choose your desk.</h2>
        <label htmlFor="library-seat-date">Date</label><input id="library-seat-date" type="date" min={dateValue(new Date())} max={latestDate()} required value={date} onChange={(event) => setDate(event.target.value)} />
        <label htmlFor="library-seat-id">Study area and seat</label><select id="library-seat-id" value={form.seatId} onChange={(event) => setForm({ ...form, seatId: event.target.value })}>{SEATS.map((seat) => <option value={seat.id} key={seat.id}>{seat.name} · {seat.zone}</option>)}</select>
        <label htmlFor="library-seat-time">Start time</label><select id="library-seat-time" required value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })}>{availableSlots.map((time) => <option value={time} key={time}>{time}</option>)}</select>
        {availableSlots.length === 0 && <p className="muted">No open time slots for this seat on this date.</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="button-dark" disabled={busy === 'create' || availableSlots.length === 0}>{busy === 'create' ? 'Booking…' : 'Book for one hour'} <Plus size={15} /></button>
        <small>Available Monday–Saturday, 8:00 AM–8:00 PM. Book up to 30 days ahead.</small>
      </form>}
      <section className="panel library-seat-schedule">
        <div className="room-schedule-heading"><div><p className="eyebrow">LIBRARY AVAILABILITY</p><h2>Bookings for {new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div><span>{bookings.length} reserved</span></div>
        {error && !isStudent && <p className="error-message" role="alert">{error}</p>}
        {loading ? <div className="events-empty"><BookOpen size={20} /><p>Checking library availability…</p></div>
          : bookings.length ? <div className="room-booking-list">{bookings.map((booking) => (
            <article className="room-booking-row" key={booking.id}><span className="room-booking-icon"><MapPin size={16} /></span><div><b>{booking.seat_name}</b><small><Clock3 size={12} /> {booking.slot}–{booking.ends_slot}</small><small>{seatById.get(booking.seat_id)?.zone || 'Library study area'}{booking.created_by_me ? ' · Your booking' : ''}</small></div>{booking.created_by_me && <button className="icon-button" disabled={busy === booking.id} aria-label={`Cancel ${booking.seat_name} booking`} title="Cancel booking" onClick={() => cancelBooking(booking)}><Trash2 size={15} /></button>}</article>
          ))}</div> : <div className="events-empty"><BookOpen size={20} /><h2>No seats booked yet.</h2><p>Choose an open seat and time to reserve your desk.</p></div>}
      </section>
    </section>
  </div>;
}
