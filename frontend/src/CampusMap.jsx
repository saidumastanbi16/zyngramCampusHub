import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, BusFront, Coffee, GraduationCap, HeartPulse, MapPin, Search, Utensils, BookOpen } from 'lucide-react';
import { apiUrl } from './api-base.js';

const ICONS = { Academic: GraduationCap, Library: BookOpen, Dining: Utensils, Transit: BusFront, Wellness: HeartPulse, Cafe: Coffee };

async function loadLocations() {
  const response = await fetch(apiUrl('/campus-map'), { credentials: 'include' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not load the campus map.');
  return result;
}

export default function CampusMap() {
  const [locations, setLocations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadLocations()
      .then((items) => {
        setLocations(items);
        setSelectedId(items[0]?.id || '');
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => ['All', ...new Set(locations.map((location) => location.category))], [locations]);
  const visibleLocations = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return locations.filter((location) => {
      if (category !== 'All' && location.category !== category) return false;
      return !query || [location.name, location.category, location.description, location.hours]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [category, locations, search]);
  const selected = locations.find((location) => location.id === selectedId);

  function chooseCategory(nextCategory) {
    setCategory(nextCategory);
    const nextVisible = locations.filter((location) => nextCategory === 'All' || location.category === nextCategory);
    if (!nextVisible.some((location) => location.id === selectedId)) setSelectedId(nextVisible[0]?.id || '');
  }

  function chooseSearch(event) {
    const query = event.target.value;
    setSearch(query);
    const match = locations.find((location) => [location.name, location.category, location.description, location.hours]
      .some((value) => value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
    if (match) setSelectedId(match.id);
  }

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">GETTING AROUND CAMPUS</p><h1>Find your way around.</h1><p className="heading-desc">Explore campus places and check what each space offers.</p></div></div>
    <section className="campus-map-toolbar">
      <label className="lost-found-search"><Search size={16} /><input aria-label="Search campus locations" placeholder="Search places or facilities" value={search} onChange={chooseSearch} /></label>
      <div className="events-filters">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} onClick={() => chooseCategory(item)}>{item}</button>)}</div>
    </section>
    {error && <p className="error-message" role="alert">{error}</p>}
    {loading ? <div className="panel events-empty"><MapPin size={21} /><p>Loading campus map…</p></div> : <div className="campus-map-layout">
      <section className="campus-map panel" aria-label="Illustrative campus map">
        <div className="campus-map-label"><MapPin size={14} /> HYDERABAD CAMPUS</div>
        <svg className="campus-map-art" viewBox="0 0 1000 620" role="img" aria-label="Illustrative campus layout with buildings and walking paths">
          <rect x="14" y="14" width="972" height="592" rx="34" fill="#eef2e9" />
          <path d="M35 478 C185 455 262 501 382 461 S604 427 727 462 S894 488 972 456" fill="none" stroke="#d7ded1" strokeWidth="30" strokeLinecap="round" />
          <path d="M165 42 C175 140 126 197 160 278 S179 405 155 465 M520 31 C492 117 552 190 517 278 S480 392 510 470 M820 51 C792 153 854 213 810 303 S782 395 820 464" fill="none" stroke="#dfe5d8" strokeWidth="18" strokeLinecap="round" />
          <path d="M167 277 C280 251 360 294 517 278 S692 258 814 301" fill="none" stroke="#dfe5d8" strokeWidth="16" strokeLinecap="round" />
          <g fill="#dbe7d5">
            <circle cx="75" cy="90" r="20" /><circle cx="93" cy="152" r="14" /><circle cx="326" cy="72" r="19" /><circle cx="382" cy="111" r="14" /><circle cx="693" cy="75" r="18" /><circle cx="933" cy="101" r="20" /><circle cx="921" cy="380" r="17" /><circle cx="75" cy="377" r="18" /><circle cx="324" cy="542" r="19" /><circle cx="693" cy="550" r="20" /><circle cx="900" cy="536" r="18" />
          </g>
          <g fill="#ded6c9" stroke="#cfc5b7" strokeWidth="2">
            <rect x="215" y="83" width="118" height="88" rx="12" /><rect x="372" y="185" width="113" height="70" rx="12" /><rect x="567" y="104" width="151" height="97" rx="12" /><rect x="684" y="323" width="132" height="82" rx="12" /><rect x="340" y="348" width="130" height="72" rx="12" /><rect x="83" y="245" width="107" height="74" rx="12" /><rect x="523" y="493" width="117" height="66" rx="12" />
          </g>
          <g fill="#f3eee4" opacity=".8"><rect x="229" y="96" width="90" height="12" rx="5" /><rect x="583" y="118" width="118" height="12" rx="5" /><rect x="700" y="338" width="99" height="12" rx="5" /><rect x="357" y="362" width="96" height="12" rx="5" /></g>
          <text x="255" y="142" className="map-building-label">ACADEMIC BLOCK</text>
          <text x="588" y="174" className="map-building-label">LIBRARY</text>
          <text x="699" y="378" className="map-building-label">STUDENT HUB</text>
          <text x="360" y="400" className="map-building-label">DINING</text>
          <text x="90" y="289" className="map-building-label">HEALTH</text>
        </svg>
        {locations.map((location) => {
          const Icon = ICONS[location.icon] || MapPin;
          return <button key={location.id} className={`campus-map-pin ${selectedId === location.id ? 'selected' : ''}`} style={{ left: `${location.x}%`, top: `${location.y}%` }} onClick={() => setSelectedId(location.id)} aria-label={`Show ${location.name}`} aria-pressed={selectedId === location.id}><Icon size={16} /></button>;
        })}
        <span className="map-north">N <ArrowUpRight size={13} /></span>
      </section>
      <aside className="campus-map-sidebar">
        <section className="panel campus-location-list"><div className="campus-location-heading"><b>Campus locations</b><span>{visibleLocations.length}</span></div>
          {visibleLocations.map((location) => {
            const Icon = ICONS[location.icon] || MapPin;
            return <button className={`campus-location-row ${selectedId === location.id ? 'active' : ''}`} key={location.id} onClick={() => setSelectedId(location.id)}><span><Icon size={15} /></span><span><b>{location.name}</b><small>{location.category}</small></span></button>;
          })}
          {visibleLocations.length === 0 && <p className="muted campus-no-locations">No matching locations.</p>}
        </section>
        {selected && <section className="panel campus-location-detail"><p className="eyebrow">{selected.category.toUpperCase()}</p><h2>{selected.name}</h2><p>{selected.description}</p><div className="campus-detail-hours"><b>Hours</b><span>{selected.hours}</span></div>{selected.accessibility && <div className="campus-detail-hours"><b>Accessibility</b><span>{selected.accessibility}</span></div>}</section>}
      </aside>
    </div>}
    <p className="club-directory-note">This is an illustrative campus map. Confirm locations and opening hours with campus staff.</p>
  </div>;
}
