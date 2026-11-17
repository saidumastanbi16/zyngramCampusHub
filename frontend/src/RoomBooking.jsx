import { useEffect, useState } from 'react';
import { CalendarDays, Clock3, MapPin, Plus, Trash2 } from 'lucide-react';
import { apiUrl } from './api-base.js';

const ROOMS = [
  { id: 'innovation-lab', name: 'Innovation Lab', type: 'Lab' },
  { id: 'computer-lab', name: 'Computer Lab', type: 'Lab' },
  { id: 'seminar-room-a', name: 'Seminar Room A', type: 'Study room' },
  { id: 'seminar-room-b', name: 'Seminar Room B', type: 'Study room' },
  { id: 'project-room', name: 'Project Room', type: 'Study room' }
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

export default function RoomBooking({ user, notify }) {
  const [date, setDate] = useState(tomorrow);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busySlot, setBusySlot] = useState('');
  const [form, setForm] = useState({ roomId: ROOMS[0].id, time: TIMES[0], purpose: '' });
  const roomById = new Map(ROOMS.map((room) => [room.id, room]));

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api(`/room-bookings?date=${encodeURIComponent(date)}`)
      .then((result) => { if (active) setBookings(result); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [date]);

  async function bookRoom(event) {
    event.preventDefault();
    setError('');
    setBusySlot('create');
    try {
      const booking = await api('/room-bookings', {
        method: 'POST',
        body: JSON.stringify({ ...form, date })
      });
      setBookings((current) => [...current, booking].sort((a, b) => a.slot.localeCompare(b.slot)));
      setForm((current) => ({ ...current, purpose: '' }));
      notify(`${booking.room_name} booked for ${booking.slot}.`);
    } catch (bookingError) {
      setError(bookingError.message);
    } finally {
      setBusySlot('');
    }
  }

  async function cancelBooking(booking) {
    setError('');
    setBusySlot(booking.id);
    try {
      await api(`/room-bookings/${encodeURIComponent(booking.id)}`, { method: 'DELETE' });
      setBookings((current) => current.filter((item) => item.id !== booking.id));
      notify('Room booking cancelled.');
    } catch (cancelError) {
      setError(cancelError.message);
    } finally {
      setBusySlot('');
    }
  }

  const occupiedSlots = new Set(bookings.map((booking) => `${booking.room_id}:${booking.slot}`));
  const availableSlots = TIMES.filter((time) => !occupiedSlots.has(`${form.roomId}:${time}`));

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">FIND A SPACE TO WORK TOGETHER</p><h1>Book a room or lab.</h1><p className="heading-desc">Reserve a campus room for one-hour study sessions or project work.</p></div></div>
    <section className="room-booking-layout">
      <form className="panel room-booking-form" onSubmit={bookRoom}>
        <p className="eyebrow">NEW RESERVATION</p><h2>Choose your time.</h2>
        <label htmlFor="room-booking-date">Date</label><input id="room-booking-date" type="date" min={dateValue(new Date())} max={latestDate()} required value={date} onChange={(event) => setDate(event.target.value)} />
        <label htmlFor="room-booking-room">Room or lab</label><select id="room-booking-room" value={form.roomId} onChange={(event) => setForm({ ...form, roomId: event.target.value })}>{ROOMS.map((room) => <option value={room.id} key={room.id}>{room.name} · {room.type}</option>)}</select>
        <label htmlFor="room-booking-time">Start time</label><select id="room-booking-time" required value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })}>{availableSlots.map((time) => <option value={time} key={time}>{time}</option>)}</select>
        {availableSlots.length === 0 && <p className="muted">No open time slots for this room on this date.</p>}
        <label htmlFor="room-booking-purpose">Purpose</label><input id="room-booking-purpose" required minLength={3} maxLength={120} placeholder="e.g. Group project meeting" value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} />
        {error && <p className="error-message" role="alert">{error}</p>}
        <button className="button-dark" disabled={busySlot === 'create' || availableSlots.length === 0}>{busySlot === 'create' ? 'Booking…' : 'Book for one hour'} <Plus size={15} /></button>
        <small>Available Monday–Saturday, 8:00 AM–8:00 PM. Book up to 30 days ahead.</small>
      </form>
      <section className="panel room-booking-schedule">
        <div className="room-schedule-heading"><div><p className="eyebrow">CAMPUS AVAILABILITY</p><h2>Bookings for {new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div><span>{bookings.length} reserved</span></div>
        {error && <p className="error-message" role="alert">{error}</p>}
        {loading ? <div className="events-empty"><CalendarDays size={20} /><p>Checking room availability…</p></div>
          : bookings.length ? <div className="room-booking-list">{bookings.map((booking) => (
            <article className="room-booking-row" key={booking.id}><span className="room-booking-icon"><MapPin size={16} /></span><div><b>{booking.room_name}</b><small><Clock3 size={12} /> {booking.slot}–{booking.ends_slot} · {booking.purpose}</small><small>{roomById.get(booking.room_id)?.type || 'Campus room'}{booking.created_by_me ? ' · Your booking' : ''}</small></div>{booking.created_by_me && <button className="icon-button" disabled={busySlot === booking.id} aria-label={`Cancel ${booking.room_name} booking`} title="Cancel booking" onClick={() => cancelBooking(booking)}><Trash2 size={15} /></button>}</article>
          ))}</div> : <div className="events-empty"><CalendarDays size={20} /><h2>No rooms booked yet.</h2><p>Choose an open slot to reserve a room.</p></div>}
      </section>
    </section>
  </div>;
}
