import { useEffect, useMemo, useState } from 'react';
import { Coffee, Leaf, Search, Utensils } from 'lucide-react';
import { apiUrl } from './api-base.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const currentWeekday = () => {
  const day = new Date().getDay();
  return day === 0 ? 'Monday' : WEEKDAYS[day - 1];
};

async function api(path) {
  const response = await fetch(apiUrl(path), { credentials: 'include' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not load the canteen menu.');
  return result;
}

export default function CanteenMenu() {
  const [day, setDay] = useState(currentWeekday);
  const [menu, setMenu] = useState(null);
  const [query, setQuery] = useState('');
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api(`/canteen/menu?day=${encodeURIComponent(day)}`)
      .then((result) => { if (active) setMenu(result); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [day]);

  const visibleMeals = useMemo(() => (menu?.meals || []).filter((meal) => (
    (!vegetarianOnly || meal.vegetarian)
      && (!query.trim() || `${meal.name} ${meal.category} ${meal.description}`.toLowerCase().includes(query.trim().toLowerCase()))
  )), [menu, query, vegetarianOnly]);

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">A LITTLE SOMETHING GOOD</p><h1>Campus canteen.</h1><p className="heading-desc">See what’s on the menu today and find something that sounds good.</p></div></div>
    <section className="canteen-menu-hero panel"><span className="canteen-menu-mark"><Utensils size={23} /></span><div><p className="eyebrow">TODAY’S CAMPUS MENU</p><h2>{day} at the Dining Hall</h2><p>{menu?.hours || 'Monday–Saturday · 8:00 AM–5:00 PM'}</p></div><span className="canteen-demo-label">SAMPLE MENU</span></section>
    <div className="canteen-menu-toolbar">
      <label className="canteen-day-picker">Menu for<select aria-label="Menu for day" value={day} onChange={(event) => setDay(event.target.value)}>{WEEKDAYS.map((weekday) => <option value={weekday} key={weekday}>{weekday}</option>)}</select></label>
      <label className="canteen-menu-search"><Search size={16} /><input aria-label="Search menu" placeholder="Search meals or categories" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="canteen-veg-filter"><input type="checkbox" checked={vegetarianOnly} onChange={(event) => setVegetarianOnly(event.target.checked)} /> Vegetarian only</label>
    </div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {loading ? <div className="events-empty"><Coffee size={20} /><p>Loading today’s menu…</p></div>
      : visibleMeals.length ? <section className="canteen-meal-grid" aria-label={`${day} canteen menu`}>{visibleMeals.map((meal) => <article className={`panel canteen-meal-card ${meal.available ? '' : 'sold-out'}`} key={meal.id}>
        <div className={`canteen-meal-icon ${meal.vegetarian ? 'vegetarian' : ''}`}>{meal.vegetarian ? <Leaf size={17} /> : <Utensils size={17} />}</div>
        <div className="canteen-meal-details"><span className="canteen-meal-category">{meal.category} · {meal.vegetarian ? 'Vegetarian' : 'Non-vegetarian'}</span><h3>{meal.name}</h3><p>{meal.description}</p><small>{meal.serving_time}</small></div>
        <div className="canteen-meal-price"><strong>₹{meal.price}</strong><span className={meal.available ? 'meal-available' : 'meal-sold-out'}>{meal.available ? 'Available' : 'Sold out'}</span></div>
      </article>)}</section> : <div className="events-empty"><Utensils size={20} /><h2>No matching meals.</h2><p>Try a different search or turn off the vegetarian filter.</p></div>}
    <p className="canteen-menu-note">Menu, prices, and availability are illustrative sample data; check with the canteen for current offerings.</p>
  </div>;
}
