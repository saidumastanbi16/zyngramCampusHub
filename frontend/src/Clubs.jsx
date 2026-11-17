import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, CalendarDays, Check, MapPin, Search, Send, Users, X } from 'lucide-react';
import { apiUrl } from './api-base.js';

async function api(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Could not load campus clubs.');
  return result;
}

export default function Clubs({ user, notify }) {
  const [clubs, setClubs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [category, setCategory] = useState('All clubs');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('directory');
  const [applyingTo, setApplyingTo] = useState(null);
  const [motivation, setMotivation] = useState('');
  const [busy, setBusy] = useState(false);
  const canReview = ['coordinator', 'admin'].includes(user.role);

  useEffect(() => {
    Promise.all([
      api('/clubs'),
      user.role === 'student' || canReview ? api('/club-memberships') : Promise.resolve([])
    ])
      .then(([clubList, membershipList]) => {
        setClubs(clubList);
        setApplications(membershipList);
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, [user.role]);

  const categories = useMemo(() => ['All clubs', ...new Set(clubs.map((club) => club.category))], [clubs]);
  const visibleClubs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return clubs.filter((club) => {
      if (category !== 'All clubs' && club.category !== category) return false;
      return !query || [club.name, club.category, club.description, club.meeting_day, club.location]
        .some((value) => value.toLocaleLowerCase().includes(query));
    });
  }, [category, clubs, search]);

  async function apply(club) {
    setBusy(true);
    setError('');
    try {
      const application = await api(`/clubs/${encodeURIComponent(club.id)}/membership`, {
        method: 'POST',
        body: JSON.stringify({ motivation })
      });
      setApplications((current) => [...current.filter((item) => item.club_id !== club.id), application]);
      setApplyingTo(null);
      setMotivation('');
      notify('Club membership application submitted.');
    } catch (applyError) {
      setError(applyError.message);
    } finally {
      setBusy(false);
    }
  }

  async function review(application, status) {
    try {
      const updated = await api(`/club-memberships/${encodeURIComponent(application.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      setApplications((current) => current.map((item) => item.id === updated.id ? updated : item));
      notify(`Membership application ${status}.`);
    } catch (reviewError) {
      notify(reviewError.message);
    }
  }

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">MEET YOUR CAMPUS COMMUNITY</p><h1>{view === 'applications' ? 'Club membership requests.' : 'Find your kind of people.'}</h1><p className="heading-desc">{view === 'applications' ? 'Review student applications to join a campus club.' : 'Explore clubs, find out when they meet, and apply to join.'}</p></div>{canReview && <button className="button-secondary" onClick={() => setView(view === 'directory' ? 'applications' : 'directory')}>{view === 'directory' ? `Review applications (${applications.filter((item) => item.status === 'pending').length})` : 'Club directory'}</button>}</div>
    {view === 'applications' && canReview ? <div className="club-applications-list">
      {applications.filter((application) => application.status === 'pending').map((application) => <article className="panel club-application-card" key={application.id}><div><p className="eyebrow">{application.club_name}</p><h2>{application.applicant_name}</h2><p>{application.motivation}</p><small>{new Date(application.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</small></div><div className="club-application-actions"><button className="button-secondary" onClick={() => review(application, 'declined')}>Decline</button><button className="button-dark" onClick={() => review(application, 'approved')}><Check size={15} /> Approve</button></div></article>)}
      {!applications.some((application) => application.status === 'pending') && <div className="panel events-empty"><Users size={21} /><h2>No pending applications.</h2><p>New student club requests will appear here.</p></div>}
    </div> : <>
    <section className="lost-found-toolbar" aria-label="Search and filter clubs">
      <label className="lost-found-search"><Search size={16} /><input aria-label="Search campus clubs" placeholder="Search clubs, interests, or meeting places" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="events-filters">{categories.map((item) => <button key={item} className={category === item ? 'active' : ''} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
    </section>
    {error && <p className="error-message" role="alert">{error}</p>}
    {loading ? <div className="panel events-empty"><Users size={21} /><p>Finding campus clubs…</p></div>
      : visibleClubs.length ? <div className="club-directory-grid">{visibleClubs.map((club) => (
        <article className="panel club-card" key={club.id}>
          <div className="club-card-top"><span className="club-category">{club.category}</span><span className="club-mark">{club.name.slice(0, 1)}</span></div>
          <h2>{club.name}</h2><p>{club.description}</p>
          <div className="club-meta"><span><CalendarDays size={14} />{club.meeting_day}</span><span><MapPin size={14} />{club.location}</span><span><Users size={14} />{club.member_count} members</span></div>
          {user.role === 'student' && (() => {
            const application = applications.find((item) => item.club_id === club.id);
            return application && application.status !== 'declined'
              ? <span className={`badge club-membership-status ${application.status}`}>{application.status === 'approved' ? 'Member' : `Application ${application.status}`}</span>
              : <button className="button-secondary club-apply-button" onClick={() => { setApplyingTo(club); setMotivation(''); setError(''); }}>{application ? 'Apply again' : 'Apply to join'}</button>;
          })()}
          {club.contact_email && <a className="text-link club-contact" href={`mailto:${club.contact_email}`}>Contact the club <ArrowUpRight size={14} /></a>}
        </article>
      ))}</div> : <div className="panel events-empty"><Users size={21} /><h2>No clubs found.</h2><p>Try a different search or category.</p></div>}
    {!loading && <p className="club-directory-note">Club details are sample campus-directory information for this project prototype.</p>}
    </>}
    {applyingTo && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="club-apply-title">
      <div className="modal-top"><span className="modal-icon"><Users size={19} /></span><button className="icon-button" aria-label="Close" onClick={() => setApplyingTo(null)}><X size={19} /></button></div>
      <p className="eyebrow">CLUB MEMBERSHIP</p><h2 id="club-apply-title">Apply to {applyingTo.name}.</h2>
      <form onSubmit={(event) => { event.preventDefault(); apply(applyingTo); }}>
        <label htmlFor="club-motivation">Why would you like to join?</label><textarea id="club-motivation" required minLength={10} maxLength={500} rows={4} value={motivation} onChange={(event) => setMotivation(event.target.value)} />
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setApplyingTo(null)}>Cancel</button><button className="button-dark" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'} <Send size={15} /></button></div>
      </form>
    </section></div>}
  </div>;
}