import { useEffect, useMemo, useState } from 'react';
import { Search, ShieldCheck, Users } from 'lucide-react';
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

export default function StudentDirectory({ user, notify }) {
  const [students, setStudents] = useState([]);
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/student-directory')
      .then((result) => {
        setVisible(result.visible);
        setStudents(result.students);
      })
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  const filteredStudents = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return students.filter((student) => !query || `${student.name} ${student.cohort}`.toLocaleLowerCase().includes(query));
  }, [search, students]);

  async function setDirectoryVisibility(event) {
    const nextVisible = event.target.checked;
    setBusy(true);
    setError('');
    try {
      const result = await api('/student-directory/visibility', {
        method: 'PATCH',
        body: JSON.stringify({ visible: nextVisible })
      });
      setVisible(result.visible);
      notify(nextVisible ? 'Your name and cohort are now visible to students.' : 'Your directory profile is hidden.');
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-content">
    <div className="page-heading"><div><p className="eyebrow">YOUR CAMPUS COMMUNITY</p><h1>Meet fellow students.</h1><p className="heading-desc">Browse students who have chosen to share their name and cohort.</p></div></div>
    <section className="panel directory-privacy">
      <span className="directory-privacy-icon"><ShieldCheck size={19} /></span>
      <div><b>Share my profile in the student directory</b><small>When enabled, other signed-in students can see your name and cohort. Your email and student record stay private. You can turn this off at any time.</small></div>
      <label className="directory-toggle"><input type="checkbox" checked={visible} disabled={busy || loading} onChange={setDirectoryVisibility} /><span>{visible ? 'Visible' : 'Hidden'}</span></label>
    </section>
    {error && <p className="error-message" role="alert">{error}</p>}
    <section className="lost-found-toolbar" aria-label="Search student directory">
      <label className="lost-found-search"><Search size={16} /><input aria-label="Search student names or cohorts" placeholder="Search by name or cohort" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <span className="directory-count">{students.length} students have opted in</span>
    </section>
    {loading ? <div className="panel events-empty"><Users size={21} /><p>Loading student directory…</p></div>
      : filteredStudents.length ? <div className="student-directory-grid">{filteredStudents.map((student) => (
        <article className="panel student-directory-card" key={student.id}>
          <span className="avatar large">{student.avatar || student.name.slice(0, 2).toUpperCase()}</span>
          <div><h2>{student.name}</h2><p>{student.cohort}</p></div>
        </article>
      ))}</div> : <div className="panel events-empty"><Users size={21} /><h2>{search ? 'No matching students.' : 'No one has opted in yet.'}</h2><p>{search ? 'Try another name or cohort.' : 'Students who choose to share their profile will appear here.'}</p></div>}
    <p className="club-directory-note">You are signed in as {user.name}. Directory visibility is optional and off by default.</p>
  </div>;
}
