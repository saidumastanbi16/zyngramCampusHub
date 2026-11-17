import { useEffect, useMemo, useState } from 'react';
import { BookOpen, MapPin, Search } from 'lucide-react';
import { apiUrl } from './api-base.js';

async function api(path) {
  const response = await fetch(apiUrl(path), { credentials: 'include' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not load the library catalogue.');
  return result;
}

export default function LibraryCatalog() {
  const [books, setBooks] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [availableOnly, setAvailableOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/library-catalog')
      .then((result) => { if (active) setBooks(result); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => [...new Set(books.map((book) => book.category))].sort(), [books]);
  const visibleBooks = books.filter((book) => {
    const searchText = `${book.title} ${book.author} ${book.category} ${book.isbn}`.toLowerCase();
    return (!query.trim() || searchText.includes(query.trim().toLowerCase()))
      && (category === 'all' || book.category === category)
      && (!availableOnly || book.available_copies > 0);
  });

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">READ, RESEARCH, DISCOVER</p><h1>Library catalogue.</h1><p className="heading-desc">Find books by title, author, or subject and check where copies are shelved.</p></div></div>
    <section className="library-catalog-tools panel">
      <label className="library-catalog-search"><Search size={17} /><input aria-label="Search library catalogue" placeholder="Search title, author, subject, or ISBN" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="library-catalog-category">Subject<select aria-label="Filter by subject" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All subjects</option>{categories.map((subject) => <option value={subject} key={subject}>{subject}</option>)}</select></label>
      <label className="library-available-filter"><input type="checkbox" checked={availableOnly} onChange={(event) => setAvailableOnly(event.target.checked)} /> Available copies only</label>
      <span>{visibleBooks.length} {visibleBooks.length === 1 ? 'title' : 'titles'}</span>
    </section>
    {error && <p className="error-message" role="alert">{error}</p>}
    {loading ? <div className="events-empty"><BookOpen size={20} /><p>Loading library catalogue…</p></div>
      : visibleBooks.length ? <section className="library-catalog-grid" aria-label="Library titles">{visibleBooks.map((book) => <article className="panel library-book-card" key={book.id}>
        <span className="library-book-art"><BookOpen size={25} /><small>{book.category}</small></span>
        <div className="library-book-details"><p className="eyebrow">{book.category}</p><h2>{book.title}</h2><p>by {book.author}</p><div className="library-book-meta"><span><MapPin size={13} /> {book.shelf}</span><span className={book.available_copies > 0 ? 'available' : 'unavailable'}>{book.available_copies > 0 ? `${book.available_copies} of ${book.total_copies} available` : 'Currently checked out'}</span></div><small>ISBN {book.isbn}</small></div>
      </article>)}</section> : <div className="events-empty"><BookOpen size={20} /><h2>No matching titles.</h2><p>Try a different search or subject filter.</p></div>}
    <p className="library-catalog-note">Availability and titles are sample campus catalogue data for this project prototype.</p>
  </div>;
}
