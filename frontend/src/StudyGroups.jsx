import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, MessageCircle, Plus, Send, UserPlus, Users, X } from 'lucide-react';
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

export default function StudyGroups({ user, notify }) {
  const [groups, setGroups] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [compose, setCompose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({ name: '', subject: '', description: '' });
  const canJoin = user.role === 'student';

  useEffect(() => {
    api('/study-groups')
      .then(setGroups)
      .catch((loadFailure) => setLoadError(loadFailure.message))
      .finally(() => setLoadingGroups(false));
  }, []);

  useEffect(() => {
    if (!selected?.is_member) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoadingMessages(true);
    api(`/study-groups/${encodeURIComponent(selected.id)}/messages`)
      .then((result) => { if (active) setMessages(result); })
      .catch((loadFailure) => { if (active) notify(loadFailure.message); })
      .finally(() => { if (active) setLoadingMessages(false); });
    return () => { active = false; };
  }, [notify, selected?.id, selected?.is_member]);

  async function createGroup(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const group = await api('/study-groups', { method: 'POST', body: JSON.stringify(form) });
      setGroups((current) => [group, ...current]);
      setForm({ name: '', subject: '', description: '' });
      setCompose(false);
      setSelected(group);
      notify('Study group created. You are a member.');
    } catch (createFailure) {
      setError(createFailure.message);
    } finally {
      setBusy(false);
    }
  }

  async function joinGroup(group) {
    try {
      const updated = await api(`/study-groups/${encodeURIComponent(group.id)}/members`, {
        method: 'POST', body: JSON.stringify({})
      });
      setGroups((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSelected(updated);
      notify(`You joined ${updated.name}.`);
    } catch (joinFailure) {
      notify(joinFailure.message);
    }
  }

  async function postMessage(event) {
    event.preventDefault();
    if (!message.trim() || !selected) return;
    setBusy(true);
    try {
      const posted = await api(`/study-groups/${encodeURIComponent(selected.id)}/messages`, {
        method: 'POST', body: JSON.stringify({ message })
      });
      setMessages((current) => [...current, posted]);
      setMessage('');
    } catch (postFailure) {
      notify(postFailure.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-content">
    <div className="page-heading">
      <div><p className="eyebrow">LEARN TOGETHER</p><h1>Find your study people.</h1><p className="heading-desc">Join a subject group, ask questions, and share ideas with fellow students.</p></div>
      {canJoin && !selected && <button className="button-primary" onClick={() => { setError(''); setCompose(true); }}><Plus size={16} /> Create study group</button>}
      {selected && <button className="button-secondary" onClick={() => setSelected(null)}><ArrowLeft size={15} /> All groups</button>}
    </div>
    {!selected ? <>
      {loadError && <p className="error-message" role="alert">{loadError}</p>}
      {loadingGroups ? <div className="panel events-empty"><Users size={21} /><p>Finding study groups…</p></div>
        : groups.length ? <div className="study-groups-list">{groups.map((group) => (
          <article className="panel study-group-card" key={group.id}>
            <span className="study-group-icon"><BookOpen size={19} /></span>
            <div className="study-group-details"><p className="eyebrow">{group.subject}</p><h2>{group.name}</h2><p>{group.description}</p><span className="study-group-count"><Users size={14} />{group.member_count} {group.member_count === 1 ? 'member' : 'members'}</span></div>
            {group.is_member
              ? <button className="button-dark" onClick={() => setSelected(group)}><MessageCircle size={15} /> Open group</button>
              : canJoin && <button className="button-secondary" onClick={() => joinGroup(group)}><UserPlus size={15} /> Join group</button>}
          </article>
        ))}</div> : <div className="panel events-empty"><Users size={21} /><h2>No study groups yet.</h2><p>Create a group for a subject and invite your classmates to learn together.</p></div>}
    </> : <section className="panel study-discussion">
      <header className="study-discussion-header"><span className="study-group-icon"><BookOpen size={19} /></span><div><p className="eyebrow">{selected.subject}</p><h2>{selected.name}</h2><p>{selected.member_count} {selected.member_count === 1 ? 'member' : 'members'} · {selected.description}</p></div></header>
      {loadingMessages ? <div className="events-empty"><p>Loading group discussion…</p></div>
        : messages.length ? <div className="study-message-list" aria-live="polite">{messages.map((entry) => (
          <article className={`study-message ${entry.from_me ? 'mine' : ''}`} key={entry.id}><span className="study-message-author">{entry.author_name}{entry.from_me ? ' · You' : ''}</span><p>{entry.message}</p><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time></article>
        ))}</div> : <div className="events-empty"><MessageCircle size={21} /><h2>Start the conversation.</h2><p>Share a question or a helpful note with your group.</p></div>}
      {canJoin && <form className="study-message-form" onSubmit={postMessage}><textarea aria-label="Write a group message" required maxLength={2000} rows={2} placeholder="Write a message to your group…" value={message} onChange={(event) => setMessage(event.target.value)} /><button className="button-dark" disabled={busy || !message.trim()} aria-label="Send message">{busy ? 'Sending…' : <><Send size={15} /> Send</>}</button></form>}
    </section>}
    {compose && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="study-group-modal-title">
      <div className="modal-top"><span className="modal-icon"><Users size={19} /></span><button className="icon-button" aria-label="Close" onClick={() => setCompose(false)}><X size={19} /></button></div>
      <p className="eyebrow">STUDENT COMMUNITY</p><h2 id="study-group-modal-title">Create a study group.</h2>
      <form onSubmit={createGroup}>
        <label htmlFor="study-group-name">Group name</label><input id="study-group-name" required minLength={3} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <label htmlFor="study-group-subject">Subject or course</label><input id="study-group-subject" required minLength={2} maxLength={80} placeholder="e.g. JavaScript, Accounting" value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} />
        <label htmlFor="study-group-description">What will you study together?</label><textarea id="study-group-description" required minLength={5} maxLength={500} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        {error && <p className="error-message" role="alert">{error}</p>}
        <div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setCompose(false)}>Cancel</button><button className="button-dark" disabled={busy}>{busy ? 'Creating…' : 'Create group'} <Plus size={15} /></button></div>
      </form>
    </section></div>}
  </div>;
}
