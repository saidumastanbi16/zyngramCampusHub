import { useCallback, useEffect, useRef, useState } from 'react';
import Tutorials from './Tutorials.jsx';
import {
  Activity, ArrowRight, ArrowUpRight, Award, Bell, BookOpen, BriefcaseBusiness, CalendarDays, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Command, Download, FileCheck2, FileText, GraduationCap,
  LayoutDashboard, LifeBuoy, LogOut, Menu, MessageCircle, MoreHorizontal, Play, Plus, Radio, Search,
  Send, ShieldCheck, Sparkles, Users, X
} from 'lucide-react';

const ROLE = { student: 'Candidate', trainer: 'Trainer', coordinator: 'Coordinator', admin: 'Administrator' };
const COURSE_DETAILS = {
  'c-product': {
    description: 'Build responsive web applications and learn how frontend, backend, APIs, and databases work together.',
    session: 'Build & test a web application'
  },
  'c-ui': {
    description: 'Plan measurable campaigns with audience research, content strategy, search, and social channels.',
    session: 'Campaign planning workshop'
  },
  'c-portfolio': {
    description: 'Learn budgeting, financial statements, cash flow, and the basics of responsible money management.',
    session: 'Budgeting & cash flow lab'
  }
};
const NAV = [
  ['overview', 'Overview', LayoutDashboard], ['tutorials', 'Tutorials', BookOpen], ['live-courses', 'Live courses', Radio], ['courses', 'My learning', BookOpen],
  ['lessons', 'Lessons & resources', FileText], ['exams', 'Weekly exams', FileCheck2], ['levels', 'Learning levels', Activity], ['internships', 'Internships', BriefcaseBusiness],
  ['attendance', 'Schedule & attendance', CalendarDays], ['tasks', 'Tasks & feedback', FileCheck2],
  ['progress', 'Progress & certificates', Activity], ['notifications', 'Notifications', Bell], ['announcements', 'Announcements', Bell],
  ['services', 'Campus services', Sparkles], ['support', 'Help & support', LifeBuoy]
];
const NAV_BY_ROLE = {
  student: NAV.map(([id, label, Icon]) => [id, id === 'tasks' ? 'Assignments' : label, Icon]),
  trainer: NAV.filter(([id]) => !['services', 'levels'].includes(id)).map(([id, label, Icon]) => [
    id, ({ courses: 'My courses', lessons: 'Course materials', tasks: 'Learner submissions', progress: 'Learner progress', internships: 'Internship readiness' })[id] || label, Icon
  ]),
  coordinator: NAV.filter(([id]) => !['progress', 'services', 'levels'].includes(id)).map(([id, label, Icon]) => [
    id, ({ courses: 'Courses & batches', attendance: 'Campus attendance', tasks: 'Task monitoring' })[id] || label, Icon
  ]),
  admin: NAV.filter(([id]) => !['services', 'levels'].includes(id)).map(([id, label, Icon]) => [
    id, ({ courses: 'Courses & batches', attendance: 'Campus attendance', tasks: 'Task oversight', progress: 'Reports & analytics' })[id] || label, Icon
  ]).concat([['users', 'User management', Users], ['access', 'Access & system', ShieldCheck], ['audit', 'Activity log', Activity]])
};
const WORKSPACE_LABEL = {
  student: 'YOUR LEARNING',
  trainer: 'TEACHING SPACE',
  coordinator: 'CAMPUS OPERATIONS',
  admin: 'ADMINISTRATION'
};
async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...options.headers }, ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
async function uploadApi(path, body) {
  const response = await fetch(`/api${path}`, { method: 'POST', credentials: 'same-origin', body });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
function Avatar({ initials, large = false }) { return <span className={`avatar ${large ? 'large' : ''}`}>{initials}</span>; }
function Badge({ children, tone = '' }) { return <span className={`badge ${tone}`}>{children}</span>; }
function ProgressBar({ value, color = 'plum' }) {
  return <div className="progress-track" role="progressbar" aria-valuenow={value} aria-valuemin="0" aria-valuemax="100" aria-label={`${value}% complete`}><span className={color} style={{ width: `${value}%` }} /></div>;
}
function videoEmbedUrl(value) {
  try {
    const url = new URL(value);
    if (url.hostname === 'youtu.be' || url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com')) {
      const videoId = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts)\/([^/]+)/)?.[1];
      return videoId ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}` : '';
    }
    if (url.hostname === 'vimeo.com' || url.hostname.endsWith('.vimeo.com')) {
      const videoId = url.pathname.split('/').filter(Boolean).at(-1);
      return /^\d+$/.test(videoId || '') ? `https://player.vimeo.com/video/${videoId}` : '';
    }
  } catch {}
  return '';
}
function printCertificate(certificate, learnerName) {
  const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const popup = window.open('', '_blank', 'width=1000,height=760');
  if (!popup) return;
  popup.document.write(`<!doctype html><html><head><title>${escapeHtml(certificate.course_title)} certificate</title><style>
    @page{size:landscape;margin:12mm}*{box-sizing:border-box}body{margin:0;padding:24px;background:#eef1ed;color:#16272b;font-family:Georgia,'Times New Roman',serif}.certificate{min-height:calc(100vh - 48px);padding:10mm;border:2px solid #b37a4c;outline:1px solid #b37a4c;outline-offset:-14px;display:grid;place-content:center;text-align:center;background:#fff}.brand{font:700 12px Arial,sans-serif;letter-spacing:3px;color:#31756c}.mark{margin:26px auto 4px;color:#b37a4c;font-size:28px}.eyebrow{font:700 10px Arial,sans-serif;letter-spacing:2px;color:#607570}.title{margin:10px 0 18px;font-size:42px;font-weight:400}.name{margin:8px 0;font-size:34px;color:#31756c}.course{max-width:780px;margin:12px auto;font-size:24px}.detail{margin-top:26px;font:12px Arial,sans-serif;color:#607570}.id{margin-top:8px;font:10px Arial,sans-serif;color:#85918d}@media print{body{padding:0;background:#fff}.certificate{min-height:180mm}}
    </style></head><body><main class="certificate"><div class="brand">ZYNGRAM · CAMPUS HUB</div><div class="mark">✳</div><div class="eyebrow">CERTIFICATE OF COMPLETION</div><h1 class="title">This is proudly presented to</h1><div class="name">${escapeHtml(learnerName)}</div><p>for successfully completing</p><div class="course">${escapeHtml(certificate.course_title)}</div><p>including all course lessons and weekly assessments.</p><div class="detail">Issued ${escapeHtml(new Date(certificate.issued_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))}</div><div class="id">Certificate ID · ${escapeHtml(certificate.id)}</div></main></body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}
function Sidebar({ page, setPage, user, data, logout, mobileOpen, closeMobile }) {
  const navigation = NAV_BY_ROLE[user.role] || NAV_BY_ROLE.student;
  const taskCount = Array.isArray(data.tasks)
    ? user.role === 'student'
      ? data.tasks.filter((task) => task.status !== 'complete').length
      : data.tasks.filter((task) => task.status === 'in_review').length
    : 0;
  return <>
    <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}><a className="brand" href="#" onClick={(e) => { e.preventDefault(); setPage('overview'); closeMobile(); }}><img className="brand-logo" src="/zyngram-logo.svg" alt="" /><span>ZYNGRAM</span></a>
      <div className="workspace-chip"><span className="workspace-glyph">✳</span><span><b>Campus Hub</b><small>Hyderabad campus</small></span><ChevronDown size={14} /></div>
      <p className="nav-caption">{WORKSPACE_LABEL[user.role] || WORKSPACE_LABEL.student}</p><nav aria-label="Main navigation">{navigation.map(([id, label, Icon]) => <button className={`nav-item ${page === id ? 'active' : ''}`} key={id} onClick={() => { setPage(id); closeMobile(); }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span>{id === 'tasks' && taskCount > 0 && <span className="nav-count">{taskCount}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="help-card"><span className="help-icon"><CircleHelp size={18} /></span><b>Here to help</b><span>Questions? We're a message away.</span><button onClick={() => setPage('support')}>Get support <ArrowRight size={14} /></button></div>
        <button className="user-mini" onClick={() => setPage('profile')}><Avatar initials={user.avatar} /><span><b>{user.name}</b><small>{ROLE[user.role]}</small></span><MoreHorizontal size={19} /></button>
        <button className="logout-button" onClick={logout}><LogOut size={15} /> Sign out</button></div>
    </aside>{mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={closeMobile} />}
  </>;
}
function Header({ page, user, setPage, onMobile, onSignOut }) {
  const title = (NAV_BY_ROLE[user.role] || NAV_BY_ROLE.student).find(([id]) => id === page)?.[1] || ({ audit: 'Activity log', users: 'User management', access: 'Access & system', profile: 'Your profile' }[page] || 'Campus Hub');
  return <header className="topbar"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={onMobile}><Menu size={20} /></button><div className="breadcrumbs"><span>Campus Hub</span><span className="crumb-slash">/</span><b>{title}</b></div><div className="top-actions"><button className="top-search" onClick={() => setPage('courses')} aria-label="Search courses"><Search size={16} /><span>Search anything</span><kbd><Command size={11} /> K</kbd></button><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setPage('notifications')}><Bell size={18} /><i /></button><button className="header-profile" onClick={() => setPage('profile')}><Avatar initials={user.avatar} /><ChevronDown size={14} /></button><button className="header-signout" onClick={onSignOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /><span>Sign out</span></button></div></header>;
}
function Heading({ eyebrow, title, description, action }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{description && <p className="muted heading-desc">{description}</p>}</div>{action}</div>;
}
function AdminOverview({ data, user, setPage }) {
  const actions = [
    ['users', 'Manage user accounts', 'Create student, trainer, and coordinator accounts.', Users],
    ['progress', 'Reports & analytics', 'Review campus-wide learner and attendance indicators.', Activity],
    ['access', 'Access & system', 'Review role boundaries and security information.', ShieldCheck],
    ['audit', 'Activity log', 'Inspect recent account and campus actions.', FileCheck2]
  ];
  return <div className="page-content"><section className="welcome-banner"><div><p className="eyebrow pale">CAMPUS OPERATIONS · ADMINISTRATOR</p><h1>Good morning,<br /><em>{user.name}.</em></h1><p>Campus-wide oversight, account access, and learner activity in one place.</p><button className="banner-link" onClick={() => setPage('users')}>Manage campus accounts <ArrowRight size={16} /></button></div><div className="welcome-illustration"><div className="sun-circle" /><span className="plant plant-left">✳</span><span className="plant plant-right">✺</span><div className="banner-note">campus<br />at a glance <span>↗</span></div></div><span className="banner-arch arch-a" /><span className="banner-arch arch-b" /></section>
    <div className="section-title-row"><div><h2>Administration overview</h2><p>Campus-wide account and learning indicators.</p></div><button className="text-link" onClick={() => setPage('progress')}>Open reports <ArrowRight size={15} /></button></div>
    <div className="stat-grid"><article className="stat-card"><div className="stat-card-top"><span>Students</span><span className="stat-icon lilac-bg"><GraduationCap size={17} /></span></div><strong className="stat-number">{data.stats.userCounts.students}<small> accounts</small></strong><div className="stat-meta">Registered learner accounts</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Trainers</span><span className="stat-icon mint-bg"><BookOpen size={17} /></span></div><strong className="stat-number">{data.stats.userCounts.trainers}<small> accounts</small></strong><div className="stat-meta">Teaching team accounts</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Courses</span><span className="stat-icon peach-bg"><FileCheck2 size={17} /></span></div><strong className="stat-number">{data.stats.courses}<small> active</small></strong><div className="stat-meta">Campus learning paths</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Attendance</span><span className="stat-icon yellow-bg"><CalendarDays size={17} /></span></div><strong className="stat-number">{data.attendance}<small>%</small></strong><div className="stat-meta">Campus-wide recorded attendance</div></article>
    </div>
    <div className="section-title-row"><div><h2>Administration tools</h2><p>Actions available to your administrator account.</p></div></div>
    <div className="admin-action-grid">{actions.map(([page, title, description, Icon]) => <button className="panel admin-action-card" key={page} onClick={() => setPage(page)}><span className="stat-icon lilac-bg"><Icon size={18} /></span><span><b>{title}</b><small>{description}</small></span><ArrowRight size={16} /></button>)}</div>
    <p className="fine-print"><ShieldCheck size={14} /> Role access is enforced by the API; this prototype is not a live production service.</p>
  </div>;
}
function AccessAndSystem({ system }) {
  const roles = [
    ['Student', 'Own courses, tasks, attendance, feedback, and progress', 'Submit own task work'],
    ['Trainer', 'Assigned courses, learner submissions, attendance, and progress', 'Review assigned-course work'],
    ['Campus coordinator', 'Campus-wide courses, attendance, and tasks', 'Publish campus announcements'],
    ['Administrator', 'Campus-wide reports, accounts, announcements, and audit log', 'Create accounts; review audit history']
  ];
  return <div className="page-content"><Heading eyebrow="ADMINISTRATION" title="Access & system." description="Review the role boundaries and runtime safeguards configured for this Campus Hub prototype." />
    <div className="stat-grid system-status-grid"><article className="stat-card"><div className="stat-card-top"><span>Environment</span><span className="stat-icon lilac-bg"><Activity size={17} /></span></div><strong className="system-value">{system.environment}</strong><div className="stat-meta">Not a public production service</div></article><article className="stat-card"><div className="stat-card-top"><span>Database</span><span className="stat-icon mint-bg"><CheckCircle2 size={17} /></span></div><strong className="system-value">{system.database}</strong><div className="stat-meta">Connection details are hidden</div></article><article className="stat-card"><div className="stat-card-top"><span>Sign-in security</span><span className="stat-icon peach-bg"><ShieldCheck size={17} /></span></div><strong className="system-value">HTTP-only session</strong><div className="stat-meta">{system.sessionHours}-hour session · salted scrypt passwords</div></article></div>
    <div className="section-title-row"><div><h2>Role access overview</h2><p>Current application policy; this screen does not change permissions.</p></div></div><div className="panel role-access-table"><div className="role-access-row role-access-head"><span>ROLE</span><span>CAN VIEW</span><span>CAN DO</span></div>{roles.map(([role, view, action]) => <div className="role-access-row" key={role}><b>{role}</b><span>{view}</span><span>{action}</span></div>)}</div>
    <section className="panel system-note"><ShieldCheck size={18} /><div><b>Configuration is protected</b><p>Role permissions are enforced in the API and deployment secrets are managed through environment variables. This prototype provides a read-only overview; it does not expose secret values or allow unsafe permission edits.</p></div></section>
  </div>;
}
function Overview({ data, user, setPage, openCourse }) {
  const student = user.role === 'student';
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];
  const reviewTasks = tasks.filter((task) => task.status === 'in_review');
  const first = user.name.split(' ')[0];
  const nextCourse = data.courses[0];
  return <div className="page-content"><section className="welcome-banner"><div><p className="eyebrow pale">WEDNESDAY, OCTOBER 14, 2026 <span>·</span> COHORT 08</p><h1>{user.role === 'student' ? <>A good day to grow,<br /><em>{first}.</em></> : <>Good morning,<br /><em>{first}.</em></>}</h1><p>{student ? 'You’re building something wonderful. Here’s your learning, at a glance.' : user.role === 'trainer' ? 'Here’s what’s happening across your assigned courses.' : 'Here’s what’s happening across your campus today.'}</p><button className="banner-link" onClick={() => student && nextCourse ? openCourse(nextCourse.id) : setPage(student ? 'courses' : 'attendance')}>{student ? 'Pick up where you left off' : 'See today’s activity'} <ArrowRight size={16} /></button></div><div className="welcome-illustration"><div className="sun-circle" /><span className="plant plant-left">✳</span><span className="plant plant-right">✺</span><div className="banner-note">little steps<br />add up <span>↗</span></div></div><span className="banner-arch arch-a" /><span className="banner-arch arch-b" /></section>
    {student && <section className="tutorial-dashboard-strip"><span className="tutorial-dashboard-icon"><BookOpen size={20} /></span><div><p className="eyebrow">TUTORIAL LIBRARY</p><h2>Build a skill, one lesson at a time.</h2><p>Start with Java, Python, or web foundations. Your lesson progress is saved on this device.</p></div><button className="button-dark" onClick={() => setPage('tutorials')}>Explore tutorials <ArrowRight size={15} /></button><button className="tutorial-live-link" onClick={() => setPage('live-courses')}><Radio size={15} /> Live courses</button></section>}
    {user.role === 'trainer' && <><div className="stat-grid trainer-stat-grid"><article className="stat-card"><div className="stat-card-top"><span>My students</span><span className="stat-icon lilac-bg"><Users size={17} /></span></div><strong className="stat-number">{data.stats.learners}</strong><div className="stat-meta">Enrolled in assigned courses</div></article><article className="stat-card"><div className="stat-card-top"><span>Pending evaluations</span><span className="stat-icon peach-bg"><FileCheck2 size={17} /></span></div><strong className="stat-number">{data.stats.pendingEvaluations || 0}</strong><div className="stat-meta">Assignments waiting for review</div></article><article className="stat-card"><div className="stat-card-top"><span>Upcoming classes</span><span className="stat-icon mint-bg"><CalendarDays size={17} /></span></div><strong className="stat-number">{data.stats.upcomingClasses || 0}</strong><div className="stat-meta">Scheduled for assigned courses</div></article><article className="stat-card"><div className="stat-card-top"><span>Students needing support</span><span className="stat-icon yellow-bg"><CircleHelp size={17} /></span></div><strong className="stat-number">{data.stats.studentsNeedingSupport || 0}</strong><div className="stat-meta">Recent failed exams or absences</div></article></div><div className="trainer-quick-actions"><h2>Quick actions</h2><div><button className="button-secondary" onClick={() => setPage('lessons')}><Plus size={14} /> Create lesson</button><button className="button-secondary" onClick={() => setPage('exams')}><Plus size={14} /> Create exam</button><button className="button-secondary" onClick={() => setPage('tasks')}><FileCheck2 size={14} /> Evaluate work</button><button className="button-secondary" onClick={() => setPage('announcements')}><Bell size={14} /> Post announcement</button></div></div></>}
    <div className="section-title-row"><div><h2>{student ? 'Your snapshot' : user.role === 'trainer' ? 'Teaching snapshot' : 'Campus snapshot'}</h2><p>{student ? 'A little progress goes a long way.' : user.role === 'trainer' ? 'A view of your assigned courses and learners.' : 'A clear view of learning across your campus.'}</p></div><button className="text-link" onClick={() => setPage(student ? 'progress' : 'tasks')}>{student ? 'View progress' : 'Review learner work'} <ArrowRight size={15} /></button></div>
    <div className="stat-grid"><article className="stat-card"><div className="stat-card-top"><span>Learning paths</span><span className="stat-icon lilac-bg"><BookOpen size={17} /></span></div><strong className="stat-number">{data.stats.courses}<small> active</small></strong><div className="stat-meta"><i className="tiny-dot purple-dot" /> Across {data.stats.courses} {data.stats.courses === 1 ? 'learning track' : 'learning tracks'}</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>Attendance</span><span className="stat-icon mint-bg"><CalendarDays size={17} /></span></div><strong className="stat-number">{data.attendance}<small>%</small></strong><div className="stat-meta"><span className="trend-up"><ArrowUpRight size={13} /> On track</span> · Keep it up</div></article>
      <article className="stat-card"><div className="stat-card-top"><span>{student ? 'Tasks to wrap up' : 'Submissions to review'}</span><span className="stat-icon peach-bg"><FileCheck2 size={17} /></span></div><strong className="stat-number">{student ? data.stats.pendingTasks : reviewTasks.length}<small> {student ? 'open' : 'waiting'}</small></strong><div className="stat-meta"><i className="tiny-dot orange-dot" /> {student ? 'One due this week' : 'Across your assigned courses'}</div></article>
      <article className="stat-card stat-streak"><div className="stat-card-top"><span>{student ? 'This week' : 'Active cohort'}</span><span className="stat-icon yellow-bg">✳</span></div><strong className="stat-number">{student ? '4' : data.stats.learners}<small> {student ? 'day streak' : 'learners'}</small></strong><div className="week-dots">{student ? <><span className="done">M</span><span className="done">T</span><span className="today">W</span><span>T</span><span>F</span></> : <span className="done">Cohort 08</span>}</div></article></div>
    <div className="content-grid"><section className="panel courses-panel"><div className="panel-heading"><div><h2>{student ? 'Your learning paths' : 'Your teaching paths'}</h2><p>{student ? 'Keep the momentum going.' : 'Courses connected to your campus.'}</p></div><button className="icon-button" aria-label="View courses" onClick={() => setPage('courses')}><ArrowRight size={18} /></button></div>
      <div className="course-list">{data.courses.slice(0, 3).map((course, i) => <button className="course-row" key={course.id} onClick={() => student ? openCourse(course.id) : setPage('courses')}><span className={`course-symbol ${course.color}`}>{[<Sparkles size={19} />, <Command size={18} />, <GraduationCap size={19} />][i]}</span><span className="course-main"><span className="course-title-line"><b>{course.title}</b><span>{course.progress}%</span></span><small>{course.track} <i>·</i> {course.duration}</small><ProgressBar value={course.progress} color={course.color} /></span><ArrowRight className="course-arrow" size={16} /></button>)}</div><button className="panel-bottom-link" onClick={() => setPage('courses')}>Explore all learning paths <ArrowRight size={14} /></button>
    </section><section className="panel tasks-panel"><div className="panel-heading"><div><h2>{student ? 'On your plate' : 'Learner submissions'}</h2><p>{student ? 'A few things to bring over the line.' : 'Review work from your courses.'}</p></div><Badge tone="subtle">{student ? tasks.filter((task) => task.status !== 'complete').length : reviewTasks.length} {student ? 'open' : 'to review'}</Badge></div>
      <div className="task-list">{student ? tasks.slice(0, 3).map((task) => <button className="task-row" key={task.id} onClick={() => setPage('tasks')}><span className={`task-check ${task.status === 'complete' ? 'checked' : ''}`}>{task.status === 'complete' && <Check size={13} />}</span><span className="task-main"><b>{task.title}</b><small>{task.course_title}</small></span><span className="due-date">{task.status === 'complete' ? 'Done' : new Date(`${task.due_date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></button>) : reviewTasks.slice(0, 3).map((task) => <button className="task-row" key={task.id} onClick={() => setPage('tasks')}><span className="task-check"><FileCheck2 size={12} /></span><span className="task-main"><b>{task.title}</b><small>{task.learner_name} · {task.course_title}</small></span><span className="due-date">{new Date(`${task.due_date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span></button>)}</div><button className="panel-bottom-link" onClick={() => setPage('tasks')}>{student ? 'Go to tasks & feedback' : 'Review learner work'} <ArrowRight size={14} /></button>
    </section></div><section className="up-next"><span className="up-next-icon"><Clock3 size={20} /></span><div className="up-next-copy"><span>UP NEXT · {nextCourse?.next_session || 'SCHEDULE TO BE CONFIRMED'}</span><b>{COURSE_DETAILS[nextCourse?.id]?.session || 'Plan your next learning moment'}</b><small>{nextCourse?.title || 'Campus learning'} <i>·</i> Schedule details</small></div><Badge tone="soon">SCHEDULED</Badge><button className="icon-button" aria-label="View schedule" onClick={() => setPage('attendance')}><ArrowRight size={17} /></button></section><div className="last-updated"><CheckCircle2 size={14} /> You’re all caught up. Last synced just now.</div>
  </div>;
}
function Courses({ data, setPage, user, openCourse }) {
  const student = user.role === 'student';
  const title = student ? 'Your learning paths.' : user.role === 'trainer' ? 'Courses you teach.' : 'Courses & batches.';
  const description = student ? 'Thoughtful courses, small steps, and a little room to explore.' : 'A clear view of learning paths and the cohorts connected to them.';
  return <div className="page-content"><Heading eyebrow={student ? 'MAKE SOMETHING OF IT' : 'CAMPUS LEARNING'} title={title} description={description} action={student && <button className="button-primary" onClick={() => setPage('services')}><Plus size={16} /> Explore a path</button>} />
    <div className="track-filter"><button className="filter-pill selected">{student ? 'All learning' : 'All courses'} <i>{data.courses.length}</i></button><button className="filter-pill">In progress</button><button className="filter-pill">Completed</button><span className="filter-note"><Sparkles size={14} /> {student ? 'Curated for your cohort' : user.role === 'trainer' ? 'Assigned to you' : 'Campus overview'}</span></div>
    <div className="learning-grid">{data.courses.map((course, i) => <article className={`learning-card ${course.color}`} key={course.id}><div className="learning-card-art"><span className="card-art-orbit" /><span className="card-art-symbol">{['✳', '◒', '✺'][i % 3]}</span><small>0{i + 1} / COURSE</small></div><div className="learning-card-body"><Badge tone="soft">{course.track}</Badge><h2>{course.title}</h2><p>{COURSE_DETAILS[course.id]?.description || 'Explore this learning path, work through practical activities, and track your progress.'}</p><div className="course-meta"><span><Clock3 size={14} /> {course.duration}</span><span><Users size={14} /> Cohort 08</span></div><div className="learning-progress"><div><span>{student ? 'Your progress' : 'Course progress'}</span><b>{course.progress}%</b></div><ProgressBar value={course.progress} color={course.color} /></div><button className="button-dark full-width" onClick={() => student ? openCourse(course.id) : setPage('tasks')}>{student ? 'Start learning' : 'View learner work'} <ArrowRight size={15} /></button></div></article>)}</div>
    <div className="empty-hint"><Sparkles size={16} /> Good work takes time. New learning paths will appear here as your campus grows.</div></div>;
}
function CourseMaterials({ data, user, notify, initialCourseId }) {
  const [courseId, setCourseId] = useState(initialCourseId || data.courses[0]?.id || '');
  const [items, setItems] = useState([]);
  const [learners, setLearners] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeLessonId, setActiveLessonId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [retainedResources, setRetainedResources] = useState([]);
  const [draft, setDraft] = useState({ title: '', description: '', weekNumber: 1, position: 1 });
  const [resources, setResources] = useState([{ type: 'link', title: '', url: '' }]);
  const [lessonFile, setLessonFile] = useState(null);
  const lessonEditorRef = useRef(null);
  const [taskDraft, setTaskDraft] = useState({ learnerId: '', title: '', description: '', dueDate: '' });
  const isTrainer = user.role === 'trainer';
  const load = useCallback(() => api(`/lessons?courseId=${encodeURIComponent(courseId)}`).then((rows) => {
    setItems(rows);
    setActiveLessonId((current) => rows.some((lesson) => lesson.id === current) ? current : rows[0]?.id || '');
  }), [courseId]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  useEffect(() => {
    if (!isTrainer) api('/class-sessions').then(setSessions).catch((e) => setError(e.message));
  }, [isTrainer]);
  useEffect(() => {
    if (isTrainer) api('/progress').then((report) => setLearners(report.learners)).catch((e) => setError(e.message));
  }, [isTrainer]);
  const assignedLearners = learners.filter((learner) => learner.course_ids.includes(courseId));
  function beginEdit(lesson) {
    setEditingId(lesson.id);
    setDraft({ title: lesson.title, description: lesson.description, weekNumber: lesson.week_number, position: lesson.position });
    const allResources = lesson.resources || [];
    setRetainedResources(allResources.filter((resource) => resource.url.startsWith('/api/lessons/')));
    const externalResources = allResources.filter((resource) => resource.url.startsWith('https://'));
    setResources(externalResources.length ? externalResources : [{ type: 'link', title: '', url: '' }]);
    setLessonFile(null);
    window.requestAnimationFrame(() => lessonEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function cancelEdit() {
    setEditingId('');
    setRetainedResources([]);
    setDraft({ title: '', description: '', weekNumber: 1, position: 1 });
    setResources([{ type: 'link', title: '', url: '' }]);
    setLessonFile(null);
  }
  async function saveLesson(event) {
    event.preventDefault(); setError(''); setBusy(true);
    const resourceList = resources.filter((resource) => resource.title.trim() && resource.url.trim());
    try {
      let lessonId = editingId;
      if (editingId) await api(`/lessons/${editingId}`, { method: 'PATCH', body: JSON.stringify({ title: draft.title, description: draft.description, resources: [...resourceList, ...retainedResources] }) });
      else lessonId = (await api('/lessons', { method: 'POST', body: JSON.stringify({ ...draft, courseId, resources: resourceList }) })).id;
      if (lessonFile) { const form = new FormData(); form.append('file', lessonFile); await uploadApi(`/lessons/${lessonId}/upload`, form); }
      cancelEdit(); await load(); notify(editingId ? 'Lesson updated.' : 'Lesson published.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function completeLesson(lesson) {
    try { await api(`/lessons/${lesson.id}/complete`, { method: 'POST' }); await load(); notify('Lesson marked complete.'); }
    catch (e) { notify(e.message); }
  }
  async function assignTask(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/tasks', { method: 'POST', body: JSON.stringify({ ...taskDraft, courseId }) }); setTaskDraft({ learnerId: '', title: '', description: '', dueDate: '' }); notify('Practice task assigned.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const weeks = [...new Set(items.map((lesson) => lesson.week_number))].sort((a, b) => a - b);
  const activeLesson = items.find((lesson) => lesson.id === activeLessonId);
  const activeVideo = activeLesson?.resources?.find((resource) => resource.type === 'video');
  const embeddedVideo = activeVideo && videoEmbedUrl(activeVideo.url);
  const upcomingSessions = sessions.filter((session) => session.course_id === courseId && new Date(session.ends_at) > new Date());
  const lessonsComplete = items.length > 0 && items.every((lesson) => lesson.completed);
  return <div className="page-content"><Heading eyebrow="WEEK-WISE COURSE MATERIALS" title={isTrainer ? 'Course materials.' : 'Lessons & resources.'} description={isTrainer ? 'Organize lessons by week and share practice resources with learners in your courses.' : 'Work through each unlocked week, open its resources, and track lesson completion.'} />
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="course-material-toolbar"><label>Course<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{data.courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></label></div>
    {isTrainer && <form ref={lessonEditorRef} className="panel lesson-editor" onSubmit={saveLesson}><div className="panel-heading"><div><h2>{editingId ? 'Edit lesson' : 'Create lesson'}</h2><p>Resource links must use HTTPS.</p></div>{editingId && <button className="icon-button" type="button" aria-label="Cancel lesson edit" onClick={cancelEdit}> <X size={17} /></button>}</div><div className="form-grid"><label>Lesson title<input required minLength={3} maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>{!editingId && <label>Week number<input required type="number" min="1" max="52" value={draft.weekNumber} onChange={(event) => setDraft({ ...draft, weekNumber: Number(event.target.value) })} /></label>}<label>Lesson order<input required type="number" min="1" max="100" value={draft.position} onChange={(event) => setDraft({ ...draft, position: Number(event.target.value) })} /></label></div><label>Description<textarea maxLength={1500} rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      {resources.map((resource, index) => <div className="lesson-resource-input" key={index}><label>Resource type<select value={resource.type} onChange={(event) => setResources((current) => current.map((item, i) => i === index ? { ...item, type: event.target.value } : item))}><option value="video">Video</option><option value="pdf">PDF</option><option value="note">Notes</option><option value="link">Link</option></select></label><label>Resource name<input maxLength={100} value={resource.title} onChange={(event) => setResources((current) => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /></label><label>HTTPS resource URL<input type="url" pattern="https://.+" value={resource.url} onChange={(event) => setResources((current) => current.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} /></label>{resources.length > 1 && <button className="icon-button" type="button" aria-label="Remove resource" onClick={() => setResources((current) => current.filter((_, i) => i !== index))}><X size={15} /></button>}</div>)}
      <label>Upload file (PDF, MP4/WebM video, or text · max 15 MB)<input type="file" accept="application/pdf,video/mp4,video/webm,text/plain,.pdf,.mp4,.webm,.txt" onChange={(event) => setLessonFile(event.target.files?.[0] || null)} /></label>{lessonFile && <small>{lessonFile.name} · {Math.ceil(lessonFile.size / 1024)} KB</small>}
      <div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setResources((current) => [...current, { type: 'link', title: '', url: '' }])}><Plus size={14} /> Add link</button><button className="button-primary" disabled={busy || !courseId || (lessonFile && lessonFile.size > 15 * 1024 * 1024)}>{busy ? 'Saving…' : editingId ? 'Save lesson' : 'Publish lesson'} <ArrowRight size={15} /></button></div></form>}
    {isTrainer && <form className="panel practice-task-form" onSubmit={assignTask}><div className="panel-heading"><div><h2>Assign practice task</h2><p>Students must already be assigned to this course.</p></div></div><div className="form-grid"><label>Student<select required value={taskDraft.learnerId} onChange={(event) => setTaskDraft({ ...taskDraft, learnerId: event.target.value })}><option value="">Choose a learner</option>{assignedLearners.map((learner) => <option key={learner.id} value={learner.id}>{learner.name}</option>)}</select></label><label>Task title<input required minLength={3} maxLength={120} value={taskDraft.title} onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })} /></label><label>Due date<input required type="date" value={taskDraft.dueDate} onChange={(event) => setTaskDraft({ ...taskDraft, dueDate: event.target.value })} /></label><label>Instructions<input required minLength={5} maxLength={1500} value={taskDraft.description} onChange={(event) => setTaskDraft({ ...taskDraft, description: event.target.value })} /></label></div><button className="button-secondary" disabled={busy || !assignedLearners.length}>Assign task <ArrowRight size={14} /></button></form>}
    {!isTrainer && upcomingSessions.length > 0 && <section className="live-class-list"><div className="live-class-heading"><span><b>Live classes</b><small>Join a scheduled session with your trainer.</small></span><Badge tone="soon">{upcomingSessions.length} upcoming</Badge></div>{upcomingSessions.map((session) => <article className="live-class-row" key={session.id}><span className="live-class-icon"><CalendarDays size={17} /></span><span><b>{session.topic}</b><small>{new Date(session.starts_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</small></span><a className="button-secondary small" href={session.meeting_url} target="_blank" rel="noopener noreferrer">Join class <ArrowUpRight size={14} /></a></article>)}</section>}
    {!isTrainer && items.length > 0 ? <div className="course-learning-layout"><section className="course-player-column"><article className="course-player panel">
      {activeVideo ? <div className="video-frame">{embeddedVideo ? <iframe src={embeddedVideo} title={activeVideo.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen /> : <video controls preload="metadata" src={activeVideo.url} onEnded={() => activeLesson && !activeLesson.completed && completeLesson(activeLesson)}><track kind="captions" />Your browser does not support video playback.</video>}</div> : <div className="video-placeholder"><BookOpen size={28} /><span>LESSON {activeLesson?.position || ''}</span><b>{activeLesson?.title || 'Choose a lesson'}</b></div>}
      <div className="course-player-body"><p className="eyebrow">WEEK {activeLesson?.week_number} · {data.courses.find((course) => course.id === courseId)?.title}</p><div className="course-player-title"><div><h2>{activeLesson?.title}</h2><p>{activeLesson?.description}</p></div>{activeLesson?.completed && <Badge tone="positive">Complete</Badge>}</div>
      {activeLesson?.resources?.length > 0 && <div className="lesson-resources">{activeLesson.resources.filter((resource) => resource !== activeVideo).map((resource, index) => <a href={resource.url} target="_blank" rel="noopener noreferrer" key={`${resource.url}-${index}`}><FileText size={14} />{resource.type.toUpperCase()} · {resource.title}<ArrowUpRight size={13} /></a>)}</div>}
      {activeLesson && !activeLesson.completed && <button className="button-primary small" onClick={() => completeLesson(activeLesson)}>Mark lesson complete <Check size={14} /></button>}
      {lessonsComplete && <p className="course-completion-note"><Award size={16} /> All course lessons completed. Pass every weekly exam to earn your certificate.</p>}
      </div></article></section><aside className="course-lesson-queue panel"><div className="course-queue-heading"><div><p className="eyebrow">COURSE CONTENT</p><h2>{items.filter((lesson) => lesson.completed).length}/{items.length} lessons</h2></div><ProgressBar value={Math.round(items.filter((lesson) => lesson.completed).length / items.length * 100)} /></div>{weeks.map((week) => <div className="course-queue-week" key={week}><p>WEEK {week}</p>{items.filter((lesson) => lesson.week_number === week).map((lesson) => <button className={`course-queue-item ${lesson.id === activeLessonId ? 'active' : ''}`} key={lesson.id} onClick={() => setActiveLessonId(lesson.id)}><span className={`queue-check ${lesson.completed ? 'complete' : ''}`}>{lesson.completed ? <Check size={13} /> : lesson.position}</span><span><b>{lesson.title}</b><small>{lesson.resources?.some((resource) => resource.type === 'video') ? 'Video lesson' : 'Reading & resources'}</small></span></button>)}</div>)}</aside></div> : !isTrainer && items.length === 0 ? <div className="panel empty-state"><BookOpen size={22} /><b>No lessons published yet</b><span>Your trainer’s lessons will appear here.</span></div> : <div className="lesson-weeks">{weeks.map((week) => <section className="panel lesson-week" key={week}><div className="panel-heading"><div><p className="eyebrow">WEEK {week}</p><h2>{data.courses.find((course) => course.id === courseId)?.title}</h2></div></div>{items.filter((lesson) => lesson.week_number === week).map((lesson) => <article className="lesson-item" key={lesson.id}><div className="lesson-item-heading"><span><b>{lesson.position}. {lesson.title}</b><small>{lesson.description}</small></span>{lesson.completed && <Badge tone="positive">Complete</Badge>}</div>{lesson.resources?.length > 0 && <div className="lesson-resources">{lesson.resources.map((resource, index) => <a href={resource.url} target="_blank" rel="noopener noreferrer" key={`${resource.url}-${index}`}><FileText size={14} />{resource.type.toUpperCase()} · {resource.title}<ArrowUpRight size={13} /></a>)}</div>}<div className="lesson-actions">{isTrainer && <button className="text-link" onClick={() => beginEdit(lesson)}>Edit lesson <ArrowRight size={14} /></button>}</div></article>)}</section>)}{isTrainer && items.length === 0 && <div className="panel empty-state"><BookOpen size={22} /><b>No lessons published yet</b><span>Create the first week lesson for this course.</span></div>}</div>}
  </div>;
}
function Attendance({ data, user, notify, reload }) {
  const student = user.role === 'student';
  const [records, setRecords] = useState([]); const [error, setError] = useState('');
  const [courseId, setCourseId] = useState(data.courses[0]?.id || '');
  const [sessions, setSessions] = useState([]);
  const [sessionDraft, setSessionDraft] = useState({ topic: '', startsAt: '', endsAt: '', meetingUrl: '', makeUp: false });
  const [sessionDate, setSessionDate] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  });
  const [roster, setRoster] = useState([]); const [busy, setBusy] = useState(false);
  const canRecord = ['trainer', 'coordinator', 'admin'].includes(user.role);
  const loadRecords = useCallback(() => api('/attendance').then(setRecords), []);
  const loadSessions = useCallback(() => api('/class-sessions').then(setSessions), []);
  const loadRoster = useCallback(async () => {
    if (!courseId) { setRoster([]); return; }
    const result = await api(`/attendance/roster?courseId=${encodeURIComponent(courseId)}&date=${sessionDate}`);
    setRoster(result.learners);
  }, [courseId, sessionDate]);
  useEffect(() => { loadRecords().catch((e) => setError(e.message)); }, [loadRecords]);
  useEffect(() => { loadSessions().catch((e) => setError(e.message)); }, [loadSessions]);
  useEffect(() => {
    if (canRecord) loadRoster().catch((e) => setError(e.message));
  }, [canRecord, loadRoster]);
  async function saveAttendance(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/attendance', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          sessionDate,
          records: roster.map((learner) => ({ userId: learner.id, status: learner.status }))
        })
      });
      await Promise.all([loadRecords(), loadRoster(), reload()]);
      notify('Attendance saved for this session.');
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }
  async function scheduleSession(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await api('/class-sessions', { method: 'POST', body: JSON.stringify({ courseId, ...sessionDraft, startsAt: new Date(sessionDraft.startsAt).toISOString(), endsAt: new Date(sessionDraft.endsAt).toISOString() }) });
      setSessionDraft({ topic: '', startsAt: '', endsAt: '', meetingUrl: '', makeUp: false }); await loadSessions(); notify('Class added to the timetable.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function setLearnerStatus(learnerId, status) {
    setRoster((current) => current.map((learner) => learner.id === learnerId ? { ...learner, status } : learner));
  }
  return <div className="page-content"><Heading eyebrow="SHOW UP FOR YOURSELF" title={student ? 'Schedule & attendance.' : 'Learner attendance.'} description={student ? 'Your next sessions, recent check-ins, and a clear picture of how you’re showing up.' : 'Check attendance trends and recent check-ins for your courses or campus.'} action={<button className="button-secondary"><Download size={15} /> Export record</button>} />
    <div className="attendance-summary"><div className="attendance-score"><span>{student ? 'YOUR ATTENDANCE' : 'LEARNER ATTENDANCE'}</span><strong>{data.attendance}<small>%</small></strong><Badge tone="positive"><CheckCircle2 size={13} /> {student ? 'In great shape' : user.role === 'trainer' ? 'Assigned courses' : 'Campus overview'}</Badge></div><div className="attendance-note"><div className="score-ring"><span>{data.attendance}</span><small>%</small></div><p>{student ? 'Consistency is a practice, not a perfect streak. You’re showing up for the work that matters.' : 'This view is limited to assigned courses for trainers and campus-wide records for coordinators.'}</p></div></div>
    {canRecord && <section className="panel attendance-entry"><div className="panel-heading"><div><h2>Record a session</h2><p>Roster lists learners with assigned work in this course. Updates replace that learner’s status for the selected date.</p></div></div><form onSubmit={saveAttendance} className="attendance-entry-form"><label>Course<select required value={courseId} onChange={(e) => setCourseId(e.target.value)}>{data.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label><label>Session date<input type="date" required value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} /></label><div className="attendance-roster">{roster.length === 0 ? <p className="empty-hint">No learners with assigned tasks are on this course roster yet.</p> : roster.map((learner) => <label className="attendance-roster-row" key={learner.id}><span><b>{learner.name}</b><small>{learner.cohort}</small></span><select aria-label={`Attendance status for ${learner.name}`} value={learner.status} onChange={(e) => setLearnerStatus(learner.id, e.target.value)}><option value="unmarked">Not marked</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></label>)}</div><button className="button-primary" disabled={busy || roster.length === 0 || roster.some((learner) => learner.status === 'unmarked')}>{busy ? 'Saving…' : 'Save attendance'} <Check size={15} /></button></form></section>}
    {canRecord && <form className="panel session-create" onSubmit={scheduleSession}><div className="panel-heading"><div><h2>Schedule a class</h2><p>Add a topic, time, and meeting link for the selected course.</p></div></div><div className="form-grid"><label>Course<select required value={courseId} onChange={(event) => setCourseId(event.target.value)}>{data.courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></label><label>Session topic<input required minLength={3} maxLength={160} value={sessionDraft.topic} onChange={(event) => setSessionDraft({ ...sessionDraft, topic: event.target.value })} /></label><label>Starts at<input required type="datetime-local" value={sessionDraft.startsAt} onChange={(event) => setSessionDraft({ ...sessionDraft, startsAt: event.target.value })} /></label><label>Ends at<input required type="datetime-local" value={sessionDraft.endsAt} onChange={(event) => setSessionDraft({ ...sessionDraft, endsAt: event.target.value })} /></label><label>Meeting link<input required type="url" pattern="https://.+" value={sessionDraft.meetingUrl} onChange={(event) => setSessionDraft({ ...sessionDraft, meetingUrl: event.target.value })} /></label><label className="check-field"><input type="checkbox" checked={sessionDraft.makeUp} onChange={(event) => setSessionDraft({ ...sessionDraft, makeUp: event.target.checked })} /> Make-up class</label></div><button className="button-primary" disabled={busy}>{busy ? 'Scheduling…' : 'Add class'} <CalendarDays size={15} /></button></form>}
    <div className="section-title-row schedule-title"><div><h2>Class timetable</h2><p>Scheduled sessions for your courses.</p></div></div>
    <div className="panel session-panel">{sessions.map((session) => <div className="session-row" key={session.id}><div className="session-date"><b>{new Date(session.starts_at).toLocaleDateString('en-IN', { day: '2-digit' })}</b><span>{new Date(session.starts_at).toLocaleDateString('en-IN', { month: 'short' }).toUpperCase()}</span></div><span className="session-marker lilac"><BookOpen size={16} /></span><div className="session-details"><b>{session.topic}</b><span>{session.course_title} {session.make_up ? '· Make-up class' : ''}</span></div><div className="session-time">{new Date(session.starts_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</div><a className="button-secondary small" href={session.meeting_url} target="_blank" rel="noopener noreferrer">Join <ArrowUpRight size={13} /></a></div>)}{sessions.length === 0 && <div className="empty-state">No class sessions scheduled yet.</div>}</div>
    {error && <p className="error-message" role="alert">{error}</p>}<div className="section-title-row attendance-history-title"><div><h2>Recent check-ins</h2><p>Attendance updates after each trainer check-in.</p></div></div><div className="panel attendance-table"><div className="table-row table-head"><span>{student ? 'LEARNING PATH' : 'LEARNER'}</span><span>DATE</span><span>{student ? 'SESSION' : 'COURSE'}</span><span>STATUS</span></div>{records.map((r) => <div className="table-row" key={r.id}><span>{student ? r.course_title : r.learner_name}</span><span>{new Date(`${r.session_date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span><span>{student ? 'Live workshop' : r.course_title}</span><span><Badge tone={r.status === 'present' ? 'positive' : 'subtle'}>{r.status === 'present' ? 'Present' : r.status}</Badge></span></div>)}{records.length === 0 && <div className="empty-state">No attendance records yet.</div>}</div><p className="fine-print"><ShieldCheck size={14} /> {student ? 'Your attendance is visible only to you and authorised campus staff.' : 'Trainer records are course-scoped; coordinator and administrator access is campus-wide.'}</p></div>;
}
function Tasks({ tasks, user, reload, notify }) {
  const [selected, setSelected] = useState(null); const [url, setUrl] = useState(''); const [note, setNote] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const canReview = ['trainer', 'coordinator', 'admin'].includes(user.role);
  const taskCounts = {
    all: tasks.length,
    todo: tasks.filter((task) => task.status === 'todo').length,
    in_review: tasks.filter((task) => task.status === 'in_review').length,
    complete: tasks.filter((task) => task.status === 'complete').length
  };
  const visibleTasks = filter === 'all' ? tasks : tasks.filter((task) => task.status === filter);
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try { await api(`/tasks/${selected.id}/submit`, { method: 'POST', body: JSON.stringify({ submissionUrl: url, note }) }); await reload(); setSelected(null); setUrl(''); setNote(''); notify('Your work is with your trainer. Nice one!'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function review(task) {
    const feedback = window.prompt('Add feedback for the learner:');
    if (feedback === null) return;
    const status = window.confirm('Request changes from the learner? Choose Cancel to mark the assignment complete.') ? 'changes_requested' : 'complete';
    try { await api(`/tasks/${task.id}/feedback`, { method: 'POST', body: JSON.stringify({ feedback, status }) }); await reload(); notify(status === 'complete' ? 'Assignment marked complete.' : 'Changes requested; the learner can resubmit.'); } catch (e) { notify(e.message); }
  }
  return <div className="page-content"><Heading eyebrow="THE WORK IN PROGRESS" title={canReview ? 'Learner submissions.' : 'Tasks & feedback.'} description={canReview ? 'Review thoughtful work and leave feedback learners can act on.' : 'Small briefs, thoughtful work, and feedback that helps you grow.'} action={!canReview && <button className="button-secondary" onClick={() => document.getElementById('submission-guide')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}><FileText size={15} /> Submission guide</button>} />
    <div className="track-filter" role="group" aria-label="Filter tasks by status"><button className={`filter-pill ${filter === 'all' ? 'selected' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All tasks <i>{taskCounts.all}</i></button><button className={`filter-pill ${filter === 'todo' ? 'selected' : ''}`} aria-pressed={filter === 'todo'} onClick={() => setFilter('todo')}>To do <i>{taskCounts.todo}</i></button><button className={`filter-pill ${filter === 'in_review' ? 'selected' : ''}`} aria-pressed={filter === 'in_review'} onClick={() => setFilter('in_review')}>In review <i>{taskCounts.in_review}</i></button><button className={`filter-pill ${filter === 'complete' ? 'selected' : ''}`} aria-pressed={filter === 'complete'} onClick={() => setFilter('complete')}>Complete <i>{taskCounts.complete}</i></button></div>
    {!canReview && tasks.some((task) => task.reviewed_at) && <section className="panel review-history"><div className="panel-heading"><div><h2>Trainer review activity</h2><p>See who checked your assignment and what needs attention.</p></div><Activity size={18} /></div>{tasks.filter((task) => task.reviewed_at).map((task) => <div className="review-history-row" key={task.id}><span><b>{task.title}</b><small>{task.course_title} · {task.reviewer_name || 'Course trainer'} · {new Date(task.reviewed_at).toLocaleString('en-IN')}</small>{task.feedback && <small>{task.feedback}</small>}</span><Badge tone={task.review_status === 'changes_requested' ? 'review' : 'positive'}>{task.review_status === 'changes_requested' ? 'Changes requested' : 'Reviewed'}</Badge></div>)}</section>}
    <div className="task-page-grid"><div className="panel task-board"><div className="board-title"><span>{canReview ? 'LEARNER WORKSPACE' : 'YOUR WORKSPACE'}</span><span>{visibleTasks.length} tasks</span></div>{visibleTasks.length === 0 && <div className="empty-state"><FileCheck2 size={23} /><b>{tasks.length === 0 ? 'No tasks are available yet.' : `No ${filter === 'todo' ? 'to-do' : filter === 'in_review' ? 'in-review' : 'completed'} tasks.`}</b><span>{tasks.length === 0 ? canReview ? 'Assigned learner tasks and submissions will show up here.' : 'Your assigned tasks will show up here.' : 'Choose another status filter to see more tasks.'}</span></div>}
      {visibleTasks.map((task) => <article className="task-card" key={task.id}><div className="task-card-head"><Badge tone={task.status === 'complete' ? 'positive' : task.status === 'in_review' ? 'review' : 'subtle'}>{task.status === 'in_review' ? 'In review' : task.status === 'complete' ? 'Complete' : 'To do'}</Badge><button className="icon-button" aria-label={`More options for ${task.title}`}><MoreHorizontal size={18} /></button></div><h2>{task.title}</h2><p>{task.description}</p><div className="task-course"><BookOpen size={14} /> {task.course_title}</div>{canReview && task.status === 'in_review' && <div className="submission-review"><b>Submitted by {task.learner_name}</b>{task.submission_url && <a className="text-link" href={task.submission_url} target="_blank" rel="noopener noreferrer">Open student submission <ArrowRight size={14} /></a>}{task.submission_note && <p>{task.submission_note}</p>}</div>}<div className="task-card-footer"><span><Clock3 size={14} /> Due {new Date(`${task.due_date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>{canReview && task.status === 'in_review' ? <button className="text-link" onClick={() => review(task)}>Leave feedback <ArrowRight size={14} /></button> : !canReview && task.status === 'in_review' ? <button className="button-primary small" onClick={() => { setSelected(task); setUrl(task.submission_url || ''); setNote(task.submission_note || ''); setError(''); }}>Update submission <ArrowRight size={14} /></button> : task.status === 'todo' ? <button className="button-primary small" onClick={() => { setSelected(task); setUrl(task.submission_url || ''); setNote(task.submission_note || ''); setError(''); }}>Submit assignment <ArrowRight size={14} /></button> : <span className={task.status === 'complete' ? 'complete-label' : 'review-label'}>{task.status === 'complete' ? <CheckCircle2 size={14} /> : <Clock3 size={14} />} {task.status === 'complete' ? 'Submitted' : 'Awaiting feedback'}</span>}</div>{task.feedback && <div className="feedback-note"><MessageCircle size={15} /><span><b>Trainer feedback</b>{task.feedback}</span></div>}</article>)}</div>
      <aside className="task-sidebar"><section className="panel focus-panel"><span className="focus-asterisk">✳</span><p className="eyebrow">A SMALL REMINDER</p><h3>Done is better<br />than perfect.</h3><p>Learning happens in the making. Share what you have and keep moving.</p></section><section className="panel task-tip"><span className="tip-icon"><FileCheck2 size={17} /></span><b>What makes a good submission?</b><p>Share a secure project link your trainer can open, then add a note about what you’d like feedback on.</p>{!canReview && <button className="text-link" onClick={() => document.getElementById('submission-guide')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>See submission guide <ArrowRight size={14} /></button>}</section><div className="task-deadline"><CalendarDays size={18} /><span><b>Next deadline</b><small>Check the due date on each assignment card.</small></span><ArrowRight size={15} /></div></aside>
    </div>
    {selected && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelected(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="submit-title"><div className="modal-top"><span className="modal-icon"><FileCheck2 size={19} /></span><button className="icon-button" aria-label="Close" onClick={() => setSelected(null)}><X size={19} /></button></div><p className="eyebrow">{selected.status === 'in_review' ? 'UPDATE YOUR WORK' : 'READY WHEN YOU ARE'}</p><h2 id="submit-title">{selected.status === 'in_review' ? 'Update your submission.' : 'Share your work.'}</h2><p className="muted">{selected.title} · Your trainer will be notified when you submit.</p><form onSubmit={submit}><label htmlFor="submission-url">Project link <i>REQUIRED</i></label><input id="submission-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-project.com" required maxLength={500} pattern="https://.+" title="Enter a secure HTTPS link that your trainer can open." /><small className="field-hint">Only HTTPS links are accepted. Set shared documents to “Anyone with the link can view.”</small><label htmlFor="submission-note">A note for your trainer <i>OPTIONAL</i></label><textarea id="submission-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="What would you especially like feedback on?" rows={3} /><span className="character-count">{note.length}/1000</span>{error && <p className="error-message" role="alert">{error}</p>}<div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setSelected(null)}>Save for later</button><button className="button-dark" disabled={busy}>{busy ? 'Sending…' : selected.status === 'in_review' ? 'Resubmit for review' : 'Send for review'} <Send size={15} /></button></div></form></section></div>}
    </div>;
}
function LiveCourses({ user, notify }) {
    const [offerings, setOfferings] = useState([]);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('All topics');
    const [filter, setFilter] = useState('all');
    const [showCreate, setShowCreate] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [recordingDrafts, setRecordingDrafts] = useState({});
    const [draft, setDraft] = useState({ title: '', category: '', description: '', level: 'Beginner', duration: '', startsAt: '', endsAt: '', capacity: 24, meetingUrl: '' });
    const isStudent = user.role === 'student';
    const load = useCallback(() => api('/live-courses').then(setOfferings), []);
    useEffect(() => { load().catch((loadError) => setError(loadError.message)); }, [load]);
    const topics = ['All topics', ...new Set(offerings.map((course) => course.category))];
    const visibleOfferings = offerings.filter((course) => {
      const matchesQuery = `${course.title} ${course.category} ${course.description} ${course.trainer_name}`.toLowerCase().includes(query.toLowerCase());
      const matchesCategory = category === 'All topics' || course.category === category;
      const matchesFilter = filter === 'all' || (filter === 'enrolled' && course.is_enrolled) || (filter === 'upcoming' && !course.is_live && new Date(course.ends_at) > new Date());
      return matchesQuery && matchesCategory && matchesFilter;
    });
    async function enroll(course) {
      setBusy(true); setError('');
      try { await api(`/live-courses/${course.id}/enroll`, { method: 'POST' }); await load(); notify(`You're registered for ${course.title}.`); }
      catch (enrollError) { setError(enrollError.message); }
      finally { setBusy(false); }
    }
    async function publish(event) {
      event.preventDefault(); setBusy(true); setError('');
      try {
        await api('/live-courses', { method: 'POST', body: JSON.stringify({
          ...draft, capacity: Number(draft.capacity), startsAt: new Date(draft.startsAt).toISOString(),
          endsAt: new Date(draft.endsAt).toISOString(), ...(draft.meetingUrl ? { meetingUrl: draft.meetingUrl } : {})
        }) });
        setDraft({ title: '', category: '', description: '', level: 'Beginner', duration: '', startsAt: '', endsAt: '', capacity: 24, meetingUrl: '' });
        setShowCreate(false); await load(); notify('Live course published.');
      } catch (publishError) { setError(publishError.message); }
      finally { setBusy(false); }
    }
    async function publishRecording(event, course) {
      event.preventDefault(); setBusy(true); setError('');
      try {
        await api(`/live-courses/${course.id}/recording`, { method: 'PATCH', body: JSON.stringify({ recordingUrl: recordingDrafts[course.id] || course.recording_url || '' }) });
        await load(); notify(`Recording published for ${course.title}.`);
      } catch (publishError) { setError(publishError.message); }
      finally { setBusy(false); }
    }
    return <div className="page-content live-courses-page">
      <section className="live-courses-masthead"><div><p className="eyebrow">TRAINER-LED · REAL-TIME LEARNING</p><h1>Learn it together.</h1><p>Join small-group workshops, build alongside a trainer, and leave with work you can share.</p></div><div className="live-masthead-mark"><Radio size={24} /><span>LIVE<br />STUDIO</span></div></section>
      {error && <p className="error-message" role="alert">{error}</p>}
      {!isStudent && <div className="live-publish-bar"><span><b>Trainer workspace</b><small>Publish a live cohort session for learners to discover.</small></span><button className="button-primary" onClick={() => setShowCreate((open) => !open)}><Plus size={15} /> {showCreate ? 'Close form' : 'Publish live course'}</button></div>}
      {showCreate && <form className="panel live-course-form" onSubmit={publish}><div className="panel-heading"><div><h2>New live course</h2><p>Set the session window, seat limit, and meeting room.</p></div></div><div className="form-grid"><label>Course title<input required minLength={4} maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Topic<input required minLength={2} maxLength={50} placeholder="Web engineering" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label><label>Experience level<select value={draft.level} onChange={(event) => setDraft({ ...draft, level: event.target.value })}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label><label>Duration<input required maxLength={40} placeholder="3 weeks" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} /></label><label>Starts<input required type="datetime-local" value={draft.startsAt} onChange={(event) => setDraft({ ...draft, startsAt: event.target.value })} /></label><label>Ends<input required type="datetime-local" value={draft.endsAt} onChange={(event) => setDraft({ ...draft, endsAt: event.target.value })} /></label><label>Seat limit<input required type="number" min="1" max="500" value={draft.capacity} onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} /></label><label>Meeting room URL<input type="url" pattern="https://.+" placeholder="https://meet.example.com/room" value={draft.meetingUrl} onChange={(event) => setDraft({ ...draft, meetingUrl: event.target.value })} /></label></div><label>What learners will do<textarea required minLength={20} maxLength={1000} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="modal-actions"><button className="button-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish session'} <ArrowRight size={15} /></button></div></form>}
      <div className="live-catalog-tools"><label className="live-search"><Search size={17} /><input aria-label="Search live courses" placeholder="Search workshops, skills, or trainers" value={query} onChange={(event) => setQuery(event.target.value)} /></label><div className="live-filters" aria-label="Live course filters">{(isStudent ? [['all', 'Explore all'], ['upcoming', 'Starting soon'], ['enrolled', 'My registrations']] : [['all', 'My sessions']]).map(([value, label]) => <button className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div></div>
      <div className="live-topic-row" aria-label="Filter by topic">{topics.map((topic) => <button className={category === topic ? 'selected' : ''} key={topic} onClick={() => setCategory(topic)}>{topic}</button>)}</div>
      <div className="live-catalog-heading"><div><p className="eyebrow">CAMPUS LIVE PROGRAMS</p><h2>{isStudent ? filter === 'enrolled' ? 'Your registrations' : 'Upcoming studios' : 'Sessions you host'}</h2></div><span>{visibleOfferings.length} {visibleOfferings.length === 1 ? 'course' : 'courses'}</span></div>
      <div className="live-course-grid">{visibleOfferings.map((course, index) => {
        const seats = Math.max(0, course.capacity - course.enrolled_count);
        const registrationClosed = new Date(course.ends_at) <= new Date() || seats === 0;
        return <article className={`live-course-card live-accent-${index % 3}`} key={course.id}>
          <div className="live-course-art"><span className="live-art-index">LIVE STUDIO · {String(index + 1).padStart(2, '0')}</span><Radio size={23} /><span className="live-art-topic">{course.category}</span></div>
          <div className="live-course-content"><div className="live-course-kickers"><Badge tone="soft">{course.level}</Badge>{course.is_live && <Badge tone="positive"><i className="live-dot" /> Happening now</Badge>}</div><h3>{course.title}</h3><p>{course.description}</p><div className="live-course-facts"><span><Users size={14} /> {course.enrolled_count}/{course.capacity} seats</span><span><Clock3 size={14} /> {course.duration}</span></div><div className="live-course-schedule"><CalendarDays size={15} /><span><b>{new Date(course.starts_at).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</b><small>{new Date(course.starts_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · {course.trainer_name}</small></span></div>
            {isStudent ? (
              course.recording_available ? <a className="button-secondary full-width live-join" href={course.recording_url} target="_blank" rel="noopener noreferrer"><Play size={15} /> Watch class recording <ArrowUpRight size={15} /></a>
                : course.can_join ? <a className="button-primary full-width live-join" href={course.meeting_url} target="_blank" rel="noopener noreferrer"><Radio size={15} /> Join live room <ArrowUpRight size={15} /></a>
                  : course.is_enrolled ? <button className="button-secondary full-width" disabled><Check size={15} /> {new Date(course.ends_at) <= new Date() ? 'Recording will be posted here' : 'Registered · join at session time'}</button>
                    : <button className="button-dark full-width" disabled={busy || registrationClosed} onClick={() => enroll(course)}>{registrationClosed ? seats === 0 ? 'Fully booked' : 'Registration closed' : 'Reserve a seat'} <ArrowRight size={15} /></button>
            ) : new Date(course.ends_at) <= new Date() ? <form className="live-recording-form" onSubmit={(event) => publishRecording(event, course)}><label>Class recording URL<input type="url" required pattern="https://.+" placeholder="https://video-host.example/recording" value={recordingDrafts[course.id] ?? course.recording_url ?? ''} onChange={(event) => setRecordingDrafts({ ...recordingDrafts, [course.id]: event.target.value })} /></label><button className="button-secondary small" disabled={busy}>{course.recording_url ? 'Update recording' : 'Publish recording'} <ArrowUpRight size={13} /></button></form> : <span className="live-host-label">Hosted by you</span>}
          </div></article>;
      })}{visibleOfferings.length === 0 && <div className="panel empty-state"><Radio size={22} /><b>No matching live courses</b><span>Try another topic or search term.</span></div>}</div>
    </div>;
  }
function Exams({ data, user, notify }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const [answers, setAnswers] = useState([]);
  const [questions, setQuestions] = useState([{ type: 'single', prompt: '', options: ['', ''], correctOption: 0, correctOptions: [], marks: 100 }]);
  const [draft, setDraft] = useState({ courseId: data.courses[0]?.id || '', title: '', weekNumber: 1, dueDate: new Date().toISOString().slice(0, 10), durationMinutes: 30, totalMarks: 100, retakeAllowed: true, maxAttempts: '', status: 'published' });
  const [gradeDrafts, setGradeDrafts] = useState({});
  const [passMark, setPassMark] = useState(70);
  const [passMarkDraft, setPassMarkDraft] = useState(70);
  const [busy, setBusy] = useState(false);
  const isTrainer = user.role === 'trainer';
  const isStudent = user.role === 'student';
  const load = useCallback(() => api('/exams').then((rows) => { setItems(rows); if (rows[0]?.pass_mark) setPassMark(rows[0].pass_mark); return rows; }), []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  useEffect(() => {
    api('/exam-settings').then(({ passMark: value }) => { setPassMark(value); setPassMarkDraft(value); }).catch((e) => setError(e.message));
  }, [user.role]);
  function updateQuestion(index, update) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...update } : question));
  }
  async function createExam(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('/exams', { method: 'POST', body: JSON.stringify({ ...draft, maxAttempts: draft.maxAttempts ? Number(draft.maxAttempts) : null, questions }) });
      setDraft((current) => ({ ...current, title: '', weekNumber: current.weekNumber + 1 }));
      setQuestions([{ type: 'single', prompt: '', options: ['', ''], correctOption: 0, correctOptions: [], marks: Number(draft.totalMarks) || 100 }]);
      await load(); notify(draft.status === 'published' ? 'Weekly exam published.' : 'Exam draft saved.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function savePassMark(event) {
    event.preventDefault(); setError('');
    try { const result = await api('/exam-settings', { method: 'PATCH', body: JSON.stringify({ passMark: Number(passMarkDraft) }) }); setPassMark(result.passMark); notify('Exam pass mark updated.'); }
    catch (e) { setError(e.message); }
  }
  async function submitExam(event, exam) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await api(`/exams/${exam.id}/attempt`, { method: 'POST', body: JSON.stringify({ answers }) });
      setSelectedExam(''); await load(); notify(result.pendingReview ? 'Exam submitted. Your trainer will review the descriptive answers.' : `Exam ${result.passed ? 'passed' : 'failed'} · ${result.score}%${result.passed ? '' : ` · ${result.passMark}% required to pass`}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function gradeAttempt(event, attempt, exam) {
    event.preventDefault(); setBusy(true); setError('');
    const grade = gradeDrafts[attempt.id] || {};
    try {
      await api(`/exams/attempts/${attempt.id}/grade`, { method: 'POST', body: JSON.stringify({ descriptiveMarks: Number(grade.marks), feedback: grade.feedback || '' }) });
      await load(); notify(`Exam graded for ${attempt.learner_name}.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function unlockLearner(learnerId, exam) {
    const reason = window.prompt(`Reason for unlocking Week ${exam.week_number + 1}:`);
    if (!reason) return;
    try {
      await api(`/student-progress/${exam.course_id}/unlock`, { method: 'PATCH', body: JSON.stringify({ learnerId, unlockedWeek: exam.week_number + 1, reason }) });
      notify(`Week ${exam.week_number + 1} unlocked with an audit reason.`);
    } catch (e) { notify(e.message); }
  }
  async function publishDraft(exam) {
    try { await api(`/exams/${exam.id}/publish`, { method: 'PATCH' }); await load(); notify('Exam published to enrolled students.'); }
    catch (e) { notify(e.message); }
  }
  return <div className="page-content"><Heading eyebrow="WEEKLY COURSE CHECKPOINTS" title={isTrainer ? 'Course exams.' : 'Weekly exams.'} description={isTrainer ? 'Publish weekly checks for your courses and follow each learner’s result.' : 'Check your understanding each week. Pass every exam in a course to earn its certificate.'} />
    {error && <p className="error-message" role="alert">{error}</p>}
    {user.role !== 'admin' && <p className="exam-passmark">Campus passing threshold: {passMark}%</p>}
    {user.role === 'admin' && <form className="panel exam-settings" onSubmit={savePassMark}><label>Pass mark (%)<input type="number" min="1" max="100" value={passMarkDraft} onChange={(event) => setPassMarkDraft(event.target.value)} /></label><span>New passing threshold: {passMark}%</span><button className="button-primary">Save pass mark</button></form>}
    {isTrainer && <form className="panel exam-create" onSubmit={createExam}><div className="panel-heading"><div><h2>Create a weekly exam</h2><p>Question marks must add up to the exam total.</p></div></div><div className="form-grid"><label>Course<select required value={draft.courseId} onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}>{data.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label><label>Exam title<input required minLength={3} maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Week 1 knowledge check" /></label><label>Week number<input required type="number" min="1" max="52" value={draft.weekNumber} onChange={(event) => setDraft({ ...draft, weekNumber: Number(event.target.value) })} /></label><label>Exam date<input required type="date" value={draft.dueDate} onChange={(event) => setDraft({ ...draft, dueDate: event.target.value })} /></label><label>Duration (minutes)<input type="number" min="1" max="300" value={draft.durationMinutes || 30} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })} /></label><label>Total marks<input type="number" min="1" max="10000" value={draft.totalMarks || 100} onChange={(event) => { const totalMarks = Number(event.target.value); setDraft({ ...draft, totalMarks }); setQuestions((current) => current.map((question) => ({ ...question, marks: totalMarks / current.length }))); }} /></label><label>Publish state<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="draft">Save draft</option><option value="published">Publish now</option></select></label><label>Maximum attempts<input type="number" min="1" max="20" placeholder="Unlimited" value={draft.maxAttempts} onChange={(event) => setDraft({ ...draft, maxAttempts: event.target.value })} /></label><label className="check-field"><input type="checkbox" checked={draft.retakeAllowed} onChange={(event) => setDraft({ ...draft, retakeAllowed: event.target.checked })} /> Allow retakes</label></div>
      <div className="form-grid exam-meta-fields"><label>Syllabus<textarea maxLength={2000} value={draft.syllabus || ''} onChange={(event) => setDraft({ ...draft, syllabus: event.target.value })} rows={2} /></label><label>Instructions<textarea maxLength={1000} value={draft.instructions || ''} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} rows={2} /></label><label>Practice materials<textarea maxLength={1000} value={draft.practiceMaterials || ''} onChange={(event) => setDraft({ ...draft, practiceMaterials: event.target.value })} rows={2} /></label></div>
      {questions.map((question, index) => <fieldset className="exam-question" key={index}><legend>Question {index + 1}</legend><div className="form-grid"><label>Question type<select value={question.type} onChange={(event) => updateQuestion(index, { type: event.target.value })}><option value="single">Single choice</option><option value="multiple">Multiple select</option><option value="descriptive">Descriptive</option></select></label><label>Marks<input type="number" min="0.5" step="0.5" value={question.marks} onChange={(event) => { const marks = Number(event.target.value); updateQuestion(index, { marks }); setDraft((current) => ({ ...current, totalMarks: questions.reduce((sum, item, itemIndex) => sum + (itemIndex === index ? marks : item.marks), 0) })); }} /></label></div><label>Question<input required minLength={5} maxLength={1000} value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} /></label>{question.type !== 'descriptive' && <><div className="exam-options">{question.options.map((option, optionIndex) => <label key={optionIndex}>Choice {optionIndex + 1}<input required maxLength={120} value={option} onChange={(event) => updateQuestion(index, { options: question.options.map((value, i) => i === optionIndex ? event.target.value : value) })} /></label>)}</div><div className="exam-option-actions"><button className="text-link" type="button" disabled={question.options.length >= 6} onClick={() => updateQuestion(index, { options: [...question.options, ''] })}><Plus size={13} /> Add choice</button>{question.options.length > 2 && <button className="text-link" type="button" onClick={() => updateQuestion(index, { options: question.options.slice(0, -1), correctOption: question.correctOption >= question.options.length - 1 ? 0 : question.correctOption, correctOptions: question.correctOptions.filter((option) => option < question.options.length - 1) })}>Remove last choice</button>}</div>{question.type === 'single' ? <label>Correct answer<select value={question.correctOption ?? 0} onChange={(event) => updateQuestion(index, { correctOption: Number(event.target.value) })}>{question.options.map((_, optionIndex) => <option key={optionIndex} value={optionIndex}>Choice {optionIndex + 1}</option>)}</select></label> : <div className="correct-options"><b>Select correct answers</b>{question.options.map((_, optionIndex) => <label key={optionIndex}><input type="checkbox" checked={question.correctOptions.includes(optionIndex)} onChange={(event) => updateQuestion(index, { correctOptions: event.target.checked ? [...question.correctOptions, optionIndex] : question.correctOptions.filter((option) => option !== optionIndex) })} /> Choice {optionIndex + 1}</label>)}</div>}</>}{questions.length > 1 && <button className="text-link" type="button" onClick={() => { const remaining = questions.filter((_, i) => i !== index); setQuestions(remaining); setDraft((current) => ({ ...current, totalMarks: remaining.reduce((sum, item) => sum + item.marks, 0) })); }}>Remove question <X size={14} /></button>}</fieldset>)}
      <div className="modal-actions"><button className="button-secondary" type="button" onClick={() => { const marks = draft.totalMarks / (questions.length + 1); setQuestions((current) => [...current.map((question) => ({ ...question, marks })), { type: 'single', prompt: '', options: ['', ''], correctOption: 0, correctOptions: [], marks }]); }}><Plus size={14} /> Add question</button><button className="button-primary" disabled={busy || !draft.courseId}>{busy ? 'Saving…' : draft.status === 'published' ? 'Publish exam' : 'Save draft'} <ArrowRight size={15} /></button></div></form>}
    <div className="exam-list">{items.map((exam) => {
      const passed = exam.attempts.some((attempt) => attempt.passed);
      const latest = exam.attempts[0];
      return <article className="panel exam-card" key={exam.id}><div className="exam-card-heading"><span className="stat-icon lilac-bg"><FileCheck2 size={18} /></span><div><Badge tone="soft">WEEK {exam.week_number} · {exam.status || 'published'}</Badge><h2>{exam.title}</h2><p>{exam.course_title} · Exam date {exam.exam_date || exam.due_date} · {exam.duration_minutes || 30} min · {exam.total_marks || 100} marks</p></div>{isStudent && <Badge tone={exam.locked ? 'subtle' : passed ? 'positive' : latest ? 'review' : 'subtle'}>{exam.locked ? 'Locked' : passed ? 'Passed' : latest?.grading_status === 'pending_review' ? 'Awaiting grade' : latest ? `${latest.score}% · retry` : 'Not started'}</Badge>}</div>
        {exam.syllabus && <p className="exam-syllabus"><b>Syllabus</b>{exam.syllabus}</p>}{exam.instructions && <p className="exam-syllabus"><b>Instructions</b>{exam.instructions}</p>}
        {isStudent && <><p className="exam-passmark">Pass mark: {exam.pass_mark}% · Your latest result: {latest ? latest.grading_status === 'pending_review' ? 'Awaiting trainer review' : `${latest.marks}/${exam.total_marks} marks (${latest.score}%)` : 'Not attempted'}</p><div className="exam-attempts">{exam.attempts.map((attempt) => <span key={attempt.id}>Attempt {attempt.attempt_number}: {attempt.grading_status === 'pending_review' ? 'Awaiting grade' : `${attempt.marks}/${exam.total_marks} · ${attempt.score}% · ${attempt.passed ? 'Pass' : 'Fail'}`}</span>)}</div>{!passed && latest?.grading_status === 'graded' && !exam.retake_allowed && <p className="exam-practice">Retake is disabled for this exam.</p>}{!passed && latest?.grading_status === 'graded' && exam.practice_materials && <p className="exam-practice"><b>Practice before retaking:</b> {exam.practice_materials}</p>}{exam.locked ? <button className="button-secondary" disabled>Pass earlier weeks to unlock</button> : latest?.grading_status === 'pending_review' ? <Badge tone="review">Awaiting trainer evaluation</Badge> : selectedExam === exam.id ? <form onSubmit={(event) => submitExam(event, exam)} className="exam-attempt-form">{exam.questions.map((question, index) => <fieldset key={index}><legend>{index + 1}. {question.prompt} <small>{question.marks} marks</small></legend>{question.type === 'descriptive' ? <textarea required maxLength={5000} rows={4} value={answers[index] || ''} onChange={(event) => setAnswers((current) => current.map((value, i) => i === index ? event.target.value : value))} /> : question.options.map((option, optionIndex) => <label className="exam-choice" key={optionIndex}><input type={question.type === 'multiple' ? 'checkbox' : 'radio'} name={`answer-${exam.id}-${index}`} checked={question.type === 'multiple' ? (answers[index] || []).includes(optionIndex) : answers[index] === optionIndex} onChange={(event) => setAnswers((current) => current.map((value, i) => i !== index ? value : question.type === 'multiple' ? event.target.checked ? [...(value || []), optionIndex] : (value || []).filter((option) => option !== optionIndex) : optionIndex))} />{option}</label>)}</fieldset>)}<div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setSelectedExam('')}>Cancel</button><button className="button-primary" disabled={busy || exam.questions.some((question, index) => question.type === 'descriptive' ? !String(answers[index] || '').trim() : question.type === 'multiple' ? !(answers[index] || []).length : typeof answers[index] !== 'number')}>{busy ? 'Submitting…' : 'Submit exam'} <Check size={15} /></button></div></form> : <button className="button-dark" disabled={exam.retake_allowed === false && exam.attempts.length > 0} onClick={() => { setSelectedExam(exam.id); setAnswers(exam.questions.map((question) => question.type === 'multiple' ? [] : question.type === 'descriptive' ? '' : null)); }}>{passed ? 'Retake exam' : latest ? 'Retest' : 'Start exam'} <ArrowRight size={15} /></button>}</>}
        {!isStudent && <div className="exam-attempts">{exam.status === 'draft' && <button className="button-primary small" onClick={() => publishDraft(exam)}>Publish draft <ArrowRight size={14} /></button>}{exam.attempts.length ? exam.attempts.map((attempt) => <section className="trainer-exam-attempt" key={attempt.id}><div className="application-row"><span><b>{attempt.learner_name} · Attempt {attempt.attempt_number}</b><small>{attempt.grading_status === 'pending_review' ? 'Needs manual evaluation' : `${attempt.marks}/${exam.total_marks} · ${attempt.score}% · ${attempt.passed ? 'Passed' : 'Failed'}`}</small></span>{attempt.passed === false && <button className="text-link" onClick={() => unlockLearner(attempt.learner_id, exam)}>Review unlock request <ArrowRight size={14} /></button>}</div>{attempt.grading_status === 'pending_review' && <form className="manual-grade-form" onSubmit={(event) => gradeAttempt(event, attempt, exam)}>{exam.questions.map((question, index) => question.type === 'descriptive' && <p key={index}><b>{question.prompt}</b><span>{attempt.answers[index]}</span></p>)}<div className="form-grid"><label>Descriptive marks (max {exam.questions.filter((question) => question.type === 'descriptive').reduce((sum, question) => sum + question.marks, 0)})<input required type="number" min="0" step="0.5" value={gradeDrafts[attempt.id]?.marks ?? ''} onChange={(event) => setGradeDrafts((current) => ({ ...current, [attempt.id]: { ...current[attempt.id], marks: event.target.value } }))} /></label><label>Feedback<input required maxLength={2000} value={gradeDrafts[attempt.id]?.feedback || ''} onChange={(event) => setGradeDrafts((current) => ({ ...current, [attempt.id]: { ...current[attempt.id], feedback: event.target.value } }))} /></label></div><button className="button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save grade'} <Check size={14} /></button></form>}</section>) : <span>No learner attempts yet.</span>}</div>}
      </article>;
    })}{items.length === 0 && <div className="panel empty-state"><FileCheck2 size={23} /><b>No weekly exams yet</b><span>{isTrainer ? 'Publish the first exam for one of your assigned courses.' : 'Your trainer’s weekly exams will appear here.'}</span></div>}</div>
  </div>;
}
function Internships({ data, user, notify }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedInternship, setSelectedInternship] = useState(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [skillsDraft, setSkillsDraft] = useState('');
  const canManage = ['coordinator', 'admin'].includes(user.role);
  const [draft, setDraft] = useState({ title: '', organization: '', description: '', applyBy: '', courseId: data.courses[0]?.id || '', stipend: '', duration: '', eligibility: '', type: 'internship', stage: 'screening', location: 'Remote', workMode: 'Remote', salary: '' });
  const load = useCallback(() => api('/internships').then(setItems), []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  async function create(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api('/internships', { method: 'POST', body: JSON.stringify({ ...draft, skills: skillsDraft.split(',').map((skill) => skill.trim()).filter(Boolean) }) }); setDraft({ title: '', organization: '', description: '', applyBy: '', courseId: data.courses[0]?.id || '', stipend: '', duration: '', eligibility: '', type: 'internship', stage: 'screening', location: 'Remote', workMode: 'Remote', salary: '' }); setSkillsDraft(''); await load(); notify('Internship opportunity published.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function apply(event) {
    event.preventDefault();
    if (!selectedInternship || !resumeFile) return;
    const form = new FormData(); form.append('resume', resumeFile);
    setBusy(true); setError('');
    try { await uploadApi(`/internships/${selectedInternship.id}/apply`, form); await load(); setSelectedInternship(null); setResumeFile(null); notify('Internship application submitted.'); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function updateApplication(applicationId, status) {
    try { await api(`/internships/applications/${applicationId}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await load(); notify('Application status updated.'); }
    catch (e) { notify(e.message); }
  }
  async function updateStage(opportunityId, stage) {
    try { await api(`/internships/${opportunityId}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) }); await load(); notify('Opportunity stage updated.'); }
    catch (e) { notify(e.message); }
  }
  return <div className="page-content"><Heading eyebrow="LEARNING THROUGH REAL WORK" title={canManage ? 'Internship opportunities.' : 'Find an internship.'} description={canManage ? 'Share opportunities and follow applications from learners in your courses.' : 'Explore practical experience connected to your learning and track each application.'} />
    {error && <p className="error-message" role="alert">{error}</p>}
    {selectedInternship && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedInternship(null); }}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="internship-apply-title"><div className="modal-top"><span className="modal-icon"><BriefcaseBusiness size={19} /></span><button className="icon-button" aria-label="Close" onClick={() => setSelectedInternship(null)}><X size={19} /></button></div><p className="eyebrow">APPLICATION · {selectedInternship.organization}</p><h2 id="internship-apply-title">{selectedInternship.title}</h2><p className="muted">Attach your resume as a PDF. Maximum file size: 5 MB.</p><form onSubmit={apply}><label htmlFor="internship-resume">Resume PDF</label><input id="internship-resume" type="file" accept="application/pdf,.pdf" required onChange={(event) => setResumeFile(event.target.files?.[0] || null)} />{resumeFile && <small>{resumeFile.name} · {Math.ceil(resumeFile.size / 1024)} KB</small>}{error && <p className="error-message" role="alert">{error}</p>}<div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setSelectedInternship(null)}>Cancel</button><button className="button-primary" disabled={busy || !resumeFile || resumeFile.size > 5 * 1024 * 1024}>{busy ? 'Submitting…' : 'Submit application'} <Send size={15} /></button></div></form></section></div>}
    {canManage && <form className="panel internship-create" onSubmit={create}>
      <div className="panel-heading"><div><h2>Post an opportunity</h2><p>Publish details for students and review submitted resumes.</p></div></div>
      <div className="form-grid"><label>Role title<input required minLength={3} maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label>Company<input required minLength={2} maxLength={120} value={draft.organization} onChange={(event) => setDraft({ ...draft, organization: event.target.value })} /></label><label>Application deadline<input required type="date" value={draft.applyBy} onChange={(event) => setDraft({ ...draft, applyBy: event.target.value })} /></label><label>Course<select value={draft.courseId} onChange={(event) => setDraft({ ...draft, courseId: event.target.value })}><option value="">All courses</option>{data.courses.map((course) => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label><label>Opportunity type<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option value="internship">Internship</option><option value="placement">Placement</option></select></label><label>Hiring stage<select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}><option value="screening">Screening</option><option value="interview">Interview</option><option value="offer">Offer</option><option value="closed">Closed</option></select></label><label>Location<input maxLength={120} value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Hyderabad" /></label><label>Work mode<select value={draft.workMode} onChange={(event) => setDraft({ ...draft, workMode: event.target.value })}><option value="Remote">Remote</option><option value="Hybrid">Hybrid</option><option value="On-site">On-site</option></select></label><label>Stipend / salary<input maxLength={80} value={draft.salary || draft.stipend} onChange={(event) => setDraft({ ...draft, salary: event.target.value, stipend: event.target.value })} placeholder="₹15,000 / month" /></label><label>Duration<input maxLength={80} value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} placeholder="3 months" /></label><label>Skills<input value={skillsDraft} onChange={(event) => setSkillsDraft(event.target.value)} placeholder="React, JavaScript, Git" /></label><label>Eligibility<input maxLength={500} value={draft.eligibility} onChange={(event) => setDraft({ ...draft, eligibility: event.target.value })} placeholder="Enrolled students with portfolio" /></label></div>
      <label>Description<textarea required minLength={10} maxLength={1500} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><button className="button-primary" disabled={busy}>{busy ? 'Publishing…' : 'Publish opportunity'} <ArrowRight size={15} /></button>
    </form>}
    {!canManage && items.some((item) => item.application) && <section className="panel application-history"><div className="panel-heading"><div><h2>My applications</h2><p>Review your submitted applications and current status.</p></div></div>{items.filter((item) => item.application).map((item) => <div className="application-row" key={item.application.id}><span><b>{item.title} · {item.organization}</b><small>Applied {new Date(item.application.applied_at).toLocaleDateString('en-IN')}</small></span><Badge tone={item.application.status === 'selected' ? 'positive' : item.application.status === 'rejected' ? 'subtle' : 'review'}>{item.application.status.replace('_', ' ')}</Badge>{item.application.has_resume && <a className="text-link" href={`/api/internships/applications/${item.application.id}/resume`}>View resume <ArrowRight size={14} /></a>}</div>)}</section>}
    <div className="internship-list">{items.map((item) => <article className="panel internship-card" key={item.id}>
      <div className="internship-card-heading"><span className="stat-icon peach-bg"><BriefcaseBusiness size={18} /></span><div><h2>{item.title}</h2><p>{item.organization} · {item.course_title}</p></div><Badge tone="soft">{item.type || 'internship'} · Apply by {item.apply_by}</Badge></div>
      <p className="internship-description">{item.description}</p>
      <div className="internship-details"><span><b>Stipend</b>{item.stipend || item.salary || 'Not specified'}</span><span><b>Duration</b>{item.duration || 'Flexible'}</span><span><b>Location</b>{item.location || 'Remote'}</span><span><b>Mode</b>{item.work_mode || item.workMode || 'Remote'}</span><span><b>Eligibility</b>{item.eligibility || 'Open to enrolled students'}</span></div>
      {canManage && <div className="internship-stage-row"><Badge tone={item.stage === 'offer' ? 'positive' : item.stage === 'closed' ? 'subtle' : 'review'}>{item.stage || 'screening'}</Badge><select value={item.stage || 'screening'} onChange={(event) => updateStage(item.id, event.target.value)}><option value="screening">Screening</option><option value="interview">Interview</option><option value="offer">Offer</option><option value="closed">Closed</option></select></div>}
      {item.skills?.length > 0 && <div className="internship-skills">{item.skills.map((skill) => <Badge tone="soft" key={skill}>{skill}</Badge>)}</div>}
      {!canManage ? <div className="internship-apply-row">{item.application ? <Badge tone={item.application.status === 'selected' ? 'positive' : item.application.status === 'rejected' ? 'subtle' : 'review'}>{item.application.status.replace('_', ' ')}</Badge> : <button className="button-dark" onClick={() => { setSelectedInternship(item); setResumeFile(null); setError(''); }}>Apply now <ArrowRight size={15} /></button>}</div> : <div className="internship-applications">{item.applications.map((application) => <div className="application-row" key={application.id}><span><b>{application.learner_name}</b><small>Applied {new Date(application.applied_at).toLocaleDateString('en-IN')}</small></span><a className="text-link" href={application.resume_url}>Resume <Download size={14} /></a><select aria-label={`Application status for ${application.learner_name}`} value={application.status} onChange={(event) => updateApplication(application.id, event.target.value)}><option value="applied">Applied</option><option value="under_review">Under review</option><option value="shortlisted">Shortlisted</option><option value="selected">Selected</option><option value="rejected">Rejected</option></select></div>)}{item.applications.length === 0 && <span className="muted">No applications yet.</span>}</div>}
    </article>)}{items.length === 0 && <div className="panel empty-state"><BriefcaseBusiness size={23} /><b>No internship opportunities yet</b><span>{canManage ? 'Post an opportunity to open applications.' : 'New internship opportunities will appear here.'}</span></div>}</div>
    {user.role === 'student' && <InternshipReadiness data={data} user={user} notify={notify} />}
  </div>;
}
function InternshipReadiness({ data, user, notify }) {
  const isTrainer = user.role === 'trainer';
  const [items, setItems] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [learners, setLearners] = useState([]);
  const [error, setError] = useState('');
  const [courseId, setCourseId] = useState(data.courses[0]?.id || '');
  const [assessmentDrafts, setAssessmentDrafts] = useState({});
  const [resumeDrafts, setResumeDrafts] = useState({});
  const [interviewDraft, setInterviewDraft] = useState({ learnerId: '', topic: 'Mock interview', startsAt: '', meetingUrl: '' });
  const load = useCallback(async () => {
    const result = await api('/readiness');
    setItems(result);
    if (isTrainer) {
      const [sessionRows, report] = await Promise.all([api('/mock-interviews'), api('/progress')]);
      setInterviews(sessionRows); setLearners(report.learners);
    }
  }, [isTrainer]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  const assignedLearners = learners.filter((learner) => learner.course_ids.includes(courseId));
  function assessmentFor(item) {
    const key = `${item.learner_id}:${item.course_id}`;
    return assessmentDrafts[key] || { readinessStatus: item.readiness_status === 'not_assessed' ? 'in_progress' : item.readiness_status, score: item.score ?? 0, skills: item.skills?.join(', ') || '', feedback: item.feedback || '', resumeStatus: item.resume_status || 'reviewed' };
  }
  async function reviewReadiness(event, item) {
    event.preventDefault(); const key = `${item.learner_id}:${item.course_id}`; const draft = assessmentFor(item);
    try {
      await api(`/readiness/${item.learner_id}`, { method: 'PATCH', body: JSON.stringify({ courseId: item.course_id, readinessStatus: draft.readinessStatus, score: Number(draft.score), skills: draft.skills.split(',').map((skill) => skill.trim()).filter(Boolean), feedback: draft.feedback, resumeStatus: draft.resumeStatus }) });
      await load(); notify(`Readiness review saved for ${item.learner_name}.`);
    } catch (e) { setError(e.message); }
  }
  async function submitResume(event, item) {
    event.preventDefault();
    try { await api('/readiness/resume', { method: 'POST', body: JSON.stringify({ courseId: item.course_id, resumeUrl: resumeDrafts[item.course_id] || item.resume_url }) }); await load(); notify('Resume sent to your trainer for review.'); }
    catch (e) { setError(e.message); }
  }
  async function scheduleInterview(event) {
    event.preventDefault();
    try { await api('/mock-interviews', { method: 'POST', body: JSON.stringify({ courseId, ...interviewDraft, startsAt: new Date(interviewDraft.startsAt).toISOString() }) }); setInterviewDraft({ learnerId: '', topic: 'Mock interview', startsAt: '', meetingUrl: '' }); await load(); notify('Mock interview scheduled.'); }
    catch (e) { setError(e.message); }
  }
  const visibleItems = isTrainer ? items.filter((item) => item.course_id === courseId) : items;
  return <section className="readiness-section"><div className="section-title-row"><div><h2>{isTrainer ? 'Internship readiness' : 'Resume review & readiness'}</h2><p>{isTrainer ? 'Review skills, give feedback, and recommend eligible learners; placement decisions stay with the placement team.' : 'Share a resume link and follow your trainer’s readiness feedback.'}</p></div></div>{error && <p className="error-message" role="alert">{error}</p>}
    {isTrainer && <><div className="course-material-toolbar"><label>Assigned course<select value={courseId} onChange={(event) => setCourseId(event.target.value)}>{data.courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></label></div><form className="panel interview-create" onSubmit={scheduleInterview}><h3>Schedule mock interview</h3><div className="form-grid"><label>Student<select required value={interviewDraft.learnerId} onChange={(event) => setInterviewDraft({ ...interviewDraft, learnerId: event.target.value })}><option value="">Choose a learner</option>{assignedLearners.map((learner) => <option value={learner.id} key={learner.id}>{learner.name}</option>)}</select></label><label>Topic<input required maxLength={120} value={interviewDraft.topic} onChange={(event) => setInterviewDraft({ ...interviewDraft, topic: event.target.value })} /></label><label>Date and time<input required type="datetime-local" value={interviewDraft.startsAt} onChange={(event) => setInterviewDraft({ ...interviewDraft, startsAt: event.target.value })} /></label><label>Meeting link<input required type="url" pattern="https://.+" value={interviewDraft.meetingUrl} onChange={(event) => setInterviewDraft({ ...interviewDraft, meetingUrl: event.target.value })} /></label></div><button className="button-secondary" disabled={!assignedLearners.length}>Schedule interview <CalendarDays size={14} /></button></form></>}
    <div className="readiness-list">{visibleItems.map((item) => <article className="panel readiness-card" key={`${item.learner_id}:${item.course_id}`}><div className="panel-heading"><div><p className="eyebrow">{item.course_title}</p><h2>{isTrainer ? item.learner_name : 'Your readiness'}</h2></div><Badge tone={item.readiness_status === 'ready_for_recommendation' ? 'positive' : item.readiness_status === 'needs_support' ? 'review' : 'subtle'}>{item.readiness_status.replaceAll('_', ' ')}</Badge></div>
      {item.resume_url && <a className="text-link" href={item.resume_url} target="_blank" rel="noopener noreferrer">Open submitted resume <ArrowUpRight size={14} /></a>}
      {!isTrainer && <form className="resume-submit-form" onSubmit={(event) => submitResume(event, item)}><label>Resume HTTPS link<input required type="url" pattern="https://.+" value={resumeDrafts[item.course_id] ?? item.resume_url ?? ''} onChange={(event) => setResumeDrafts({ ...resumeDrafts, [item.course_id]: event.target.value })} placeholder="https://your-resume.pdf" /></label><button className="button-secondary">Submit for trainer review <Send size={14} /></button></form>}
      {isTrainer && <form className="readiness-review-form" onSubmit={(event) => reviewReadiness(event, item)}><div className="form-grid"><label>Readiness score<input type="number" min="0" max="100" value={assessmentFor(item).score} onChange={(event) => setAssessmentDrafts({ ...assessmentDrafts, [`${item.learner_id}:${item.course_id}`]: { ...assessmentFor(item), score: event.target.value } })} /></label><label>Recommendation<select value={assessmentFor(item).readinessStatus} onChange={(event) => setAssessmentDrafts({ ...assessmentDrafts, [`${item.learner_id}:${item.course_id}`]: { ...assessmentFor(item), readinessStatus: event.target.value } })}><option value="in_progress">In progress</option><option value="needs_support">Needs support</option><option value="ready_for_recommendation">Ready to recommend</option></select></label><label>Resume status<select value={assessmentFor(item).resumeStatus} onChange={(event) => setAssessmentDrafts({ ...assessmentDrafts, [`${item.learner_id}:${item.course_id}`]: { ...assessmentFor(item), resumeStatus: event.target.value } })}><option value="pending">Pending</option><option value="reviewed">Reviewed</option><option value="changes_requested">Changes requested</option></select></label><label>Skills (comma separated)<input value={assessmentFor(item).skills} onChange={(event) => setAssessmentDrafts({ ...assessmentDrafts, [`${item.learner_id}:${item.course_id}`]: { ...assessmentFor(item), skills: event.target.value } })} /></label></div><label>Feedback<textarea required minLength={5} maxLength={1500} rows={2} value={assessmentFor(item).feedback} onChange={(event) => setAssessmentDrafts({ ...assessmentDrafts, [`${item.learner_id}:${item.course_id}`]: { ...assessmentFor(item), feedback: event.target.value } })} /></label><button className="button-primary">Save readiness review <Check size={14} /></button></form>}
      {item.feedback && <p className="readiness-feedback"><b>Trainer feedback</b>{item.feedback}</p>}
    </article>)}{visibleItems.length === 0 && <div className="panel empty-state"><BriefcaseBusiness size={22} /><b>{isTrainer ? 'No learners in this course yet' : 'No readiness review yet'}</b><span>{isTrainer ? 'Students in assigned courses will appear here.' : 'Submit your resume to start a readiness review.'}</span></div>}</div>
    {isTrainer && interviews.length > 0 && <section className="panel mock-interview-list"><h2>Mock interviews</h2>{interviews.map((interview) => <div className="application-row" key={interview.id}><span><b>{interview.learner_name} · {interview.topic}</b><small>{interview.course_title} · {new Date(interview.starts_at).toLocaleString('en-IN')}</small></span><a className="text-link" href={interview.meeting_url} target="_blank" rel="noopener noreferrer">Join <ArrowUpRight size={14} /></a></div>)}</section>}
  </section>;
}
function LearningLevels({ setPage }) {
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { api('/learning-progress').then(setCourses).catch((e) => setError(e.message)); }, []);
  return <div className="page-content"><Heading eyebrow="YOUR COURSE JOURNEY" title="Learning levels." description="Pass a week’s exam to unlock the next level. Miss the mark? Review the practice material and retake it." action={<button className="button-primary" onClick={() => setPage('exams')}>Weekly exams <ArrowRight size={15} /></button>} />
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="level-list">{courses.map((course) => <section className="panel level-course" key={course.course_id}><div className="panel-heading"><div><p className="eyebrow">{course.current_week ? `CURRENT LEVEL · WEEK ${course.current_week}` : 'COURSE COMPLETE'}</p><h2>{course.course_title}</h2></div><Badge tone={course.completion_percent === 100 ? 'positive' : 'review'}>{course.completion_percent}% complete</Badge></div><ProgressBar value={course.completion_percent} />
      {course.weeks.map((week) => <div className="level-week" key={week.id}><span className={`level-index ${week.passed ? 'passed' : week.locked ? 'locked' : ''}`}>{week.passed ? <Check size={14} /> : `W${week.week_number}`}</span><span><b>{week.title}</b><small>{week.locked ? 'Pass the earlier week to unlock this level.' : week.passed ? 'Level completed' : week.attempts.length ? `${week.attempts[0].score}% · retake available` : 'Ready to begin'}</small>{!week.passed && week.practice_materials && <small>Practice: {week.practice_materials}</small>}</span><Badge tone={week.passed ? 'positive' : week.locked ? 'subtle' : week.attempts.length ? 'review' : 'soft'}>{week.passed ? 'Passed' : week.locked ? 'Locked' : week.attempts.length ? 'Retake' : 'Unlocked'}</Badge></div>)}
      {course.weeks.length === 0 && <p className="muted">Your trainer has not published weekly levels yet.</p>}
    </section>)}{courses.length === 0 && !error && <div className="panel empty-state"><Activity size={22} /><b>No course levels yet</b><span>Weekly learning levels appear after your trainer publishes an exam.</span></div>}</div>
  </div>;
}
function Notifications({ notify }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const load = useCallback(() => api('/notifications').then(setItems), []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  async function markRead(item) {
    try { await api(`/notifications/${item.id}/read`, { method: 'PATCH' }); await load(); }
    catch (e) { notify(e.message); }
  }
  return <div className="page-content"><Heading eyebrow="CAMPUS ACTIVITY" title="Notifications." description="Exam reminders and results, internship applications, and status updates." />
    {error && <p className="error-message" role="alert">{error}</p>}
    <div className="panel notification-list">{items.map((item) => <article className={`notification-row ${item.read_at ? '' : 'unread'}`} key={item.id}><span className="notification-mark">{item.type.startsWith('exam') ? <FileCheck2 size={17} /> : <BriefcaseBusiness size={17} />}</span><span><b>{item.title}</b><small>{item.message}</small><small>{new Date(item.created_at).toLocaleString('en-IN')}</small></span>{!item.read_at && <button className="button-secondary small" onClick={() => markRead(item)}>Mark read</button>}</article>)}{items.length === 0 && <div className="empty-state"><Bell size={22} /><b>You’re all caught up</b><span>New reminders and application updates will appear here.</span></div>}</div>
  </div>;
}
function Progress({ data, setPage }) {
  const [certificates, setCertificates] = useState([]);
  useEffect(() => { api('/certificates').then(setCertificates).catch(() => setCertificates([])); }, []);
  const skills = [['Software development', 76], ['Marketing strategy', 62], ['Financial literacy', 81], ['Communication', 70]];
  return <div className="page-content"><Heading eyebrow="LOOK HOW FAR YOU’VE COME" title="A practice in progress." description="Progress is more than a number. Here’s the work, the consistency, and the new skills adding up." action={<button className="button-secondary"><Download size={15} /> Export summary</button>} />
    <div className="progress-overview-grid"><section className="panel overall-progress"><div><p className="eyebrow">YOUR CAMPUS JOURNEY</p><h2>Finding your<br />own rhythm.</h2><p>You have shown up, asked good questions, and done the work. That’s worth celebrating.</p><button className="text-link" onClick={() => setPage('courses')}>Keep the momentum <ArrowRight size={14} /></button></div><div className="progress-visual"><div className="progress-circle"><div><b>68</b><span>% complete</span></div></div><span className="visual-caption">YOUR OVERALL PROGRESS</span><span className="visual-flower">✳</span></div></section>
      <section className="panel skills-panel"><div className="panel-heading"><div><h2>Skills you’re growing</h2><p>Updated as you learn and practice.</p></div><Sparkles size={19} /></div>{skills.map(([skill, value]) => <div className="skill-row" key={skill}><div><span>{skill}</span><b>{value}%</b></div><ProgressBar value={value} /></div>)}</section></div>
    <div className="section-title-row certificates-title"><div><h2>Course certificates</h2><p>Complete every lesson and pass each weekly exam to earn a certificate.</p></div><button className="text-link" onClick={() => setPage('lessons')}>Continue learning <ArrowRight size={14} /></button></div><div className="panel milestone-panel">{certificates.length ? certificates.map((certificate) => <div className="milestone done" key={certificate.id}><span className="milestone-icon"><Award size={17} /></span><span><b>{certificate.course_title}</b><small>ISSUED · {new Date(certificate.issued_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} · {certificate.id}</small></span><button className="button-secondary small" title="Print or save certificate as PDF" onClick={() => printCertificate(certificate, data.user.name)}><Download size={14} /> Certificate</button></div>) : <div className="empty-state"><GraduationCap size={23} /><b>No certificates yet</b><span>Complete every course lesson and pass all weekly exams to earn a certificate.</span><button className="text-link" onClick={() => setPage('lessons')}>Go to lessons <ArrowRight size={14} /></button></div>}</div>
    <div className="reflection-strip"><span className="reflection-mark">✳</span><p><b>A little reflection goes a long way.</b><br />Take a moment to notice what you know today that you didn’t know last month.</p><button className="button-secondary">Write a reflection <ArrowRight size={14} /></button></div></div>;
}
function StaffProgress({ user }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/progress').then(setReport).catch((e) => setError(e.message)); }, []);
  const isAdmin = user.role === 'admin';
  const summary = report?.summary;
  function exportReport() {
    if (!report) return;
    const rows = [['Student', 'Cohort', 'Tasks complete', 'Tasks pending', 'Attendance %', 'Exam average %', 'Exams passed', 'Weak topics']];
    for (const learner of report.learners) rows.push([learner.name, learner.cohort, learner.completed_tasks, learner.pending_tasks, learner.attendance_rate, learner.average_exam_score ?? '', learner.exam_passed_count, learner.weak_topics.join('; ')]);
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); link.download = 'learner-progress.csv'; link.click(); URL.revokeObjectURL(link.href);
  }
  return <div className="page-content"><Heading eyebrow={isAdmin ? 'CAMPUS REPORTING' : 'LEARNER DEVELOPMENT'} title={isAdmin ? 'Campus reports & analytics.' : 'Learner progress.'} description={isAdmin ? 'A campus-wide view of task completion and attendance.' : 'Follow exam results, attendance, assignment progress, and weak topics for your assigned learners.'} action={<button className="button-secondary" disabled={!report} onClick={exportReport}><Download size={15} /> Export report</button>} />
    {error && <p className="error-message" role="alert">{error}</p>}
    {summary && <div className="stat-grid"><article className="stat-card"><div className="stat-card-top"><span>Learners in scope</span><span className="stat-icon lilac-bg"><Users size={17} /></span></div><strong className="stat-number">{summary.learner_count}</strong><div className="stat-meta">Based on recorded course activity</div></article><article className="stat-card"><div className="stat-card-top"><span>Tasks completed</span><span className="stat-icon mint-bg"><FileCheck2 size={17} /></span></div><strong className="stat-number">{summary.completed_tasks}<small> / {summary.task_count}</small></strong><div className="stat-meta">Completion rate across visible tasks</div></article><article className="stat-card"><div className="stat-card-top"><span>Attendance</span><span className="stat-icon peach-bg"><CalendarDays size={17} /></span></div><strong className="stat-number">{summary.attendance_rate}<small>%</small></strong><div className="stat-meta">{summary.present_records} present of {summary.attendance_records} recorded check-ins</div></article><article className="stat-card"><div className="stat-card-top"><span>Students needing support</span><span className="stat-icon yellow-bg"><CircleHelp size={17} /></span></div><strong className="stat-number">{summary.students_needing_support}</strong><div className="stat-meta">Failed topics, absences, or low attendance</div></article></div>}
    <div className="section-title-row"><div><h2>Learner activity</h2><p>{isAdmin ? 'Campus-wide records. Only authorised staff can view learner details.' : 'Only learners linked to your assigned courses are shown.'}</p></div></div>
    <div className="panel user-management"><div className="user-table-row user-table-head"><span>LEARNER</span><span>TASKS COMPLETE</span><span>ATTENDANCE</span><span>COHORT</span></div>{report?.learners.map((learner) => <div className="user-table-row" key={learner.id}><span className="managed-user"><Avatar initials={learner.avatar} /><span><b>{learner.name}</b><small>{learner.task_count} assigned tasks</small></span></span><span>{learner.completed_tasks} / {learner.task_count} ({learner.task_progress}%)</span><span>{learner.attendance_rate}% ({learner.present_records} / {learner.attendance_records})</span><span>{learner.cohort}</span></div>)}{report && report.learners.length === 0 && <div className="empty-state"><Activity size={23} /><b>No learner activity in this scope yet.</b><span>Progress appears after tasks or attendance are recorded.</span></div>}</div>
    {report?.learners.some((learner) => learner.exam_results.length || learner.weak_topics.length) && <div className="learner-performance-list">{report.learners.filter((learner) => learner.exam_results.length || learner.weak_topics.length).map((learner) => <article className="panel learner-performance" key={learner.id}><div><b>{learner.name}</b><span>{learner.average_exam_score === null ? 'No graded exams yet' : `Exam average ${learner.average_exam_score}%`} · {learner.exam_passed_count} passed / {learner.exam_attempt_count} attempts</span></div>{learner.weak_topics.length > 0 && <p><strong>Needs practice:</strong> {learner.weak_topics.join(', ')}</p>}<div className="exam-history-list">{learner.exam_results.map((result, index) => <span key={`${result.exam_title}-${result.attempted_at}-${index}`}>{result.exam_title} · {result.grading_status === 'pending_review' ? 'Awaiting grade' : `${result.marks}/${result.total_marks} · ${result.score}% · ${result.passed ? 'Pass' : 'Fail'}`}</span>)}</div></article>)}</div>}
    <p className="fine-print"><ShieldCheck size={14} /> These are activity indicators, not formal assessment grades or certificate eligibility.</p>
  </div>;
}
function Announcements({ initial, user, notify, courses }) {
  const [items, setItems] = useState(initial); const [compose, setCompose] = useState(false); const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ title: '', body: '', audience: user.role === 'trainer' ? 'Assigned course' : 'All learners', category: 'Campus update', courseId: courses[0]?.id || '' }); const [error, setError] = useState('');
  useEffect(() => { api('/announcements').then(setItems).catch((e) => setLoadError(e.message)); }, []);
  const canPublish = ['trainer', 'coordinator', 'admin'].includes(user.role);
  const courseScoped = user.role === 'trainer';
  async function publish(e) {
    e.preventDefault(); setError('');
    try { const item = await api('/announcements', { method: 'POST', body: JSON.stringify(form) }); setItems([item, ...items]); setCompose(false); setForm({ title: '', body: '', audience: courseScoped ? 'Assigned course' : 'All learners', category: 'Campus update', courseId: courses[0]?.id || '' }); notify(courseScoped ? 'Announcement sent to your course learners.' : 'Announcement published to your campus.'); }
    catch (e) { setError(e.message); }
  }
  return <div className="page-content"><Heading eyebrow="NOTES FROM YOUR CAMPUS" title="A word from your community." description="Good things happening, useful updates, and the moments worth showing up for." action={canPublish && <button className="button-primary" onClick={() => setCompose(true)}><Plus size={16} /> New announcement</button>} />
    <div className="announcement-feature"><div className="feature-art"><span className="feature-art-orbit" /><span>✳</span><small>AROUND CAMPUS</small></div><div className="feature-copy"><Badge tone="soft">{items[0]?.category || 'CAMPUS UPDATE'}</Badge><h2>{items[0]?.title || 'Welcome to your campus community'}</h2><p>{items[0]?.body || 'Updates from your learning community will show up here.'}</p><span>POSTED {items[0]?.published_at || 'TODAY'} <i /> {items[0]?.audience || 'ALL LEARNERS'}</span></div></div>
    {loadError && <p className="error-message" role="alert">{loadError}</p>}<div className="section-title-row announcement-list-title"><div><h2>The latest</h2><p>Updates from the people around you.</p></div><span className="text-link">All updates <ArrowRight size={14} /></span></div><div className="announcement-list">{items.slice(1).map((item, i) => <article className="panel announcement-row" key={item.id}><span className={`announcement-symbol symbol-${i % 3}`}>{['✺', '◒', '✳'][i % 3]}</span><div><Badge tone="subtle">{item.category}</Badge><h3>{item.title}</h3><p>{item.body}</p><small>{item.published_at} <i /> {item.audience}</small></div><button className="icon-button" aria-label="Read announcement"><ArrowRight size={17} /></button></article>)}</div>
    <div className="community-note"><Users size={18} /><p><b>Good things happen when we show up.</b><br />Your campus community is here to learn with you.</p><span>✳</span></div>
    {compose && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="announcement-title"><div className="modal-top"><span className="modal-icon"><Bell size={19} /></span><button className="icon-button" aria-label="Close" onClick={() => setCompose(false)}><X size={19} /></button></div><p className="eyebrow">CAMPUS COMMUNICATION</p><h2 id="announcement-title">Write an update.</h2><form onSubmit={publish}><label htmlFor="announce-title">Title</label><input id="announce-title" required maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /><label htmlFor="announce-body">Message</label><textarea id="announce-body" required maxLength={1000} rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />{courseScoped ? <label>Course<select required value={form.courseId} onChange={(event) => setForm({ ...form, courseId: event.target.value })}>{courses.map((course) => <option value={course.id} key={course.id}>{course.title}</option>)}</select></label> : <><label htmlFor="announce-audience">Audience</label><select id="announce-audience" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })}><option>All learners</option><option>Cohort 08</option><option>Trainers</option></select></>}<label htmlFor="announce-category">Category</label><input id="announce-category" maxLength={40} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />{error && <p className="error-message" role="alert">{error}</p>}<div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setCompose(false)}>Cancel</button><button className="button-dark">Publish <Send size={15} /></button></div></form></section></div>}
  </div>;
}
function Services() {
  const services = [[GraduationCap, 'Career studio', 'Portfolio reviews, interview practice, and thoughtful next steps.', 'CAREER READINESS', 'lilac-bg'], [Users, 'Alumni circle', 'Meet people who have been where you are — and keep in touch.', 'COMMUNITY', 'peach-bg'], [CalendarDays, 'Campus events', 'Showcases, open studios, guest talks, and other good things.', 'ON CAMPUS', 'mint-bg'], [CircleHelp, 'Learner support', 'Find a real person to help with access, schedules, or wellbeing.', 'HERE FOR YOU', 'yellow-bg']];
  return <div className="page-content"><Heading eyebrow="THE PEOPLE & PLACES AROUND YOU" title="More than a classroom." description="A few more doors to open as you find your way around campus." /><div className="service-grid">{services.map(([Icon, title, text, tag, color]) => <article className="panel service-card" key={title}><span className={`service-icon ${color}`}><Icon size={21} /></span><p className="eyebrow">{tag}</p><h2>{title}</h2><p>{text}</p><button className="text-link">Explore <ArrowRight size={14} /></button></article>)}</div><div className="services-note"><span>✳</span><p><b>Zyngram services, thoughtfully connected.</b><br />Links to external services are illustrative in this design prototype. No third-party accounts or personal information are shared.</p><ArrowUpRight size={17} /></div></div>;
}
function Support({ user, notify }) {
  const [tickets, setTickets] = useState([]); const [form, setForm] = useState({ topic: '', message: '' });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const isAdmin = user.role === 'admin';
  const loadTickets = useCallback(() => api('/support').then(setTickets), []);
  useEffect(() => { loadTickets().catch((e) => notify(e.message)); }, [loadTickets, notify]);
  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const ticket = await api('/support', { method: 'POST', body: JSON.stringify(form) });
      setTickets((current) => [ticket, ...current]); setForm({ topic: '', message: '' });
      notify(`Support request ${ticket.id} was sent to campus support.`);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  }
  async function updateStatus(ticket, status) {
    try {
      await api(`/support/${ticket.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadTickets();
      notify('Support request status updated.');
    } catch (updateError) {
      notify(updateError.message);
    }
  }
  return <div className="page-content"><Heading eyebrow="A REAL PERSON, WHEN YOU NEED ONE" title={isAdmin ? 'Campus support requests.' : 'We’re here with you.'} description={isAdmin ? 'Review learner requests and keep their status up to date.' : 'Questions about a class, a schedule, or finding your feet? It’s okay to ask.'} /><div className="support-grid"><section className="panel support-form-panel"><span className="support-spark">✳</span><p className="eyebrow">SEND A NOTE</p><h2>What can we help with?</h2><p className="muted">Your request is saved for the campus team to review.</p><form onSubmit={submit}><label htmlFor="support-topic">What’s this about?</label><select required id="support-topic" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}><option value="">Choose a topic</option><option>Learning & coursework</option><option>Schedule & attendance</option><option>Account access</option><option>Campus services</option><option>Something else</option></select><label htmlFor="support-message">Tell us a little more</label><textarea required id="support-message" minLength={10} maxLength={2000} rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="You don’t have to have it all figured out." />{error && <p className="error-message" role="alert">{error}</p>}<button className="button-dark" disabled={busy}>{busy ? 'Sending…' : 'Send to campus support'} <Send size={15} /></button></form></section><aside className="support-side"><section className="panel faq-panel"><p className="eyebrow">{isAdmin ? 'MANAGEMENT NOTE' : 'YOUR SUPPORT HISTORY'}</p><h3>{isAdmin ? 'Campus support queue' : 'Your requests'}</h3>{tickets.length === 0 && <p className="muted">No support requests yet.</p>}{tickets.map((ticket) => <article className="support-ticket" key={ticket.id}><div><Badge tone={ticket.status === 'resolved' ? 'positive' : 'review'}>{ticket.status.replace('_', ' ')}</Badge><h3>{ticket.topic}</h3>{isAdmin && <small>{ticket.requester_name} · {ticket.requester_role}</small>}<p>{ticket.message}</p><small>{new Date(ticket.created_at).toLocaleString()}</small></div>{isAdmin && <select aria-label={`Update status for ${ticket.id}`} value={ticket.status} onChange={(e) => updateStatus(ticket, e.target.value)}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select>}</article>)}</section><div className="support-urgent"><ShieldCheck size={16} /><span>For urgent personal support, connect with your trusted local support network.</span></div></aside></div></div>;
}
function Profile({ user }) {
  return <div className="page-content"><Heading eyebrow="A LITTLE ABOUT YOU" title="Your profile." description="The details that help your campus show up for you." /><div className="profile-layout"><section className="panel profile-card"><div className="profile-card-top"><Avatar initials={user.avatar} large /><Badge tone="positive"><CheckCircle2 size={13} /> ACTIVE</Badge><button className="button-secondary" disabled><Users size={15} /> Edit profile</button></div><h2>{user.name}</h2><p>{ROLE[user.role]} · {user.cohort}</p><div className="profile-divider" /><div className="profile-details"><div><span>EMAIL ADDRESS</span><b>{user.email}</b></div><div><span>CAMPUS</span><b>Hyderabad campus</b></div><div><span>COHORT</span><b>Cohort 08</b></div><div><span>LEARNING TRACK</span><b>Career pathways</b></div></div></section><section className="panel privacy-card"><ShieldCheck size={20} /><p className="eyebrow">YOUR INFORMATION, YOURS</p><h3>Learning is personal.<br />Your data should be, too.</h3><p>Only you and authorised campus staff can view your student record. Production sign-in uses a short-lived, HTTP-only session cookie.</p><span className="text-link">Read privacy approach <ArrowRight size={14} /></span></section></div></div>;
}
function Audit({ notify }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/audit').then(setRows).catch((e) => notify(e.message)); }, []);
  return <div className="page-content"><Heading eyebrow="CAMPUS OPERATIONS" title="Activity log." description="A recent, auditable record of sensitive campus actions." /><div className="panel audit-panel"><div className="table-row table-head"><span>WHO</span><span>WHAT HAPPENED</span><span>RECORD</span><span>WHEN</span></div>{rows.map((r) => <div className="table-row" key={r.id}><span>{r.actor} · {r.role}</span><span>{r.action}</span><span>{r.entity} · {r.entity_id}</span><span>{r.created_at}</span></div>)}</div><p className="fine-print"><ShieldCheck size={14} /> Audit access is restricted to administrators.</p></div>;
}
function UserManagement({ notify }) {
  const [users, setUsers] = useState([]);
  const [registrationRequests, setRegistrationRequests] = useState([]);
  const [open, setOpen] = useState(false);
  const [importingDemo, setImportingDemo] = useState(false);
  const [error, setError] = useState('');
  const [invitation, setInvitation] = useState(null);
  const [invitingId, setInvitingId] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'student', cohort: 'Cohort 08' });
  const load = useCallback(async () => {
    const [people, requests] = await Promise.all([api('/users'), api('/student-registration-requests')]);
    setUsers(people);
    setRegistrationRequests(requests);
  }, []);
  useEffect(() => { load().catch((e) => notify(e.message)); }, [load, notify]);
  async function create(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(form) });
      await load();
      setOpen(false);
      setForm({ name: '', email: '', role: 'student', cohort: 'Cohort 08' });
      notify('Account added. Send an invitation to let them set a password.');
    } catch (e) { setError(e.message); }
  }
  async function invite(user) {
    setInvitingId(user.id);
    try {
      const result = await api(`/users/${user.id}/invite`, { method: 'POST' });
      const manualUrl = result.manual_invitation_url || result.development_invitation_url;
      setInvitation(manualUrl ? {
        email: user.email,
        url: manualUrl,
        manual: Boolean(result.manual_invitation_url),
        emailDeliveryFailed: Boolean(result.email_delivery_failed)
      } : null);
      notify(manualUrl
        ? result.email_delivery_failed
          ? 'Email delivery failed. Share this one-time setup link privately.'
          : result.manual_invitation_url ? 'Email is not configured. Share this one-time setup link privately.' : 'Development invitation created. Copy the link below.'
        : `Invitation email sent to ${user.email}.`);
    } catch (e) {
      notify(e.message);
    } finally {
      setInvitingId('');
    }
  }
  async function reviewRegistration(request, status) {
    try {
      const result = await api(`/student-registration-requests/${request.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await load();
      notify(status === 'approved'
        ? result.credentials_ready
          ? `${request.name} is approved. They can now sign in with ZIN ID ${request.zin_id}.`
          : `${request.name} is now a student. Send an invitation to let them set a password.`
        : `Registration request from ${request.name} was declined.`);
    } catch (e) { notify(e.message); }
  }
  async function importDemoData() {
    if (!window.confirm('Add fictional demo student/trainer profiles, courses, assignments, and announcements? Existing accounts and records will not be overwritten. New demo accounts will have no password and cannot sign in until credentials are set.')) return;
    setImportingDemo(true);
    try {
      const result = await api('/admin/demo-data', { method: 'POST' });
      await load();
      notify(result.alreadyPresent
        ? 'Demo dataset is already present; no records were changed.'
        : `Demo dataset added: ${result.users} accounts, ${result.courses} courses, ${result.tasks} assignments, ${result.announcements} announcements.`);
    } catch (e) { notify(e.message); } finally { setImportingDemo(false); }
  }
  return <div className="page-content"><Heading eyebrow="CAMPUS OPERATIONS" title="People on campus." description="Review student access requests, manage campus accounts, and send secure credential setup invitations." action={<><button className="button-secondary" disabled={importingDemo} onClick={importDemoData}>{importingDemo ? 'Adding demo data…' : 'Add demo data'}</button><button className="button-primary" onClick={() => setOpen(true)}><Plus size={15} /> Add account</button></>} />
    {invitation && <section className="success-message invitation-link" role="status"><span>{invitation.emailDeliveryFailed ? `Email delivery failed. Share this one-time setup link privately with ${invitation.email}:` : invitation.manual ? `Email is not configured. Share this one-time setup link privately with ${invitation.email}:` : `Development-only setup link for ${invitation.email}:`}</span><a href={invitation.url}>{invitation.url}</a><button className="button-secondary" onClick={() => navigator.clipboard.writeText(invitation.url).then(() => notify('Invitation link copied.')).catch(() => notify('Copy failed. Select and copy the link manually.'))}>Copy link</button>{invitation.manual && <small>This link expires in 48 hours and can only be used once. Do not post it publicly.</small>}</section>}
    <div className="section-title-row"><div><h2>Student registration requests</h2><p>Review new student applications. Students can sign in with their ZIN ID after approval.</p></div><Badge tone={registrationRequests.filter((request) => request.status === 'pending').length ? 'review' : 'subtle'}>{registrationRequests.filter((request) => request.status === 'pending').length} pending</Badge></div>
    <div className="panel user-management"><div className="user-table-row user-table-head"><span>APPLICANT</span><span>ZIN ID</span><span>COHORT</span><span>REVIEW</span></div>{registrationRequests.map((request) => <div className="user-table-row" key={request.id}><span className="managed-user"><Avatar initials={request.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()} /><span><b>{request.name}</b><small>{request.email}</small></span></span><span>{request.zin_id || '—'}</span><span>{request.cohort}</span><span>{request.status === 'pending' ? <div className="registration-actions"><button className="text-link" onClick={() => reviewRegistration(request, 'approved')}>Approve</button><button className="text-link" onClick={() => reviewRegistration(request, 'rejected')}>Decline</button></div> : <Badge tone={request.status === 'approved' ? 'positive' : 'subtle'}>{request.status}</Badge>}</span></div>)}{registrationRequests.length === 0 && <div className="empty-state">No student registration requests yet.</div>}</div>
    <div className="panel user-management"><div className="user-table-row user-table-head"><span>PERSON</span><span>ROLE</span><span>COHORT</span><span>ACCOUNT</span></div>{users.map((user) => <div className="user-table-row" key={user.id}><span className="managed-user"><Avatar initials={user.avatar} /><span><b>{user.name}</b><small>{user.email}</small></span></span><span><Badge tone="subtle">{ROLE[user.role]}</Badge></span><span>{user.cohort}</span><span><Badge tone={user.account_status === 'active' ? 'positive' : 'review'}>{user.account_status}</Badge>{user.account_status !== 'active' && <button className="text-link invite-button" disabled={invitingId === user.id} onClick={() => invite(user)}>{invitingId === user.id ? 'Sending…' : 'Send invitation'} <ArrowRight size={13} /></button>}</span></div>)}</div>
    <p className="fine-print"><ShieldCheck size={14} /> Invitations expire after 48 hours and can only be used once. Passwords are never visible to administrators.</p>
    {open && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="user-title"><div className="modal-top"><span className="modal-icon"><Users size={19} /></span><button className="icon-button" aria-label="Close" onClick={() => setOpen(false)}><X size={19} /></button></div><p className="eyebrow">CAMPUS OPERATIONS</p><h2 id="user-title">Add a person.</h2><p className="muted">After adding the account, send a one-time setup invitation by email.</p><form onSubmit={create}><label htmlFor="user-name">Full name</label><input id="user-name" required minLength={2} maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /><label htmlFor="user-email">Campus email</label><input id="user-email" required type="email" maxLength={254} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /><label htmlFor="user-role">Portal role</label><select id="user-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{PORTALS.map((p) => <option value={p.role} key={p.role}>{p.title}</option>)}</select><label htmlFor="user-cohort">Cohort or team</label><input id="user-cohort" required minLength={2} maxLength={100} value={form.cohort} onChange={(e) => setForm({ ...form, cohort: e.target.value })} />{error && <p className="error-message" role="alert">{error}</p>}<div className="modal-actions"><button className="button-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="button-dark">Add account <ArrowRight size={15} /></button></div></form></section></div>}
  </div>;
}
const PORTALS = [
  { role: 'student', title: 'Student', text: 'Courses, attendance, tasks & progress', icon: GraduationCap },
  { role: 'trainer', title: 'Trainer', text: 'Courses, schedules, reviews & learner progress', icon: BookOpen },
  { role: 'coordinator', title: 'Campus Coordinator', text: 'Batches, attendance & announcements', icon: Users },
  { role: 'admin', title: 'Administration', text: 'Analytics, user access & activity', icon: ShieldCheck }
];
function Login({ onLogin }) {
  const [users, setUsers] = useState([]); const [selected, setSelected] = useState(null); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [mode, setMode] = useState('credentials');
  const [registrationOpen, setRegistrationOpen] = useState(false); const [registrationDone, setRegistrationDone] = useState(false);
  const [registrationNotice, setRegistrationNotice] = useState('');
  const [registration, setRegistration] = useState({ name: '', password: '', cohort: 'Cohort 08' });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registrationAccount, setRegistrationAccount] = useState(null);
  useEffect(() => { api('/demo-users').then(setUsers).catch(() => {}); }, []);
  const trainerAccounts = users.filter((item) => item.role === 'trainer');
  async function choose(role) { const user = users.find((item) => item.role === role); setSelected(role); setEmail(user?.email || ''); setError(''); setMode('credentials'); setPassword(''); setRegistrationOpen(false); setRegistrationDone(false); }
  async function signIn(e) { e.preventDefault(); setError(''); setBusy(true); try { await onLogin({ role: selected, email, password }); } catch (err) { setError(err.message); setBusy(false); } }
  async function demo(role) { setBusy(true); setError(''); try { await onLogin({ role, demo: true }); } catch (err) { setError(err.message); setBusy(false); } }
  async function submitRegistration(e) {
    e.preventDefault(); setError(''); setRegistrationNotice('');
    if (registration.password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      const result = await api('/student-registration-requests', { method: 'POST', body: JSON.stringify(registration) });
      setRegistrationDone(true);
      setRegistrationAccount({ zinId: result.zinId, email: result.email });
      setRegistrationNotice(result.notification?.message || '');
      setRegistration((current) => ({ ...current, password: '' }));
      setConfirmPassword('');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (selected) return <main className="login-screen">
    <section className="login-art"><a className="brand light" href="#" onClick={(e) => { e.preventDefault(); setSelected(null); }}><img className="brand-logo" src="/zyngram-logo.svg" alt="" /><span>ZYNGRAM</span></a><div className="art-copy"><p className="eyebrow light-eyebrow">YOUR SPACE, YOUR PACE</p><h1>Welcome<br />back to<br /><em>your campus.</em></h1><p>Come as you are. Pick up where you left off.</p></div><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-spark">✳</div><div className="art-foot"><span>DESIGNED FOR THE IN-BETWEEN</span><span>HYDERABAD · INDIA</span></div></section>
    <section className="login-panel"><div className="login-content"><button className="back-link" onClick={() => { setSelected(null); setError(''); }}><ArrowRight className="back-arrow" size={15} /> All portals</button><span className="demo-pill"><span className="pulse-dot" /> {registrationOpen ? 'STUDENT REGISTRATION' : `${PORTALS.find((p) => p.role === selected)?.title.toUpperCase()} PORTAL`}</span><h2>    {registrationOpen ? registrationDone ? 'Your ZIN ID is ready.' : 'Create your ZIN ID.' : <>Good to have<br />you back.</>}</h2><p className="muted login-intro">{registrationOpen ? registrationDone ? 'Your account is waiting for administrator approval. You can sign in with your ZIN ID after approval.' : 'Create your account with your name and a password. An administrator must approve it before you can sign in.' : 'Sign in with your campus account to continue.'}</p>
      {registrationOpen ? registrationDone
        ? <div className="success-message" role="status"><b>Your ZIN ID is ready.</b><p>Your student account is pending administrator approval. You can sign in only after the campus team approves your request.</p>{registrationAccount && <><div className="registration-credential"><small>ZIN ID</small><strong>{registrationAccount.zinId}</strong></div><div className="registration-credential"><small>ZYNGRAM LOGIN EMAIL</small><strong>{registrationAccount.email}</strong></div></>}{registrationNotice && <p>{registrationNotice}</p>}<button className="button-secondary" onClick={() => { setRegistrationOpen(false); setRegistrationDone(false); setRegistrationNotice(''); setRegistrationAccount(null); setError(''); }}>Back to sign in</button></div>
        : <form className="credential-form" onSubmit={submitRegistration}>
          <label htmlFor="registration-name">Full name</label><input id="registration-name" required minLength={2} maxLength={100} value={registration.name} onChange={(e) => setRegistration({ ...registration, name: e.target.value })} />
          <label htmlFor="registration-password">Create password</label><input id="registration-password" type="password" autoComplete="new-password" required minLength={12} maxLength={200} value={registration.password} onChange={(e) => setRegistration({ ...registration, password: e.target.value })} />
          <label htmlFor="registration-confirm-password">Confirm password</label><input id="registration-confirm-password" type="password" autoComplete="new-password" required minLength={12} maxLength={200} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          <small className="registration-hint">Use at least 12 characters. We’ll create your unique ZIN ID; login becomes available after administrator approval.</small>
          {error && <p className="error-message" role="alert">{error}</p>}<button className="button-dark full-width" disabled={busy}>{busy ? 'Creating your ZIN ID…' : 'Create ZIN ID'} <ArrowRight size={16} /></button>
          <button className="demo-switch" type="button" onClick={() => { setRegistrationOpen(false); setError(''); }}>Back to student sign in</button>
        </form>
        : <form className="credential-form" onSubmit={signIn}>
        {selected === 'trainer' && trainerAccounts.length > 1 && <><label htmlFor="trainer-account">Choose trainer profile</label><select id="trainer-account" value={trainerAccounts.some((trainer) => trainer.email === email) ? email : ''} onChange={(e) => { setEmail(e.target.value); setPassword(''); setError(''); }} required><option value="" disabled>Select your trainer account</option>{trainerAccounts.map((trainer) => <option key={trainer.id} value={trainer.email}>{trainer.name} · {trainer.email}</option>)}</select></>}
        <label htmlFor="login-email">{selected === 'student' ? 'Your ZIN ID or @zyngram.com email' : 'Campus email'}</label><input id="login-email" type={selected === 'student' ? 'text' : 'email'} autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={selected === 'student' ? 'Your name-based ZIN ID' : 'you@campus.edu'} />
        <label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
        {error && <p className="error-message" role="alert">{error}</p>}<button className="button-dark full-width" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={16} /></button>
      </form>}
      {selected === 'student' && !registrationOpen && <button className="demo-switch" onClick={() => { setRegistrationOpen(true); setError(''); }}>New student? Create a ZIN ID</button>}
      {users.length > 0 && !registrationOpen && <><button className="demo-switch" onClick={() => setMode(mode === 'credentials' ? 'demo' : 'credentials')}>{mode === 'credentials' ? 'Exploring the prototype? Try sample access' : 'Back to campus sign in'}</button>{mode === 'demo' && <div className="demo-roles"><p className="field-label">SAMPLE DATA · DEVELOPMENT ONLY</p>{PORTALS.map((p) => <button className="demo-role-button" key={p.role} disabled={busy} onClick={() => demo(p.role)}><span>{p.title}</span><ArrowRight size={15} /></button>)}</div>}</>}
      <p className="login-privacy"><ShieldCheck size={15} /> Your learning records stay private.</p>
    </div><footer className="login-footer">A learning community by <strong>Zyngram</strong><span>v1.0 · Prototype</span></footer></section>
  </main>;
  return <main className="landing-screen"><header className="landing-header"><a className="brand" href="#"><img className="brand-logo" src="/zyngram-logo.svg" alt="" /><span>ZYNGRAM</span></a><Badge tone="subtle">CAMPUS HUB</Badge></header><section className="landing-main"><div className="landing-intro"><p className="eyebrow">ONE CAMPUS · MANY WAYS TO GROW</p><h1>What brings<br />you <em>in today?</em></h1><p>Choose your space. Your campus experience starts here.</p></div><div className="portal-grid">{PORTALS.map(({ role, title, text, icon: Icon }) => <button className="portal-card" key={role} onClick={() => choose(role)}><span className="portal-icon"><Icon size={23} /></span><span className="portal-copy"><b>{title}</b><small>{text}</small></span><ArrowRight size={19} /></button>)}</div><p className="landing-note"><ShieldCheck size={15} /> Secure access for the people who make your campus.</p></section><footer className="landing-footer"><span>© 2026 ZYNGRAM CAMPUS HUB</span><span>THOUGHTFULLY BUILT FOR LEARNING <i>✳</i></span></footer></main>;
}
function AcceptInvitation({ token, onComplete }) {
  const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [accepted, setAccepted] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);
    try {
      await api('/auth/accept-invite', { method: 'POST', body: JSON.stringify({ token, password }) });
      setAccepted(true);
    } catch (acceptError) {
      setError(acceptError.message);
    } finally {
      setBusy(false);
    }
  }
  return <main className="login-screen"><section className="login-art"><a className="brand light" href="/"><img className="brand-logo" src="/zyngram-logo.svg" alt="" /><span>ZYNGRAM</span></a><div className="art-copy"><p className="eyebrow light-eyebrow">YOUR SPACE, YOUR PACE</p><h1>Make this<br />space <em>yours.</em></h1><p>Set a password to begin your campus journey.</p></div><div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" /><div className="art-spark">✳</div></section><section className="login-panel"><div className="login-content"><span className="demo-pill"><span className="pulse-dot" /> ACCOUNT SETUP</span><h2>{accepted ? 'You’re all set.' : 'Choose a password.'}</h2><p className="muted login-intro">{accepted ? 'Your account is ready. Sign in with the portal role your campus assigned.' : 'Use at least 12 characters. This one-time link expires after 48 hours.'}</p>{accepted ? <button className="button-dark full-width" onClick={onComplete}>Continue to sign in <ArrowRight size={16} /></button> : <form className="credential-form" onSubmit={submit}><label htmlFor="invite-password">New password</label><input id="invite-password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required value={password} onChange={(e) => setPassword(e.target.value)} /><label htmlFor="invite-confirm">Confirm password</label><input id="invite-confirm" type="password" autoComplete="new-password" minLength={12} maxLength={200} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />{error && <p className="error-message" role="alert">{error}</p>}<button className="button-dark full-width" disabled={busy}>{busy ? 'Setting up…' : 'Set password'} <ArrowRight size={16} /></button></form>}<p className="login-privacy"><ShieldCheck size={15} /> This one-time setup link can only be used once.</p></div><footer className="login-footer">A learning community by <strong>Zyngram</strong><span>Secure account setup</span></footer></section></main>;
}
export default function App() {
  const [user, setUser] = useState(null); const [data, setData] = useState(null); const [page, setPage] = useState('overview');
  const [learningCourseId, setLearningCourseId] = useState('');
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState(''); const [mobileOpen, setMobileOpen] = useState(false); const [toast, setToast] = useState('');
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(window.location.search).get('invite'));
  const notify = useCallback((message) => { setToast(message); window.setTimeout(() => setToast(''), 3600); }, []);
  const refresh = useCallback(async () => { const dashboard = await api('/dashboard'); setUser(dashboard.user); setData(dashboard); }, []);
  useEffect(() => {
    api('/auth/session')
      .then(({ user: activeUser }) => activeUser ? refresh() : null)
      .catch((e) => setLoadError(e.message))
      .finally(() => setLoading(false));
  }, [refresh]);
  function finishInvitation() {
    window.history.replaceState({}, '', window.location.pathname);
    setInviteToken(null);
    setUser(null);
    setData(null);
    setPage('overview');
  }
  async function signIn(credentials) {
    if (credentials.demo) await api('/auth/demo', { method: 'POST', body: JSON.stringify({ role: credentials.role }) });
    else await api('/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
    await refresh();
  }
  async function signOut() { try { await api('/auth/logout', { method: 'POST' }); setUser(null); setData(null); setPage('overview'); } catch (e) { notify(e.message); } }
  function openCourse(courseId) { setLearningCourseId(courseId); setPage('lessons'); }
  if (inviteToken) return <AcceptInvitation token={inviteToken} onComplete={finishInvitation} />;
  if (loading) return <div className="loading-screen"><img className="brand-logo loading-logo" src="/zyngram-logo.svg" alt="Zyngram" /><p>Making space for your next chapter…</p></div>;
  if (loadError) return <div className="loading-screen"><img className="brand-logo loading-logo" src="/zyngram-logo.svg" alt="Zyngram" /><p role="alert">{loadError}</p><button className="button-primary" onClick={() => window.location.reload()}>Try again</button></div>;
  if (!user || !data) return <Login onLogin={signIn} />;
  let content;
  switch (page) {
    case 'tutorials': content = <Tutorials user={user} />; break;
    case 'live-courses': content = <LiveCourses user={user} notify={notify} />; break;
    case 'courses': content = <Courses data={data} setPage={setPage} user={user} openCourse={openCourse} />; break;
    case 'lessons': content = <CourseMaterials data={data} user={user} notify={notify} initialCourseId={learningCourseId} />; break;
    case 'exams': content = <Exams data={data} user={user} notify={notify} />; break;
    case 'levels': content = <LearningLevels setPage={setPage} />; break;
    case 'internships': content = user.role === 'trainer' ? <div className="page-content"><Heading eyebrow="INTERNSHIP PREPARATION" title="Internship readiness." description="Review learner skills and resumes, schedule mock interviews, and recommend eligible students to the placement team." /><InternshipReadiness data={data} user={user} notify={notify} /></div> : <Internships data={data} user={user} notify={notify} />; break;
    case 'notifications': content = <Notifications notify={notify} />; break;
    case 'attendance': content = <Attendance data={data} user={user} notify={notify} reload={refresh} />; break;
    case 'tasks': content = <Tasks tasks={Array.isArray(data.tasks) ? data.tasks : []} user={user} reload={refresh} notify={notify} />; break;
    case 'progress': content = user.role === 'student' ? <Progress data={data} setPage={setPage} /> : <StaffProgress user={user} />; break;
    case 'announcements': content = <Announcements initial={data.announcements} user={user} notify={notify} courses={data.courses} />; break;
    case 'services': content = <Services />; break;
    case 'support': content = <Support user={user} notify={notify} />; break;
    case 'profile': content = <Profile user={user} />; break;
    case 'audit': content = <Audit notify={notify} />; break;
    case 'users': content = <UserManagement notify={notify} />; break;
    case 'access': content = user.role === 'admin' ? <AccessAndSystem system={data.system} /> : <Overview data={data} user={user} setPage={setPage} openCourse={openCourse} />; break;
    default: content = user.role === 'admin'
      ? <AdminOverview data={data} user={user} setPage={setPage} />
      : <Overview data={data} user={user} setPage={setPage} openCourse={openCourse} />;
  }
  return <div className="app-shell"><Sidebar page={page} setPage={setPage} user={user} data={data} logout={signOut} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} /><div className="main-area"><Header page={page} user={user} setPage={setPage} onMobile={() => setMobileOpen(true)} onSignOut={signOut} /><main key={page} className="main-scroll">{content}</main></div>{toast && <div className="toast" role="status"><CheckCircle2 size={17} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}</div>;
}